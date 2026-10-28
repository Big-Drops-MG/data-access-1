export const THEME_STORAGE_KEY = "theme"

export type ThemeChoice = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export function parseThemeChoice(
  value: string | null | undefined
): ThemeChoice {
  if (value === "light" || value === "dark" || value === "system") {
    return value
  }
  return "system"
}

export const themeBootScript = `(function(){try{var root=document.documentElement;var stored=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var choice=stored==="light"||stored==="dark"||stored==="system"?stored:"system";var resolved=choice==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):choice;root.classList.remove("light","dark");root.classList.add(resolved);root.style.colorScheme=resolved;}catch(e){}})();`
