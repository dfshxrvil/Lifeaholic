import { BarChart3, Minus, TrendingDown, TrendingUp, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { AppModal } from '@/components/ui/AppModal';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { formatPaiseAsInr, getExpenseSpendMinor } from '@/domain/finance';
import { useFinanceAnalytics } from '@/hooks/finance/useFinanceAnalytics';
import type { FinanceAnalyticsScope } from '@/hooks/finance/useFinanceAnalytics';
import type { FinanceCategory, FinanceId } from '@/types/finance';

type AnalyticsTab = 'overview' | 'categories' | 'trends';

const CATEGORY_COLORS: Record<FinanceCategory, string> = {
  Food: '#FF9F0A',
  'Online shopping': '#AF52DE',
  Investments: '#30D158',
  Laundry: '#64D2FF',
  Drinks: '#FF375F',
  Grocery: '#34C759',
  Other: '#8E8E93',
};

function formatBasisPoints(value: bigint): string {
  const sign = value > 0n ? '+' : value < 0n ? '−' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  return `${sign}${whole}${fraction === 0n ? '' : `.${fraction.toString().padStart(2, '0').replace(/0$/, '')}`}%`;
}

function basisPointsToPercent(value: bigint): number {
  const bounded = value < 0n ? 0n : value > 10_000n ? 10_000n : value;
  return Number(bounded) / 100;
}

export function AnalyticsModal({
  visible,
  onClose,
  month,
  scope,
  groupId,
  groupName,
}: {
  visible: boolean;
  onClose: () => void;
  month: string;
  scope: FinanceAnalyticsScope;
  groupId?: FinanceId | null;
  groupName?: string | null;
}) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const analytics = useFinanceAnalytics({ month, scope, groupId });
  const [tab, setTab] = useState<AnalyticsTab>('overview');
  const [selectedCategory, setSelectedCategory] = useState<FinanceCategory>('Food');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(300);

  useEffect(() => { if (visible) { setTab('overview'); setSelectedCategory('Food'); setSelectedDay(null); } }, [groupId, month, scope, visible]);

  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const activeLabel = scope === 'personal' ? 'Personal expenses' : groupName ?? 'All groups';
  const categoryExpenses = useMemo(() => analytics.expenses.filter((expense) => expense.category === selectedCategory), [analytics.expenses, selectedCategory]);
  const selectedDayExpenses = useMemo(() => selectedDay === null ? [] : analytics.expenses.filter((expense) => Number(expense.expenseDate.slice(8, 10)) === selectedDay), [analytics.expenses, selectedDay]);
  const maxDaily = analytics.daily.reduce((maximum, entry) => entry.amountMinor > maximum ? entry.amountMinor : maximum, 0n);
  const selectedDaily = selectedDay === null ? null : analytics.daily[selectedDay - 1] ?? null;
  const mom = analytics.monthly.monthOverMonthBasisPoints;
  const MomIcon = mom === null || mom === 0n ? Minus : mom > 0n ? TrendingUp : TrendingDown;
  const amountFor = (expense: (typeof analytics.expenses)[number]) => getExpenseSpendMinor(expense, scope === 'group' ? user?.id : undefined);
  const onChartLayout = (event: LayoutChangeEvent) => setChartWidth(Math.max(260, Math.floor(event.nativeEvent.layout.width)));

  const overview = <View style={styles.sectionStack}>
    <View style={[styles.heroCard, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
      <Text style={[styles.eyebrow, { color: colors.textMuted }]}>TOTAL SPENT · {monthLabel.toUpperCase()}</Text>
      <Text style={[styles.heroAmount, { color: colors.text }]}>{formatPaiseAsInr(analytics.monthly.totalSpentMinor)}</Text>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryMetric}><Text style={[styles.metricLabel, { color: colors.textMuted }]}>DAILY RUN RATE</Text><Text style={[styles.metricValue, { color: colors.text }]}>{formatPaiseAsInr(analytics.monthly.averageDailySpendMinor)}</Text><Text style={[styles.metricHint, { color: colors.textMuted }]}>{analytics.monthly.daysElapsed} days elapsed</Text></View>
        <View style={styles.summaryMetric}><Text style={[styles.metricLabel, { color: colors.textMuted }]}>MONTH OVER MONTH</Text><View style={[styles.momBadge, { backgroundColor: mom !== null && mom > 0n ? `${colors.danger}1F` : `${colors.success}1F` }]}><MomIcon size={14} color={mom !== null && mom > 0n ? colors.danger : colors.success} /><Text style={{ color: mom !== null && mom > 0n ? colors.danger : colors.success, fontSize: 11, fontWeight: '800' }}>{mom === null ? 'No prior spend' : `${formatBasisPoints(mom)} vs last month`}</Text></View><Text style={[styles.metricHint, { color: colors.textMuted }]}>{formatPaiseAsInr(analytics.monthly.previousMonthSpentMinor)} previously</Text></View>
      </View>
    </View>

    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>Personal vs group share</Text>
      <View style={[styles.splitTrack, { backgroundColor: colors.input }]}><View style={[styles.splitPersonal, { backgroundColor: colors.accent, width: `${basisPointsToPercent(analytics.sources.personalShareBasisPoints)}%` }]} /><View style={[styles.splitGroup, { backgroundColor: colors.success, width: `${basisPointsToPercent(analytics.sources.groupShareBasisPoints)}%` }]} /></View>
      <View style={styles.splitLegend}><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.accent }]} /><View><Text style={[styles.legendLabel, { color: colors.textMuted }]}>Personal</Text><Text style={[styles.legendAmount, { color: colors.text }]}>{formatPaiseAsInr(analytics.sources.personalMinor)}</Text></View></View><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.success }]} /><View><Text style={[styles.legendLabel, { color: colors.textMuted }]}>Your group share</Text><Text style={[styles.legendAmount, { color: colors.text }]}>{formatPaiseAsInr(analytics.sources.groupShareMinor)}</Text></View></View></View>
    </View>

    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>Top outflows</Text>
      {analytics.topOutflows.length ? analytics.topOutflows.map((expense, index) => <View key={expense.id} style={[styles.outflowRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}><View style={[styles.rank, { backgroundColor: colors.accentSoft }]}><Text style={{ color: colors.accent, fontWeight: '800' }}>{index + 1}</Text></View><View style={styles.rowMain}><Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>{expense.description}</Text><Text style={[styles.rowMeta, { color: colors.textMuted }]}>{expense.category} · {expense.expenseDate.slice(8, 10)} {monthLabel.split(' ')[0]}</Text></View><Text style={[styles.rowAmount, { color: colors.text }]}>{formatPaiseAsInr(amountFor(expense))}</Text></View>) : <Text style={[styles.emptyText, { color: colors.textMuted }]}>No outflows recorded this month.</Text>}
    </View>
  </View>;

  const categories = <View style={styles.sectionStack}>
    <Text style={[styles.sectionIntro, { color: colors.textMuted }]}>Tap a category to inspect its transactions.</Text>
    {analytics.categories.map((entry) => {
      const selected = entry.category === selectedCategory;
      const categoryColor = CATEGORY_COLORS[entry.category];
      return <AnimatedPressable key={entry.category} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedCategory(entry.category)} style={[styles.categoryCard, { backgroundColor: selected ? colors.accentSoft : colors.card, borderColor: selected ? colors.accent : colors.border }]}>
        <View style={styles.categoryHeader}><View style={styles.categoryName}><View style={[styles.dot, { backgroundColor: categoryColor }]} /><Text style={[styles.rowTitle, { color: colors.text }]}>{entry.category}</Text></View><View style={styles.categoryValue}><Text style={[styles.rowAmount, { color: colors.text }]}>{formatPaiseAsInr(entry.amountMinor)}</Text><Text style={[styles.percent, { color: colors.textMuted }]}>{formatBasisPoints(entry.shareBasisPoints).replace('+', '')}</Text></View></View>
        <View style={[styles.progressTrack, { backgroundColor: colors.input }]}><View style={[styles.progressFill, { backgroundColor: categoryColor, width: `${basisPointsToPercent(entry.shareBasisPoints)}%` }]} /></View>
      </AnimatedPressable>;
    })}
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.text }]}>{selectedCategory} transactions</Text>{categoryExpenses.length ? categoryExpenses.map((expense) => <View key={expense.id} style={styles.compactRow}><View style={styles.rowMain}><Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>{expense.description}</Text><Text style={[styles.rowMeta, { color: colors.textMuted }]}>{expense.expenseDate}</Text></View><Text style={[styles.rowAmount, { color: colors.text }]}>{formatPaiseAsInr(amountFor(expense))}</Text></View>) : <Text style={[styles.emptyText, { color: colors.textMuted }]}>No {selectedCategory.toLowerCase()} expenses this month.</Text>}</View>
  </View>;

  const trends = <View style={styles.sectionStack}>
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>Daily spending trajectory</Text>
      <Text style={[styles.sectionIntro, { color: colors.textMuted }]}>Tap a bar to inspect that day.</Text>
      <View onLayout={onChartLayout} style={styles.chartWrap}>
        <Svg width={chartWidth} height={190} viewBox={`0 0 ${chartWidth} 190`}>
          <Line x1="0" y1="155" x2={chartWidth} y2="155" stroke={colors.border} strokeWidth="1" />
          {analytics.daily.map((entry, index) => {
            const slot = chartWidth / analytics.daily.length;
            const barWidth = Math.max(3, slot * 0.58);
            const ratioThousandths = maxDaily === 0n ? 0 : Number((entry.amountMinor * 1000n) / maxDaily);
            const height = Math.max(entry.amountMinor > 0n ? 3 : 0, ratioThousandths * 0.125);
            const x = index * slot + (slot - barWidth) / 2;
            const active = selectedDay === entry.day;
            return <Rect key={entry.day} accessibilityLabel={`Day ${entry.day}, ${formatPaiseAsInr(entry.amountMinor)}`} onPress={() => setSelectedDay(entry.day)} x={x} y={155 - height} width={barWidth} height={height} rx={Math.min(3, barWidth / 2)} fill={active ? colors.success : colors.accent} opacity={active ? 1 : 0.78} />;
          })}
          {analytics.daily.map((entry, index) => (entry.day === 1 || entry.day % 5 === 0 || entry.day === analytics.daily.length) ? <SvgText key={`label-${entry.day}`} x={(index + 0.5) * (chartWidth / analytics.daily.length)} y="177" fontSize="8" fill={colors.textMuted} textAnchor="middle">{entry.day}</SvgText> : null)}
        </Svg>
      </View>
      <View style={[styles.dayDetail, { backgroundColor: colors.input }]}><View><Text style={[styles.metricLabel, { color: colors.textMuted }]}>{selectedDaily ? `DAY ${selectedDaily.day}` : 'SELECT A DAY'}</Text><Text style={[styles.dayAmount, { color: colors.text }]}>{formatPaiseAsInr(selectedDaily?.amountMinor ?? 0n)}</Text></View><Text style={[styles.metricHint, { color: colors.textMuted }]}>{selectedDaily?.transactionCount ?? 0} transactions</Text></View>
      {selectedDayExpenses.map((expense) => <View key={expense.id} style={styles.compactRow}><Text numberOfLines={1} style={[styles.rowTitle, styles.rowMain, { color: colors.text }]}>{expense.description}</Text><Text style={[styles.rowAmount, { color: colors.text }]}>{formatPaiseAsInr(amountFor(expense))}</Text></View>)}
    </View>
  </View>;

  return <AppModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
    <View style={styles.header}><View><Text style={[styles.title, { color: colors.text }]}>Financial Analytics</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>{activeLabel} · {monthLabel}</Text></View><Pressable accessibilityLabel="Close analytics" onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: colors.input }]}><X size={19} color={colors.text} /></Pressable></View>
    <SlidingSegmentedControl value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'categories', label: 'Categories' }, { value: 'trends', label: 'Trends', icon: BarChart3 }]} />
    {analytics.loading && !analytics.expenses.length ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={[styles.emptyText, { color: colors.textMuted }]}>Calculating the full month…</Text></View> : analytics.error ? <View style={styles.loading}><Text style={[styles.error, { color: colors.danger }]}>{analytics.error}</Text><AnimatedPressable onPress={() => void analytics.refresh()} style={[styles.retry, { backgroundColor: colors.accent }]}><Text style={{ color: colors.buttonText, fontWeight: '800' }}>Try again</Text></AnimatedPressable></View> : <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>{tab === 'overview' ? overview : tab === 'categories' ? categories : trends}</ScrollView>}
  </AppModal>;
}

