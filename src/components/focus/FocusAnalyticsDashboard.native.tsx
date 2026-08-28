import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { filterByRange, formatDuration, getSubjectSplit } from './analytics/analytics';
import type { FocusAnalyticsDashboardProps } from './analytics/types';

export default function FocusAnalyticsDashboard({ sessions, referenceDate }: FocusAnalyticsDashboardProps) {
  const { colors } = useTheme();
  const anchor = useMemo(() => referenceDate ?? new Date(), [referenceDate]);
  const source = useMemo(() => sessions ?? [], [sessions]);
  const current = useMemo(() => filterByRange(source, anchor, 'currentMonth'), [source, anchor]);
  const total = current.reduce((sum, session) => sum + session.durationInMinutes, 0);
  const activeDays = new Set(current.map((session) => session.date)).size;
  const subjects = getSubjectSplit(current);

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>FOCUS INSIGHTS</Text>
      <Text style={[styles.title, { color: colors.text }]}>Focus Analytics</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>The interactive charts are optimized for the web dashboard. Your current-month summary is available here.</Text>
      <View style={styles.grid}>
        <SummaryCard label="Total focus" value={formatDuration(total)} colors={colors} />
        <SummaryCard label="Daily average" value={formatDuration(activeDays ? total / activeDays : 0)} colors={colors} />
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Subject split</Text>
        {subjects.length === 0 ? <Text style={{ color: colors.textMuted }}>No focus activity this month.</Text> : subjects.map((subject) => (
          <View key={subject.id} style={styles.subjectRow}>
            <View style={[styles.dot, { backgroundColor: subject.colorHex }]} />
            <Text style={[styles.subjectName, { color: colors.text }]}>{subject.name}</Text>
            <Text style={[styles.subjectTime, { color: colors.textMuted }]}>{formatDuration(subject.minutes)} · {subject.percentage}%</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function SummaryCard({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.value, { color: colors.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }, title: { fontSize: 30, fontWeight: '800', marginTop: 8 }, subtitle: { fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 22 },
  grid: { flexDirection: 'row', gap: 10 }, summary: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16 }, label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }, value: { fontSize: 22, fontWeight: '800', marginTop: 14 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, marginTop: 12 }, cardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12 }, subjectRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 }, dot: { width: 10, height: 10, borderRadius: 5 }, subjectName: { flex: 1, fontWeight: '600' }, subjectTime: { fontSize: 12 },
});
