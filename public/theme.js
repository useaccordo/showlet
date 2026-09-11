(() => {
  const root = document.documentElement;
  const preference = matchMedia("(prefers-color-scheme: dark)");
  let saved;
  try {
    saved = localStorage.getItem("showlet-theme");
  } catch {}
  const apply = (theme) => {
    root.dataset.theme = theme;
    const button = document.querySelector("#theme-toggle");
    if (button) {
      button.textContent = theme === "dark" ? "☀ Light" : "☾ Dark";
      button.setAttribute(
        "aria-label",
        "Switch to " + (theme === "dark" ? "light" : "dark") + " mode",
      );
      button.setAttribute("aria-pressed", String(theme === "dark"));
    }
  };
  apply(
    saved === "dark" || saved === "light"
      ? saved
      : preference.matches
        ? "dark"
        : "light",
  );
  document.addEventListener("DOMContentLoaded", () => {
    apply(root.dataset.theme);
    document.querySelector("#theme-toggle")?.addEventListener("click", () => {
      saved = root.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("showlet-theme", saved);
      } catch {}
      apply(saved);
    });
  });
  preference.addEventListener("change", () => {
    if (!saved) apply(preference.matches ? "dark" : "light");
  });
})();
