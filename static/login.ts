const initPasswordToggle = (): void => {
  document.addEventListener("click", (event) => {
    const { target } = event;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-toggle-password]");
    if (!button) {
      return;
    }

    const field = button.closest("form")?.querySelector<HTMLInputElement>("#password");
    const openEye = button.querySelector<SVGElement>("[data-eye-open]");
    const closedEye = button.querySelector<SVGElement>("[data-eye-closed]");
    if (!(field instanceof HTMLInputElement) || !openEye || !closedEye) {
      return;
    }

    const showPassword = field.type === "password";
    field.type = showPassword ? "text" : "password";
    button.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
    openEye.classList.toggle("hidden", showPassword);
    closedEye.classList.toggle("hidden", !showPassword);
  });
};

initPasswordToggle();
