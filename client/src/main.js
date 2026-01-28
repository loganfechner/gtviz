import './theme.css';
import { theme } from './lib/theme.js';
import App from './App.svelte';

theme.init();

const app = new App({
  target: document.getElementById('app')
});

export default app;
