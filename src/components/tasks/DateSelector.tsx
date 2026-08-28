import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useTheme } from '@/contexts/ThemeContext';
import { addDays, toDateKey } from '@/utils/dates';

const DAYS_BEFORE = 180; const TOTAL_DAYS = 546; const SCROLL_EDGE_GUTTER = 5; const TILE_GAP = 6;
type Props = { selected: string; onSelect: (date: string) => void; initialExpanded?: boolean; dense?: boolean; scrollable?: boolean };

function DateCell({ date, selected, width, tall, dense, onSelect }: { date: Date; selected: string; width?: number; tall?: boolean; dense?: boolean; onSelect: (key: string) => void }) {
  const { colors } = useTheme(); const key = toDateKey(date); const active = key === selected; const today = key === toDateKey(new Date());
  return <AnimatedPressable accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} onPress={() => onSelect(key)} style={[styles.cell, tall && styles.tallCell, dense && styles.denseCell, width ? { width } : styles.compactCell, { backgroundColor: active ? colors.accent : colors.cardElevated, borderColor: active || today ? colors.accent : colors.border }]}> 
    <Text style={[styles.number, tall && styles.tallNumber, dense && styles.denseNumber, { color: active ? colors.buttonText : colors.text }]}>{date.getDate()}</Text><Text style={[styles.day, tall && styles.tallDay, dense && styles.denseDay, { color: active ? colors.buttonText : colors.textMuted }]}>{date.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
  </AnimatedPressable>;
}

export function CalendarBar({ selected, onSelect, initialExpanded = false, dense = false, scrollable = false }: Props) {
  const { colors } = useTheme(); const [expanded, setExpanded] = useState(initialExpanded); const [width, setWidth] = useState(0); const list = useRef<FlatList<Date>>(null);
  const compactDates = useMemo(() => [-1, 0, 1].map((offset) => addDays(new Date(), offset)), []);
  const dates = useMemo(() => { const start = addDays(new Date(), -DAYS_BEFORE); return Array.from({ length: TOTAL_DAYS }, (_, index) => addDays(start, index)); }, []);
  const selectedIndex = Math.max(0, dates.findIndex((item) => toDateKey(item) === selected)); const itemWidth = width ? width / 5 : 58;
  useEffect(() => { if ((!expanded && !scrollable) || !width) return; const visibleOffset = scrollable ? 1 : 2; const timer = setTimeout(() => list.current?.scrollToIndex({ index: Math.max(0, selectedIndex - visibleOffset), animated: false }), 20); return () => clearTimeout(timer); }, [expanded, scrollable, width, selectedIndex]);
  const arrow = (amount: number) => { if (!expanded) { setExpanded(true); return; } const next = dates[Math.max(0, Math.min(dates.length - 1, selectedIndex + amount))]; if (next) onSelect(toDateKey(next)); };
  if (scrollable) {
    const viewportWidth = Math.max(0, Math.floor(width - (SCROLL_EDGE_GUTTER * 2))); const itemWidth = viewportWidth ? Math.floor((viewportWidth - (TILE_GAP * 2)) / 3) : 46; const interval = itemWidth + TILE_GAP;
    return <Animated.View layout={LinearTransition.springify().damping(18)} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.container, styles.scrollContainer, { borderColor: colors.border, backgroundColor: colors.card }]}><FlatList ref={list} data={dates} horizontal keyExtractor={toDateKey} showsHorizontalScrollIndicator={false} removeClippedSubviews={false} decelerationRate="fast" disableIntervalMomentum snapToAlignment="start" snapToInterval={interval} style={[styles.swipeList, { width: viewportWidth }]} contentContainerStyle={styles.scrollContent} getItemLayout={(_, index) => ({ length: interval, offset: interval * index, index })} onScrollToIndexFailed={({ index }) => list.current?.scrollToOffset({ offset: index * interval })} renderItem={({ item }) => <DateCell date={item} selected={selected} width={itemWidth} tall onSelect={onSelect} />} /></Animated.View>;
  }
  return <Animated.View layout={LinearTransition.springify().damping(18)} style={[styles.container, dense && styles.denseContainer, { borderColor: colors.border, backgroundColor: colors.card }]}> 
    <AnimatedPressable accessibilityLabel={expanded ? 'Previous date' : 'Expand dates'} onPress={() => arrow(-1)} style={[styles.arrow, dense && styles.denseArrow]}><ChevronLeft size={dense ? 14 : 18} color={colors.textMuted} /></AnimatedPressable>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.dates}>
      {!expanded ? <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.compact}>{compactDates.map((date) => <DateCell key={toDateKey(date)} date={date} selected={selected} dense={dense} onSelect={onSelect} />)}</Animated.View>
        : <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.expanded, dense && styles.denseExpanded]}><FlatList ref={list} data={dates} horizontal keyExtractor={toDateKey} showsHorizontalScrollIndicator={false} getItemLayout={(_, index) => ({ length: itemWidth, offset: itemWidth * index, index })} onScrollToIndexFailed={({ index }) => list.current?.scrollToOffset({ offset: index * itemWidth })} renderItem={({ item }) => <DateCell date={item} selected={selected} width={itemWidth} dense={dense} onSelect={onSelect} />} /></Animated.View>}
    </View>
    <AnimatedPressable accessibilityLabel={expanded ? 'Next date' : 'Expand dates'} onPress={() => arrow(1)} style={[styles.arrow, dense && styles.denseArrow]}><ChevronRight size={dense ? 14 : 18} color={colors.textMuted} /></AnimatedPressable>
    <AnimatedPressable accessibilityLabel={expanded ? 'Collapse dates' : 'Expand dates'} onPress={() => setExpanded((value) => !value)} style={styles.toggle}>{expanded ? <ChevronUp size={13} color={colors.textMuted} /> : <ChevronDown size={13} color={colors.textMuted} />}</AnimatedPressable>
  </Animated.View>;
}

export const DateSelector = CalendarBar;

const styles = StyleSheet.create({ container: { minHeight: 58, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4, paddingBottom: 5, flexDirection: 'row', alignItems: 'center' }, scrollContainer: { height: 58, marginHorizontal: -2, paddingHorizontal: 0, paddingBottom: 0, justifyContent: 'center', overflow: 'visible' }, swipeList: { flexGrow: 0, alignSelf: 'center', overflow: 'hidden' }, scrollContent: { gap: TILE_GAP, alignItems: 'center' }, denseContainer: { minHeight: 29, borderRadius: 10, paddingBottom: 2 }, dates: { flex: 1, minWidth: 0, alignItems: 'stretch', justifyContent: 'center' }, compact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, expanded: { height: 48, justifyContent: 'center' }, denseExpanded: { height: 24 }, compactCell: { flex: 1 }, cell: { height: 46, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }, tallCell: { height: 49, borderRadius: 14 }, denseCell: { height: 23, borderRadius: 7 }, number: { width: '100%', fontSize: 17, fontWeight: '700', lineHeight: 20, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }, tallNumber: { fontSize: 18, lineHeight: 20, fontWeight: '800' }, denseNumber: { fontSize: 10, lineHeight: 11 }, day: { width: '100%', fontSize: 9, fontWeight: '600', lineHeight: 10, marginTop: 1, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }, tallDay: { fontSize: 9, lineHeight: 10, marginTop: 2, fontWeight: '700' }, denseDay: { fontSize: 6, lineHeight: 7, marginTop: 0 }, arrow: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' }, denseArrow: { width: 23, height: 22 }, toggle: { position: 'absolute', bottom: -1, left: '50%', width: 34, height: 17, marginLeft: -17, alignItems: 'center', justifyContent: 'center' } });
