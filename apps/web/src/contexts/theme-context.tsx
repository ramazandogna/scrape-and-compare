"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ═══════════════════════════════════════════
// ThemeContext — light/dark + accent (purple/green)
// ═══════════════════════════════════════════
// Two independent axes:
//   mode    → "light" | "dark"  (toggles CSS .dark class)
//   accent  → "purple" | "green" (data-accent attr; swaps brand CSS vars)
// Persist: localStorage. SSR safe — initial state "light/purple" + read after mount.

export type ThemeMode = "light" | "dark";
export type AccentKey = "purple" | "green";

interface ThemeContextValue {
  mode: ThemeMode;
  accent: AccentKey;
  toggleMode: () => void;
  toggleAccent: () => void;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentKey) => void;
}

const STORAGE_MODE = "scrape:theme-mode";
const STORAGE_ACCENT = "scrape:theme-accent";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_MODE);
  if (stored === "dark" || stored === "light") return stored;
  // System preference
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredAccent(): AccentKey {
  if (typeof window === "undefined") return "purple";
  const stored = window.localStorage.getItem(STORAGE_ACCENT);
  return stored === "green" ? "green" : "purple";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [accent, setAccentState] = useState<AccentKey>("purple");

  // Read from storage after mount — prevents SSR/CSR mismatch
  useEffect(() => {
    setModeState(readStoredMode());
    setAccentState(readStoredAccent());
  }, []);

  // Mode → html.classList
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem(STORAGE_MODE, mode);
    } catch {
      /* private window */
    }
  }, [mode]);

  // Accent → data-accent attr
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    try {
      localStorage.setItem(STORAGE_ACCENT, accent);
    } catch {
      /* */
    }
  }, [accent]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const setAccent = useCallback((a: AccentKey) => setAccentState(a), []);
  const toggleMode = useCallback(
    () => setModeState((m) => (m === "dark" ? "light" : "dark")),
    [],
  );
  const toggleAccent = useCallback(
    () => setAccentState((a) => (a === "purple" ? "green" : "purple")),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, accent, setMode, setAccent, toggleMode, toggleAccent }),
    [mode, accent, setMode, setAccent, toggleMode, toggleAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
