import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { emperyTheme } from "@/theme/emperyTheme";
import { useEccStore } from "@/state/store";

interface ThemeContextValue {
  themeName: string;
  reducedMotion: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeName: emperyTheme.name,
  reducedMotion: false,
});

export function useEccTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Injects Signal Obsidian (CSS variables live in tokens.css).
 * Single dark theme for v0.1; syncs prefers-reduced-motion into the store.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const reducedMotion = useEccStore((s) => s.reducedMotion);
  const setReducedMotion = useEccStore((s) => s.setReducedMotion);

  useEffect(() => {
    document.documentElement.dataset.theme = "signal-obsidian";
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [setReducedMotion]);

  const value = useMemo(
    () => ({ themeName: emperyTheme.name, reducedMotion }),
    [reducedMotion],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
