export type ThemeMode = 'light' | 'highContrast' | 'blackYellow' | 'custom';
export type ThemeColors = { background: string; card: string; cardElevated: string; input: string; glass: string; text: string; textMuted: string; border: string; accent: string; accentSoft: string; success: string; danger: string; overlay: string; buttonText: string; notesAccent: string; journalAccent: string };
export type CustomThemeColors = { background: string; text: string };

export const palettes: Record<Exclude<ThemeMode, 'custom'>, ThemeColors> = {
  light: { background: '#F4F4F5', card: 'rgba(255,255,255,0.82)', cardElevated: 'rgba(255,255,255,0.94)', input: 'rgba(255,255,255,0.58)', glass: 'rgba(255,255,255,0.68)', text: '#18181B', textMuted: '#71717A', border: 'rgba(24,24,27,0.11)', accent: '#3478F6', accentSoft: 'rgba(52,120,246,0.12)', success: '#248A3D', danger: '#D70015', overlay: 'rgba(9,9,11,0.42)', buttonText: '#FFFFFF', notesAccent: '#EAB308', journalAccent: '#8B5CF6' },
  highContrast: { background: '#09090B', card: 'rgba(24,24,27,0.78)', cardElevated: 'rgba(39,39,42,0.86)', input: 'rgba(255,255,255,0.055)', glass: 'rgba(24,24,27,0.68)', text: '#FAFAFA', textMuted: '#A1A1AA', border: 'rgba(255,255,255,0.10)', accent: '#60A5FA', accentSoft: 'rgba(96,165,250,0.14)', success: '#34D399', danger: '#FB7185', overlay: 'rgba(9,9,11,0.72)', buttonText: '#FFFFFF', notesAccent: '#FACC15', journalAccent: '#A78BFA' },
  blackYellow: { background: '#09090B', card: 'rgba(24,24,27,0.82)', cardElevated: 'rgba(39,39,42,0.9)', input: 'rgba(255,214,10,0.055)', glass: 'rgba(24,24,27,0.72)', text: '#FAFAFA', textMuted: '#A1A1AA', border: 'rgba(255,255,255,0.10)', accent: '#FFD60A', accentSoft: 'rgba(255,214,10,0.14)', success: '#FFD60A', danger: '#FB7185', overlay: 'rgba(9,9,11,0.78)', buttonText: '#09090B', notesAccent: '#FFD60A', journalAccent: '#FFD60A' },
};

export function createCustomPalette(custom: CustomThemeColors): ThemeColors {
  return { background: custom.background, card: `${custom.text}0F`, cardElevated: `${custom.text}18`, input: `${custom.text}0D`, glass: `${custom.background}D6`, text: custom.text, textMuted: `${custom.text}A8`, border: `${custom.text}1A`, accent: custom.text, accentSoft: `${custom.text}18`, success: '#34D399', danger: '#FB7185', overlay: 'rgba(9,9,11,0.72)', buttonText: custom.background, notesAccent: '#FACC15', journalAccent: '#A78BFA' };
}

export const priorityColors = { red: '#FF453A', yellow: '#FFD60A', blue: '#0A84FF', green: '#30D158' } as const;
export const priorityLabels = { red: 'Urgent & important', yellow: 'Important', blue: 'Urgent', green: 'Later' } as const;
export const priorityShortLabels = { red: 'NOW', yellow: 'PLAN', blue: 'SOON', green: 'LATER' } as const;
export const typography = {
  display: 'System', family: 'System', largeTitle: 34, title: 28, heading: 20,
  subheading: 16, body: 15, callout: 13, caption: 11,
} as const;
export const radii = { small: 10, medium: 14, large: 20, sheet: 24 } as const;
export const softShadow = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 } as const;
export const layout = { maxWidth: 1080, tabBarHeight: 72, radius: 20, gutter: 20 } as const;
export const motion = { pressScale: 0.96, pressOpacity: 0.8, spring: { damping: 12, stiffness: 280, mass: 0.72 }, spatialSpring: { damping: 16, stiffness: 220, mass: 0.86 }, fast: 140, standard: 300, stagger: 40 } as const;
