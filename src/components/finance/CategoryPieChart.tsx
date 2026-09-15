import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useTheme } from '@/contexts/ThemeContext';
import { calculateCategoryPieBreakdown, formatPaiseAsInr } from '@/domain/finance';
import type { FinanceCategory, FinanceExpense, FinanceId } from '@/types/finance';

export const FINANCE_CATEGORY_COLORS: Record<FinanceCategory, string> = {
  Food: '#FF9F0A',
  'Online shopping': '#AF52DE',
  Investments: '#30D158',
  Laundry: '#64D2FF',
  Drinks: '#FF375F',
  Grocery: '#34C759',
  Other: '#8E8E93',
};

const SIZE = 210;
const CENTER = SIZE / 2;
const RADIUS = 72;
const STROKE_WIDTH = 27;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function chartRatio(basisPoints: bigint): number {
  const bounded = basisPoints < 0n ? 0n : basisPoints > 10_000n ? 10_000n : basisPoints;
  return Number(bounded) / 10_000;
}

export function CategoryPieChart({
  expenses,
  userId,
  selectedCategory,
  onSelectCategory,
}: {
  expenses: readonly FinanceExpense[];
  userId?: FinanceId;
  selectedCategory?: FinanceCategory;
  onSelectCategory?: (category: FinanceCategory) => void;
}) {
  const { colors } = useTheme();
  const breakdown = useMemo(() => calculateCategoryPieBreakdown(expenses, userId), [expenses, userId]);
  const visibleSlices = breakdown.slices.filter((slice) => slice.amountMinor > 0n);

  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.chartContainer} accessibilityLabel={`Total monthly spend ${formatPaiseAsInr(breakdown.totalMonthlySpendMinor)}`}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={colors.input} strokeWidth={STROKE_WIDTH} />
        {visibleSlices.map((slice, index) => {
          const ratio = chartRatio(slice.shareBasisPoints);
          const arcLength = ratio * CIRCUMFERENCE;
          const precedingBasisPoints = visibleSlices.slice(0, index).reduce((sum, entry) => sum + entry.shareBasisPoints, 0n);
          const dashOffset = -chartRatio(precedingBasisPoints) * CIRCUMFERENCE;
          return <Circle
            key={slice.category}
            accessibilityLabel={`${slice.category}, ${slice.percentage.toString()}%, ${formatPaiseAsInr(slice.amountMinor)}`}
            onPress={() => onSelectCategory?.(slice.category)}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={FINANCE_CATEGORY_COLORS[slice.category]}
            strokeWidth={selectedCategory === slice.category ? STROKE_WIDTH + 5 : STROKE_WIDTH}
            strokeDasharray={`${arcLength} ${Math.max(0, CIRCUMFERENCE - arcLength)}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
            rotation={-90}
            origin={`${CENTER}, ${CENTER}`}
          />;
        })}
      </Svg>
      <View pointerEvents="none" style={styles.centerLabel}>
        <Text style={[styles.centerCaption, { color: colors.textMuted }]}>MONTHLY TOTAL</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.centerAmount, { color: colors.text }]}>{formatPaiseAsInr(breakdown.totalMonthlySpendMinor)}</Text>
      </View>
    </View>

    <View style={styles.legend}>
      {breakdown.slices.map((slice) => {
        const selected = selectedCategory === slice.category;
        return <AnimatedPressable
          key={slice.category}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`${slice.category}, ${slice.percentage.toString()}%, ${formatPaiseAsInr(slice.amountMinor)}`}
          onPress={() => onSelectCategory?.(slice.category)}
          style={[styles.legendRow, { backgroundColor: selected ? colors.accentSoft : 'transparent', borderColor: selected ? colors.accent : colors.border }]}
        >
          <View style={[styles.indicator, { backgroundColor: FINANCE_CATEGORY_COLORS[slice.category] }]} />
          <Text numberOfLines={1} style={[styles.categoryName, { color: colors.text }]}>{slice.category}</Text>
          <Text style={[styles.percentage, { color: colors.textMuted }]}>{slice.percentage.toString()}%</Text>
          <Text style={[styles.amount, { color: colors.text }]}>{formatPaiseAsInr(slice.amountMinor)}</Text>
        </AnimatedPressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, padding: 14 },
  chartContainer: { width: SIZE, height: SIZE, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  centerLabel: { position: 'absolute', width: 112, alignItems: 'center' },
  centerCaption: { fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  centerAmount: { width: '100%', marginTop: 3, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  legend: { gap: 5, marginTop: 5 },
  legendRow: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  indicator: { width: 10, height: 10, borderRadius: 5 },
  categoryName: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: '700' },
  percentage: { width: 38, textAlign: 'right', fontSize: 10, fontWeight: '700' },
  amount: { minWidth: 82, textAlign: 'right', fontSize: 11, fontWeight: '800' },
});
