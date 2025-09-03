import type { BunPlugin } from 'bun';
import * as compiler from '@vue/compiler-sfc';
import * as fs from 'fs';

interface VuePluginOptions {
  prodDevTools?: boolean;
  optionsApi?: boolean;
  prodHydrationMismatchDetails?: boolean;
}

// NOTE: Does not work in Bun's dev server yet, since
// the dev server does not actually respect config mutation.
function setVueCompileTimeFlags(build: Bun.PluginBuilder, options: VuePluginOptions) {
  build.config.define ??= {}
  build.config.define['__VUE_PROD_DEVTOOLS__'] = options.prodDevTools === false ? 'false' : 'true';
  build.config.define['__VUE_OPTIONS_API__'] = options.optionsApi === false ? 'false' : 'true';
  build.config.define['__VUE_PROD_HYDRATION_MISMATCH_DETAILS__'] = options.prodHydrationMismatchDetails === false ? 'false' : 'true';
}

try {
  const ts = await import('typescript');
  compiler.registerTS(() => ts);
} catch {}

export default function plugin(options?: VuePluginOptions): BunPlugin {
  const opts = options || {};

  // Set default options
  Object.assign(opts, {
    prodDevTools: opts.prodDevTools ?? false,
    optionsApi: opts.optionsApi ?? false,
    prodHydrationMismatchDetails: opts.prodHydrationMismatchDetails ?? false,
  })

  return {
    name: 'vue',
    setup(build) {
      setVueCompileTimeFlags(build, opts);

      build.onResolve({ filter: /\.vue/ }, (args) => {
        const paramsString = args.path.split('?')[1];
        const params = new URLSearchParams(paramsString);
        const type = params.get('type');

        const ns = type === 'script'
          ? 'sfc-script'
          : type === 'template'
          ? 'sfc-template'
          : type === 'style'
          ? 'sfc-style'
          : undefined;

        if (ns === undefined) {
          return
        }

        return {
          path: args.path,
          namespace: ns,
        }
      });

      let currentId = 0;

      const idMap = new Map<string, string>();
      const descriptorMap = new Map<string, compiler.SFCDescriptor>();
      const scriptMap = new Map<string, compiler.SFCScriptBlock>();

      build.onLoad({ filter: /.*/,  namespace: 'sfc-script' }, async (args) => {
        const path = args.path.split('?')[0]!;
        const script = scriptMap.get(path);

        if (!script) {
          throw new Error(`[vue-plugin:error] No script block found for ${path}`);
        }

        return {
          contents: script.content,
          // Supports <script lang="ts" setup>
          loader: script.lang === 'ts' ? 'ts' : 'js',
        }
      });

      build.onLoad({ filter: /.*/, namespace: 'sfc-template' }, async (args) => {
        const path = args.path.split('?')[0]!;
        const descriptor = descriptorMap.get(path);

        if (!descriptor) {
          throw new Error(
            `[vue-plugin:error] Template compilation descriptor not found for ${path}`
          );
        }

        const id = idMap.get(path)!;
        const script = scriptMap.get(path)!;

        const template = compiler.compileTemplate({
          id,
          scoped: descriptor.styles.some((s) => s.scoped),
          source: descriptor.template!.content,
          filename: args.path,
          compilerOptions: {
            bindingMetadata: script.bindings,
            // Enable TypeScript support in templates
            expressionPlugins: script.lang === 'ts' ? ['typescript'] : undefined,
          }
        })

        return {
          contents: template.code,
          loader: 'js',
        }
      });

      build.onLoad({ filter: /.*/, namespace: 'sfc-style' }, async (args) => {
        const path = args.path.split('?')[0]!;
        const descriptor = descriptorMap.get(path);
        const id = idMap.get(path)!;

        if (!descriptor) {
          throw new Error(
            `[vue-plugin:error] Style compilation descriptor not found for ${path}`
          );
        }

        const style = compiler.compileStyle({
          id,
          scoped: descriptor.styles.some((s) => s.scoped),
          source: descriptor.styles.map((s) => s.content).join('\n'),
          filename: args.path,
        })

        return {
          contents: style.code,
          loader: 'css',
        }
      });

      build.onLoad({ filter: /\.vue$/ }, async (args) => {
        const file = Bun.file(args.path);
        const source = await file.text();

        const { descriptor, errors } = compiler.parse(source, {
          filename: args.path,
          // TODO: sourcemap
        });

        if (errors.length) {
          console.error(
            `[vue-plugin:error] Errors parsing ${args.path}`,
          );
          throw errors[0]!;
        }

        descriptorMap.set(args.path, descriptor);

        const id = `data-v-${currentId++}`;
        idMap.set(args.path, id);

        if (descriptor.script || descriptor.scriptSetup) {
          const logError = <T>(message: string, value: T): T => {
            console.error(`[vue-plugin:error] ${message}`);
            return value;
          };
          const script = compiler.compileScript(descriptor, {
            id,
            // Provide fs access for type imports in script compilation
            fs: {
              fileExists: fs.existsSync,
              // Prevent error: EISDIR: illegal operation on a directory, read
              readFile: (file: string) => {
                if (fs.lstatSync(file).isDirectory()) {
                  return fs.existsSync(file + '/index.ts')
                    ? fs.readFileSync(file + '/index.ts', 'utf-8')
                    : fs.existsSync(file + '/index.d.ts')
                      ? fs.readFileSync(file + '/index.d.ts', 'utf-8')
                        : logError<string>('Could not resolve directory', '')
                } else {
                  return fs.readFileSync(file, 'utf-8');
                }
              },
            }
          });
          scriptMap.set(args.path, script);
        } else {
          // Fallthrough when <script> is not present
          const script: compiler.SFCScriptBlock = {
            content: '',
            lang: 'js',
            type: 'script',
            loc: {
              start: { line: 0, column: 0, offset: 0 },
              end: { line: 0, column: 0, offset: 0 },
              source: ''
            },
            setup: false,
            bindings: {},
            attrs: {},
          }

          scriptMap.set(args.path, script);
        }

        let code = `import script from "${args.path}?type=script";\n`;

        if (descriptor.styles.length > 0) {
          code += `import "${args.path}?type=style";\n`;
        }

        if (descriptor.template) {
          code += `import { render } from "${args.path}?type=template";\n`;
          code += 'script.render = render;\n';
        }

        code += `export default script;\n`;

        return {
          contents: code,
          loader: 'js',
        }
      });

      // This should be removed once Bun supports build.config.define in dev server
      build.onLoad({ filter: /node_modules\/@vue\/(.*)\.js$/ }, async (args) => {
        const file = Bun.file(args.path);
        let source = await file.text();

        const vueFlags = [
          ['__VUE_PROD_DEVTOOLS__', opts.prodDevTools ? 'true' : 'false'],
          ['__VUE_OPTIONS_API__', opts.optionsApi ? 'true' : 'false'],
          ['__VUE_PROD_HYDRATION_MISMATCH_DETAILS__', opts.prodHydrationMismatchDetails ? 'true' : 'false'],
        ];

        // Replacement is not cached because files can be multiple KiB big
        // and there are only a few Vue files in node_modules.
        for (const [flag, value] of vueFlags) {
          source = source.replaceAll(flag!, value!);
        }

        return {
          contents: source,
          loader: 'js',
        }
      })
    }
  }
}
