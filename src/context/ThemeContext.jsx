import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'setting_dark_mode';

const ThemeContext = createContext({ dark: false, setDark: () => {}, toggleDark: () => {} });

export function ThemeProvider({ children }) {
  const [dark, setDarkState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === 'true';
      // Fall back to the OS/browser preference the first time the app loads.
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
    } catch {
      return false;
    }
  });

  // Reflect the current mode on <html> so every `dark:` Tailwind utility,
  // and the global overrides in index.css, pick it up immediately.
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [dark]);

  const setDark = (value) => {
    setDarkState(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  };

  const toggleDark = () => setDark(!dark);

  return (
    <ThemeContext.Provider value={{ dark, setDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
