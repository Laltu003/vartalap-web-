import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function useTheme() {
  return useContext(ThemeContext);
}

// mode: 'light' | 'dark' | 'system'
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('vartalap-theme') || 'system');
  const [resolvedTheme, setResolvedTheme] = useState('light');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme() {
      let actual = mode;
      if (mode === 'system') {
        actual = mq.matches ? 'dark' : 'light';
      }
      setResolvedTheme(actual);
      document.documentElement.setAttribute('data-theme', actual);
    }

    applyTheme();
    mq.addEventListener('change', applyTheme);
    return () => mq.removeEventListener('change', applyTheme);
  }, [mode]);

  function setThemeMode(newMode) {
    setMode(newMode);
    localStorage.setItem('vartalap-theme', newMode);
  }

  return (
    <ThemeContext.Provider value={{ mode, resolvedTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
