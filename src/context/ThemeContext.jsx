import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'setting_dark_mode';

const ThemeContext = createContext({ dark: false, setDark: () => {}, toggleDark: () => {} });

export function ThemeProvider({ children }) {
  const [dark, setDarkState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // No OS prefers-color-scheme fallback — app starts in light mode until the user opts in
      return stored === 'true';
    } catch {
      return false;
    }
  });

  // Reflects the mode on <html> so `dark:` Tailwind utilities pick it up immediately
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

  // Syncs other open tabs — localStorage writes alone don't trigger a re-render elsewhere
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
