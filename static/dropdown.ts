import { closestFocusable, onHtmxLoad } from "./utils";

class UIDropdown extends HTMLElement {
  isOpen = false;
  triggerEl: HTMLElement | null = null;
  contentEl: HTMLElement | null = null;
  previouslyFocused: HTMLElement | null = null;

  constructor() {
    super();
    this.onTriggerClick = this.onTriggerClick.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  connectedCallback(): void {
    this.triggerEl = this.querySelector("[data-trigger]");
    this.contentEl = this.querySelector("[data-content]");

    if (this.contentEl) {
      this.contentEl.classList.add("hidden");
      this.contentEl.setAttribute("aria-hidden", "true");
    }

    const triggerButton = this.triggerButton();
    triggerButton?.setAttribute("aria-expanded", "false");

    this.triggerEl?.addEventListener("click", this.onTriggerClick);
    document.addEventListener("click", this.handleDocumentClick);
    document.addEventListener("keydown", this.handleKeydown);
  }

  disconnectedCallback(): void {
    this.triggerEl?.removeEventListener("click", this.onTriggerClick);
    document.removeEventListener("click", this.handleDocumentClick);
    document.removeEventListener("keydown", this.handleKeydown);
  }

  triggerButton(): HTMLButtonElement | null {
    const button = this.triggerEl?.querySelector("button");
    return button instanceof HTMLButtonElement ? button : null;
  }

  open(): void {
    if (!this.contentEl || this.isOpen) return;

    document.querySelectorAll<UIDropdown>("ui-dropdown").forEach((dropdown) => {
      if (dropdown !== this) {
        dropdown.close();
      }
    });

    this.isOpen = true;
    this.previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.contentEl.classList.remove("hidden");
    this.contentEl.setAttribute("aria-hidden", "false");
    this.triggerButton()?.setAttribute("aria-expanded", "true");
    closestFocusable(this.contentEl)?.focus();
  }

  close(options: { restoreFocus?: boolean } = {}): void {
    if (!this.contentEl || !this.isOpen) return;
    this.isOpen = false;
    this.contentEl.classList.add("hidden");
    this.contentEl.setAttribute("aria-hidden", "true");
    this.triggerButton()?.setAttribute("aria-expanded", "false");

    if (options.restoreFocus !== false) {
      this.previouslyFocused?.focus();
    }
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    this.open();
  }

  onTriggerClick(event: Event): void {
    event.preventDefault();
    this.toggle();
  }

  handleDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    if (!(event.target instanceof Node)) return;
    if (this.contains(event.target)) return;
    this.close({ restoreFocus: false });
  }

  handleKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.close();
  }
}

customElements.define("ui-dropdown", UIDropdown);

const initStudioDropdown = (): void => {
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const btn = target.closest<HTMLButtonElement>("button[data-studio-select]");
    if (!btn) return;

    const input = document.getElementById("studio-input");
    const form = document.getElementById("browse-search-form");
    if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return;

    input.value = btn.dataset.studioSelect ?? "";
    form.requestSubmit();

    const dropdown = btn.closest("ui-dropdown");
    if (dropdown instanceof UIDropdown) {
      dropdown.close({ restoreFocus: false });
    }
  });
};

const initCheckboxVisuals = (): void => {
  const syncCheckboxVisual = (input: HTMLInputElement): void => {
    const box = input.nextElementSibling;
    if (!(box instanceof HTMLElement)) return;

    const icon = box.querySelector("svg");
    icon?.classList.toggle("hidden", !input.checked);

    if (input.matches("[data-genre-visual]")) {
      box.classList.toggle("border-accent", input.checked);
      box.classList.toggle("bg-foreground-muted/12", input.checked);
      box.classList.toggle("border-white/45", !input.checked);
      box.classList.toggle("bg-transparent", !input.checked);
      return;
    }

    if (input.matches("[data-sfw-checkbox]")) {
      box.classList.toggle("border-accent", input.checked);
      box.classList.toggle("bg-foreground-muted/12", input.checked);
      box.classList.toggle("border-white/45", !input.checked);
      box.classList.toggle("bg-transparent", !input.checked);
      const value = input.form?.querySelector<HTMLInputElement>("[data-sfw-value]");
      if (value) {
        value.value = String(input.checked);
      }
    }
  };

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-checkbox-visual], [data-sfw-checkbox], [data-genre-visual]")) {
      return;
    }
    syncCheckboxVisual(target);
  });

  onHtmxLoad((root) => {
    root
      .querySelectorAll<HTMLInputElement>(
        "[data-checkbox-visual], [data-sfw-checkbox], [data-genre-visual]",
      )
      .forEach(syncCheckboxVisual);
  });
};

initStudioDropdown();
initCheckboxVisuals();
