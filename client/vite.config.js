import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { config } from '../config.js';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: config.client.port,
    proxy: {
      '/api': config.client.apiUrl,
      '/ws': {
        target: config.client.wsUrl,
        ws: true
      }
    }
  }
});
