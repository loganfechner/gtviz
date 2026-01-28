import { writable } from 'svelte/store';

function createToastStore() {
  const { subscribe, update } = writable([]);

  let nextId = 0;

  return {
    subscribe,
    show(message, duration = 2000) {
      const id = nextId++;
      update(toasts => [...toasts, { id, message }]);

      setTimeout(() => {
        update(toasts => toasts.filter(t => t.id !== id));
      }, duration);
    }
  };
}

export const toast = createToastStore();
