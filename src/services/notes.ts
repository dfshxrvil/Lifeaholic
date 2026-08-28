import { supabase } from '@/services/supabase';
import type { ChecklistItem, Json, Note, NoteAttachment, NoteFolder } from '@/types/database';
import { hashPin } from '@/utils/pinSecurity';

export async function listFolders(userId: string) { const { data, error } = await supabase.from('note_folders').select('*').eq('user_id', userId).order('name'); if (error) throw error; return data as NoteFolder[]; }
export async function createFolder(userId: string, name: string) { const { data, error } = await supabase.from('note_folders').insert({ user_id: userId, name }).select('*').single(); if (error) throw error; return data as NoteFolder; }
export async function listNotes(userId: string, options: { folderId?: string | null; all?: boolean; deleted?: boolean; search?: string } = {}) {
  let query = supabase.from('notes').select('*').eq('user_id', userId);
  query = options.deleted ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  if (!options.all && !options.deleted) query = options.folderId ? query.eq('folder_id', options.folderId) : query.is('folder_id', null);
  if (options.search?.trim()) { const term = options.search.trim().replace(/[%_,()]/g, ''); query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`); }
  const { data, error } = await query.order('is_pinned', { ascending: false }).order(options.deleted ? 'deleted_at' : 'updated_at', { ascending: false }); if (error) throw error; return data as Note[];
}
export async function saveNote(userId: string, input: { id?: string; folderId?: string | null; title: string; content: string; checklistData?: ChecklistItem[]; attachments?: NoteAttachment[]; pin?: string }) {
  const pin_hash = input.pin ? await hashPin(input.pin) : null; const now = new Date().toISOString();
  const values = { folder_id: input.folderId ?? null, title: input.title, content: input.content, content_html: input.content, checklist_data: (input.checklistData ?? []) as unknown as Json, attachments: (input.attachments ?? []) as unknown as Json, updated_at: now, ...(input.pin !== undefined ? { is_locked: Boolean(input.pin), pin_hash } : {}) };
  if (input.id) { const { data, error } = await supabase.from('notes').update(values).eq('id', input.id).eq('user_id', userId).select('*').single(); if (error) throw error; return data as Note; }
  const { data, error } = await supabase.from('notes').insert({ user_id: userId, ...values }).select('*').single(); if (error) throw error; return data as Note;
}
export async function setNotePinned(userId: string, id: string, isPinned: boolean) { const { error } = await supabase.from('notes').update({ is_pinned: isPinned, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId); if (error) throw error; }
export async function moveNote(userId: string, id: string, folderId: string | null) { const { error } = await supabase.from('notes').update({ folder_id: folderId, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId); if (error) throw error; }
export async function trashNote(userId: string, id: string) { const { error } = await supabase.from('notes').update({ deleted_at: new Date().toISOString(), is_pinned: false }).eq('id', id).eq('user_id', userId); if (error) throw error; }
export async function restoreNote(userId: string, id: string) { const { error } = await supabase.from('notes').update({ deleted_at: null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId); if (error) throw error; }
export async function permanentlyDeleteNote(userId: string, id: string) { const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', userId); if (error) throw error; }
export async function uploadAttachment(userId: string, uri: string, mimeType: string, fileName: string, scope: 'journal' | 'notes') { const response = await fetch(uri); const blob = await response.blob(); const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-'); const path = `${userId}/${scope}/${Date.now()}-${safeName}`; const { error } = await supabase.storage.from('attachments').upload(path, blob, { contentType: mimeType, upsert: false }); if (error) throw error; const signed = await supabase.storage.from('attachments').createSignedUrl(path, 60 * 60 * 24 * 365); if (signed.error) throw signed.error; return { path, signedUrl: signed.data.signedUrl }; }
