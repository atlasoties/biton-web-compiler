// Light, dark, or follow the system. The choice is kept in localStorage;
// public/theme-init.js applies it before the app loads.

import { useCallback, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const KEY = "biton-web-compiler:theme";
const media = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const resolve = (pref: ThemePref): Theme => (pref === "system" ? (media()?.matches ? "dark" : "light") : pref);

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", theme === "dark" ? "#111419" : "#ffffff");
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(loadThemePref);
  const [theme, setTheme] = useState<Theme>(() => resolve(pref));

  useEffect(() => {
    const update = () => {
      const t = resolve(pref);
      setTheme(t);
      apply(t);
    };
    update();
    const m = media();
    if (pref !== "system" || !m) return;
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [pref]);

  // Another tab changed the theme.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === KEY && setPrefState(loadThemePref());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      if (p === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* not saved */
    }
  }, []);

  return { pref, theme, setPref };
}
