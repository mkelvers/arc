export {};

const onReady = (fn: () => void): void => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
    return;
  }

  fn();
};

const isMobileViewport = (): boolean => window.matchMedia('(max-width: 1023px)').matches;

const initSidebarTransitions = (): void => {
  requestAnimationFrame(() => {
    document.documentElement.classList.add('sidebar-ready');
  });
};

const initMobileMenu = (): void => {
  const menu = document.getElementById('mobile-menu');
  const backdrop = document.getElementById('mobile-menu-backdrop');
  const toggle = document.querySelector('[data-mobile-menu-toggle]');

  if (!(menu instanceof HTMLElement)) return;
  if (!(backdrop instanceof HTMLElement)) return;
  if (!(toggle instanceof HTMLElement)) return;

  const body = document.body;
  let lastFocused: HTMLElement | null = null;

  const setOpen = (nextOpen: boolean): void => {
    menu.dataset.mobileOpen = nextOpen ? 'true' : 'false';
    backdrop.dataset.mobileOpen = nextOpen ? 'true' : 'false';
    backdrop.classList.toggle('hidden', !nextOpen);
    toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    body.classList.toggle('overflow-hidden', nextOpen);
  };

  const openMenu = (): void => {
    if (!isMobileViewport()) return;
    if (menu.dataset.mobileOpen === 'true') return;

    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);

    const focusTarget = menu.querySelector<HTMLElement>(
      'a, button, input, [tabindex]:not([tabindex="-1"])'
    );
    focusTarget?.focus();
  };

  const closeMenu = (): void => {
    if (menu.dataset.mobileOpen !== 'true') return;
    setOpen(false);
    lastFocused?.focus();
  };

  toggle.addEventListener('click', () => {
    if (menu.dataset.mobileOpen === 'true') {
      closeMenu();
      return;
    }

    openMenu();
  });

  backdrop.addEventListener('click', closeMenu);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (menu.dataset.mobileOpen !== 'true') return;
    event.preventDefault();
    closeMenu();
  });

  menu.querySelectorAll<HTMLElement>('a, button').forEach(el => {
    el.addEventListener('click', () => {
      if (!isMobileViewport()) return;
      closeMenu();
    });
  });

  window.addEventListener('resize', () => {
    if (!isMobileViewport()) {
      setOpen(false);
    }
  });
};

onReady(() => {
  initSidebarTransitions();
  initMobileMenu();
});
