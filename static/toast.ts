interface ToastOptions {
  message: string;
  duration?: number;
}

const toastContainer = () => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-4 right-4 z-100 flex flex-col gap-2';
    document.body.appendChild(container);
  }
  return container;
};

const showToast = ({ message, duration = 3000 }: ToastOptions) => {
  const container = toastContainer();
  const toast = document.createElement('div');
  
  toast.className = 'bg-white/10 border border-white/20 flex items-center gap-3 px-4 py-3 shadow-lg transform transition-all duration-300 translate-y-2 opacity-0';
  toast.innerHTML = `
    <span class="text-sm text-neutral-200">${message}</span>
    <button class="ml-2 opacity-50 hover:opacity-100" onclick="this.parentElement.remove()">
      <svg class="size-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

(window as unknown as Record<string, unknown>).showToast = showToast;

export { showToast };