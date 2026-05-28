class UIDropdown extends HTMLElement {
  isOpen = false;
  contentEl: HTMLElement | null = null;
  isClosing = false; // debounce flag

  constructor() {
    super();
    this.toggle = this.toggle.bind(this);
    this.handleClickOutside = this.handleClickOutside.bind(this);
  }

  connectedCallback(): void {
    const trigger = this.querySelector("[data-trigger]");
    this.contentEl = this.querySelector("[data-content]");

    if (trigger) {
      trigger.addEventListener("click", this.toggle);
    }

    document.addEventListener("click", this.handleClickOutside);
  }

  disconnectedCallback(): void {
    const trigger = this.querySelector("[data-trigger]");
    if (trigger) {
      trigger.removeEventListener("click", this.toggle);
    }
    document.removeEventListener("click", this.handleClickOutside);
  }

  toggle(): void {
    if (this.isClosing) {
      return;
    }
    this.isOpen = !this.isOpen;
    if (this.contentEl) {
      if (this.isOpen) {
        this.contentEl.classList.remove("hidden");
      } else {
        this.contentEl.classList.add("hidden");
      }
    }
  }

  close(): void {
    if (this.isClosing) {
      return;
    }
    this.isClosing = true;
    this.isOpen = false;
    if (this.contentEl) {
      this.contentEl.classList.add("hidden");
    }
    setTimeout(() => {
      this.isClosing = false;
    }, 100); // delay prevents rapid open/close flicker
  }

  handleClickOutside(event: MouseEvent): void {
    if (!this.contains(event.target as Node)) {
      this.close();
    }
  }
}

customElements.define("ui-dropdown", UIDropdown);

const initStudioDropdown = (): void => {
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const btn = target.closest<HTMLButtonElement>("button[data-studio-select]");
    if (!btn) return;

    const input = document.getElementById("studio-input") as HTMLInputElement | null;
    const form = document.getElementById("browse-search-form") as HTMLFormElement | null;
    if (!input || !form) return;

    input.value = btn.dataset.studioSelect ?? "";
    form.requestSubmit();

    const dropdown = btn.closest("ui-dropdown") as { close?: () => void } | null;
    dropdown?.close?.();
  });
};

initStudioDropdown();
