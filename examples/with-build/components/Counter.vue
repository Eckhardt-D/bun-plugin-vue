<script lang="ts" setup>
import { ref } from 'vue';
const count = ref(0);
</script>

<template>
  <div>
    <p>Count: {{ count }}</p>
    <button @click="count++">Increment</button>
  </div>
</template>
