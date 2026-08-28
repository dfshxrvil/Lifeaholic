import AsyncStorage from '@react-native-async-storage/async-storage';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CustomThemeColors, createCustomPalette, palettes, ThemeColors, ThemeMode } from '@/constants/theme';

type ThemeContextValue = { theme: ThemeMode; colors: ThemeColors; customColors: CustomThemeColors; setTheme: (mode: ThemeMode) => void; setCustomColors: (colors: CustomThemeColors) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'lifeaholic.theme.v2';
const LEGACY_STORAGE_KEY = 'daylight.theme.v2';
const defaultCustom = { background: '#09090B', text: '#FAFAFA' };

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [customColors, setCustomColorsState] = useState<CustomThemeColors>(defaultCustom);
  useEffect(() => { Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(LEGACY_STORAGE_KEY)]).then(([current, legacy]) => { const saved = current ?? legacy; if (!saved) return; if (!current && legacy) void AsyncStorage.setItem(STORAGE_KEY, legacy); try { const value = JSON.parse(saved) as { mode?: ThemeMode; custom?: CustomThemeColors }; if (value.mode === 'light' || value.mode === 'highContrast' || value.mode === 'blackYellow' || value.mode === 'custom') setThemeState(value.mode); if (value.custom?.background && value.custom?.text) setCustomColorsState(value.custom); } catch { /* Ignore invalid legacy preference. */ } }); }, []);
  const persist = useCallback((mode: ThemeMode, custom: CustomThemeColors) => void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, custom })), []);
  const setTheme = useCallback((mode: ThemeMode) => { setThemeState(mode); persist(mode, customColors); }, [customColors, persist]);
  const setCustomColors = useCallback((custom: CustomThemeColors) => { setCustomColorsState(custom); setThemeState('custom'); persist('custom', custom); }, [persist]);
  const colors = useMemo(() => theme === 'custom' ? createCustomPalette(customColors) : palettes[theme], [theme, customColors]);
  const value = useMemo(() => ({ theme, colors, customColors, setTheme, setCustomColors }), [theme, colors, customColors, setTheme, setCustomColors]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('useTheme must be used inside ThemeProvider'); return value; }
