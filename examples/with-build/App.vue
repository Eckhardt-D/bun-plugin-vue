<script lang="ts" setup>
import Counter from './components/Counter.vue';
import { ref } from 'vue';
const message = ref('Hello, Vue 3 with TypeScript!');
</script>

<template>
  <h1>{{ message }}</h1>
  <Counter />
</template>
