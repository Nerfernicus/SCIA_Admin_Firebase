import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'setting_dark_mode';

const ThemeContext = createContext({ dark: false, setDark: () => {}, toggleDark: () => {} });

export function ThemeProvider({ children }) {
  const [dark, setDarkState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Only ever trust an explicit saved choice. No OS/browser
      // prefers-color-scheme fallback — the app always starts in light
      // mode until the user turns dark mode on themselves.
      return stored === 'true';
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

  // Keep every open tab/window of the app in sync. Without this, toggling
  // the theme only updates the tab you're in — other tabs (and the
  // sidebar in them) keep whatever mode they mounted with, since
  // localStorage writes don't trigger a React re-render in other tabs
  // unless you're listening for the 'storage' event.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        setDarkState(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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