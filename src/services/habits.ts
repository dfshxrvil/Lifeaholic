import { supabase } from '@/services/supabase';
import type { Habit, HabitInput, HabitLog } from '@/types/database';

export async function listHabits(userId: string) {
  const { data, error } = await supabase.from('habits').select('*').eq('user_id', userId).eq('is_archived', false).order('created_at');
  if (error) throw error; return data as Habit[];
}
export async function listHabitLogs(habitIds: string[]) {
  if (!habitIds.length) return [];
  const { data, error } = await supabase.from('habit_logs').select('*').in('habit_id', habitIds).order('completed_date', { ascending: false }).limit(2500);
  if (error) throw error; return data as HabitLog[];
}
export async function createHabit(userId: string, input: HabitInput) {
  const { data, error } = await supabase.from('habits').insert({ user_id: userId, title: input.title.trim(), emoji: input.emoji?.trim() || null, days_of_week: [...new Set(input.daysOfWeek)].sort(), time: input.time || null }).select().single();
  if (error) throw error; return data as Habit;
}
export async function updateHabit(habitId: string, input: HabitInput) { const { data, error } = await supabase.from('habits').update({ title: input.title.trim(), emoji: input.emoji?.trim() || null, days_of_week: [...new Set(input.daysOfWeek)].sort(), time: input.time || null }).eq('id', habitId).select('*').single(); if (error) throw error; return data as Habit; }
export async function setHabitCompleted(habitId: string, date: string, completed: boolean) {
  if (completed) { const { error } = await supabase.from('habit_logs').upsert({ habit_id: habitId, completed_date: date }, { onConflict: 'habit_id,completed_date' }); if (error) throw error; }
  else { const { error } = await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('completed_date', date); if (error) throw error; }
}
export async function archiveHabit(habitId: string) { const { error } = await supabase.from('habits').update({ is_archived: true }).eq('id', habitId); if (error) throw error; }
export async function deleteHabit(habitId: string) { const { error } = await supabase.from('habits').delete().eq('id', habitId); if (error) throw error; }
