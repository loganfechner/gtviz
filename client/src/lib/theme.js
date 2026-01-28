import { writable } from 'svelte/store';

const STORAGE_KEY = 'gtviz-theme';

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;

  // Check system preference
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function createThemeStore() {
  const { subscribe, set, update } = writable(getInitialTheme());

  return {
    subscribe,
    toggle: () => {
      update(current => {
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(STORAGE_KEY, next);
        document.documentElement.setAttribute('data-theme', next);
        return next;
      });
    },
    set: (value) => {
      if (value === 'light' || value === 'dark') {
        localStorage.setItem(STORAGE_KEY, value);
        document.documentElement.setAttribute('data-theme', value);
        set(value);
      }
    },
    init: () => {
      const theme = getInitialTheme();
      document.documentElement.setAttribute('data-theme', theme);
      set(theme);
    }
  };
}

export const theme = createThemeStore();
