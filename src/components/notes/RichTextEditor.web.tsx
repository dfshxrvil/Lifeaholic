import { FormEvent, useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';

export function RichTextEditor({ value, onChange, minHeight = 180, style }: { value: string; onChange: (html: string) => void; minHeight?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme(); const editor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editor.current && editor.current.innerHTML !== value) editor.current.innerHTML = value; }, [value]);
  const command = (name: string, argument?: string) => { editor.current?.focus(); document.execCommand(name, false, argument); if (editor.current) onChange(editor.current.innerHTML); };
  return <View style={[styles.shell, { borderColor: colors.border }, style]}><View style={[styles.toolbar, { backgroundColor: colors.cardElevated }]}>{[['B','bold'],['I','italic'],['U','underline'],['Heading','formatBlock','h1'],['Subheading','formatBlock','h2'],['Body','formatBlock','p']].map(([label, action, argument]) => <AnimatedPressable key={`${label}`} onPress={() => command(action!, argument)}><Text style={[styles.tool, { color: colors.text }]}>{label}</Text></AnimatedPressable>)}{['#FFF176','#80DEEA','#F48FB1'].map((color) => <AnimatedPressable key={color} accessibilityLabel={`Highlight ${color}`} onPress={() => command('backColor', color)} style={[styles.swatch, { backgroundColor: color }]} />)}</View><div ref={editor} contentEditable suppressContentEditableWarning onInput={(event: FormEvent<HTMLDivElement>) => onChange(event.currentTarget.innerHTML)} style={{ flex: 1, minHeight, padding: 14, outline: 'none', overflowY: 'auto', background: colors.card, color: colors.text, fontFamily: 'system-ui', fontSize: 16, lineHeight: 1.55 }} /></View>;
}
const styles = StyleSheet.create({ shell: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' }, toolbar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 13, paddingHorizontal: 10 }, tool: { fontSize: 11, fontWeight: '900' }, swatch: { width: 20, height: 20, borderRadius: 6 } });
