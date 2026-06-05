type Theme = "light" | "dark";

const colorSchemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

const getPreferredTheme = (): Theme => {
  const prefersDark = colorSchemeQuery?.matches ?? false;
  return prefersDark ? "dark" : "light";
};

const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
};

const initTheme = (): void => {
  applyTheme(getPreferredTheme());
  colorSchemeQuery?.addEventListener("change", () => applyTheme(getPreferredTheme()));
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTheme);
} else {
  initTheme();
}
