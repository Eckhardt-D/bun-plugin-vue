# Bun Plugin Vue

A simple Vue plugin for [Bun](https://bun.sh) build, dev server etc. Made to be able to load SFC's into bun's bundler.

> [!IMPORTANT]
> This module is only compatible with the Bun Runtime.

- Script
- Script Setup
- Script with TS
- Styles
- Scoped Styles
- Template

## Installation

```bash
bun add -D @eckidevs/bun-plugin-vue
```

### Typing Vue

If you want to have Vue's types, add a `vue-shim.d.ts` file to the root of your project:

```ts
// vue-shim.d.ts
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, any>;
  export default component;
}
```

## Usage

The following is a quickstart, but see the `examples` directory for full examples.

### In Bun Build

```ts
import vuePlugin from '@eckidevs/bun-plugin-vue'

Bun.build({
  // index.html Imports main.ts where App.vue is setup
  entrypoints: ['./index.html'],
  outdir: './dist',
  plugins: [vuePlugin()],
})
```

### In Bun Full-Stack Dev Server

First create the local plugin file:

```ts
// vue-plugin.ts
import vuePlugin from '@eckidevs/bun-plugin-vue'
export default vuePlugin()
```

Then update `bunfig.toml`

```ts
[serve.static]
plugins = ["./vue-plugin.ts"]
```

## Plugin Options

The plugin has optional settings that you can pass:

```ts
interface VuePluginOptions {
  prodDevTools?: boolean; // Default = false
  optionsApi?: boolean; // Default = false
  prodHydrationMismatchDetails?: boolean; // Default = false
}
```

- `prodDevTools`: If set to `true`, it will enable Vue DevTools in production mode. This is useful for debugging but may expose sensitive information, so use with caution.
- `optionsApi`: If set to `true`, it will enable the Options API in Vue. This is useful if you want to use the Options API instead of the Composition API.
- `prodHydrationMismatchDetails`: If set to `true`, it will provide detailed error messages for hydration mismatches in production mode. This is useful for debugging hydration issues but may expose sensitive information, so use with caution.


## Known Issues


### Hot Reloading Error Logs

Because bun implements hot reloading in the Full-Stack Dev Server to eliminate
HMR error logs, add the following to the main.ts where your vue app is created:

```ts
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);

// The important part for HMR
if (import.meta.hot) {
  import.meta.hot.on('bun:invalidate', () => {
    app.unmount();
  })
  import.meta.hot.accept()
}

app.mount('#app');
```

This HMR code will be dead-code eliminated during production.



