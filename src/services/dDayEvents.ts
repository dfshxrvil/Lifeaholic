import { supabase } from '@/services/supabase';
import type { DDayEvent } from '@/types/database';

export async function listDDayEvents(userId: string) { const { data, error } = await supabase.from('d_day_events').select('*').eq('user_id', userId).order('slot'); if (error) throw error; return data as DDayEvent[]; }
export async function saveDDayEvent(userId: string, slot: 1 | 2, title: string, eventDate: string) { const { data, error } = await supabase.from('d_day_events').upsert({ user_id: userId, slot, title: title.trim(), event_date: eventDate, updated_at: new Date().toISOString() }, { onConflict: 'user_id,slot' }).select().single(); if (error) throw error; return data as DDayEvent; }
export async function deleteDDayEvent(userId: string, slot: 1 | 2) { const { error } = await supabase.from('d_day_events').delete().eq('user_id', userId).eq('slot', slot); if (error) throw error; }
