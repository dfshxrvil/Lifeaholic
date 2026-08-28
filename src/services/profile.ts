import { supabase } from '@/services/supabase';
import type { Json, Profile } from '@/types/database';

export async function getProfile(userId: string) { const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single(); if (error) throw error; return data as Profile; }
export async function updateProfile(userId: string, values: { d_day_event_title?: string | null; d_day_event_date?: string | null; theme_preference?: Json; username?: string | null }) { const { data, error } = await supabase.from('profiles').update(values).eq('id', userId).select('*').single(); if (error) throw error; return data as Profile; }
