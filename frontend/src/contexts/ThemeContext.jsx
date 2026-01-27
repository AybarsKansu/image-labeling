import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

const THEMES = {
    dark: 'dark',
    light: 'light',
    midnight: 'midnight'
};

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('theme');
        return saved && THEMES[saved] ? saved : 'dark';
    });

    useEffect(() => {
        // Remove all theme classes and add current
        document.documentElement.classList.remove('theme-dark', 'theme-light', 'theme-midnight');
        document.documentElement.classList.add(`theme-${theme}`);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const value = {
        theme,
        setTheme,
        themes: Object.keys(THEMES),
        isDark: theme !== 'light'
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export default ThemeContext;
