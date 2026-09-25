import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FocusAnalyticsDashboard from '@/components/focus/FocusAnalyticsDashboard';
import type { FocusSession as AnalyticsSession } from '@/components/focus/analytics/types';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { listSessionsBetween, listSubjects } from '@/services/focus';
import { toDateKey } from '@/utils/dates';
import { useSafeBack } from '@/utils/navigation';

const subjectColors = ['#6366F1', '#14B8A6', '#F59E0B', '#EC4899', '#3B82F6', '#8B5CF6', '#22C55E'];

export default function FocusAnalyticsRoute() {
  const safeBack = useSafeBack(); const insets = useSafeAreaInsets();
  const { user } = useAuth(); const { theme, colors } = useTheme(); const [sessions, setSessions] = useState<AnalyticsSession[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!user) return; setLoading(true); setError(null); try { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth() - 5, 1); const end = new Date(now.getFullYear(), now.getMonth() + 1, 1); const [rows, subjects] = await Promise.all([listSessionsBetween(user.id, start, end), listSubjects(user.id)]); const subjectMap = new Map(subjects.map((subject, index) => [subject.id, { name: subject.name, color: subjectColors[index % subjectColors.length] }])); setSessions(rows.map((session) => { const subject = subjectMap.get(session.subject_id); return { id: session.id, subjectId: session.subject_id, subjectName: subject?.name ?? 'Deleted subject', colorHex: subject?.color ?? colors.accent, durationInMinutes: session.duration_seconds / 60, date: toDateKey(new Date(session.start_time)) }; })); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load focus analytics.'); } finally { setLoading(false); } }, [user, colors.accent]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const backButton = <AnimatedPressable accessibilityRole="button" accessibilityLabel="Back to Focus" onPress={safeBack} style={[styles.back, { top: insets.top + 8, backgroundColor: colors.card, borderColor: colors.border }]}><ChevronLeft color={colors.text} /></AnimatedPressable>;
  if (loading) return <View style={[styles.center, { backgroundColor: colors.background }]}>{backButton}<ActivityIndicator color={colors.accent} /><Text style={{ color: colors.textMuted }}>Loading your focus sessions…</Text></View>;
  if (error) return <View style={[styles.center, { backgroundColor: colors.background }]}>{backButton}<Text style={{ color: colors.danger }}>{error}</Text></View>;
  return <View style={styles.screen}><FocusAnalyticsDashboard sessions={sessions} darkMode={Platform.OS === 'web' && theme !== 'light'} />{backButton}</View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, back: { position: 'absolute', left: 16, zIndex: 20, width: 44, height: 44, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' } });