const styles = StyleSheet.create({
  sheet: { height: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontFamily: typography.display, fontSize: 25, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: 14, paddingBottom: 22 },
  sectionStack: { gap: 11 },
  heroCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  heroAmount: { fontSize: 34, fontWeight: '800', marginTop: 4 },
  summaryGrid: { flexDirection: 'row', gap: 10, marginTop: 15 },
  summaryMetric: { flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.65 },
  metricValue: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  metricHint: { fontSize: 9, marginTop: 3 },
  momBadge: { alignSelf: 'flex-start', minHeight: 27, borderRadius: 14, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, padding: 14 },
  cardTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10 },
  splitTrack: { height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden' },
  splitPersonal: { height: '100%' },
  splitGroup: { height: '100%' },
  splitLegend: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 12 },
  legendItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { fontSize: 9, fontWeight: '700' },
  legendAmount: { fontSize: 12, fontWeight: '800', marginTop: 1 },
  outflowRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9 },
  rank: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 12, fontWeight: '700' },
  rowMeta: { fontSize: 9, marginTop: 2 },
  rowAmount: { fontSize: 12, fontWeight: '800' },
  emptyText: { fontSize: 11, lineHeight: 16 },
  sectionIntro: { fontSize: 10, lineHeight: 15 },
  categoryCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  categoryName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryValue: { alignItems: 'flex-end' },
  percent: { fontSize: 9, marginTop: 1 },
  progressTrack: { height: 6, borderRadius: 3, marginTop: 9, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  compactRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chartWrap: { height: 190, marginTop: 2, overflow: 'hidden' },
  dayDetail: { minHeight: 57, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayAmount: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { fontSize: 12, textAlign: 'center' },
  retry: { minHeight: 40, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
});
