import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as notesService from '@/services/notes';
import type { ChecklistItem, Note, NoteAttachment, NoteFolder } from '@/types/database';

export type NotesScope = { kind: 'all' } | { kind: 'quick' } | { kind: 'folder'; id: string } | { kind: 'deleted' };
export function useNotes(scope: NotesScope, search: string) {
  const { user } = useAuth(); const [notes, setNotes] = useState<Note[]>([]); const [folders, setFolders] = useState<NoteFolder[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(scope);
  const refresh = useCallback(async () => { if (!user) return; setLoading(true); setError(null); try { const options = scope.kind === 'all' ? { all: true } : scope.kind === 'deleted' ? { deleted: true } : scope.kind === 'folder' ? { folderId: scope.id } : { folderId: null }; const [noteRows, folderRows] = await Promise.all([notesService.listNotes(user.id, { ...options, search }), notesService.listFolders(user.id)]); setNotes(noteRows); setFolders(folderRows); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load notes.'); } finally { setLoading(false); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, search]);
  useEffect(() => { const timer = setTimeout(() => void refresh(), search ? 180 : 0); return () => clearTimeout(timer); }, [refresh, search]);
  const mutate = async (action: () => Promise<unknown>) => { await action(); await refresh(); };
  return { notes, folders, loading, error, refresh,
    createFolder: async (name: string) => { if (!user) return; await mutate(() => notesService.createFolder(user.id, name)); },
    saveNote: async (input: { id?: string; folderId?: string | null; title: string; content: string; checklistData?: ChecklistItem[]; attachments?: NoteAttachment[]; pin?: string }) => { if (!user) return; await mutate(() => notesService.saveNote(user.id, input)); },
    togglePinned: async (note: Note) => { if (!user) return; setNotes((current) => current.map((item) => item.id === note.id ? { ...item, is_pinned: !note.is_pinned } : item).sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))); try { await notesService.setNotePinned(user.id, note.id, !note.is_pinned); await refresh(); } catch (cause) { await refresh(); throw cause; } },
    moveNote: async (id: string, folderId: string | null) => { if (!user) return; await mutate(() => notesService.moveNote(user.id, id, folderId)); },
    trashNote: async (id: string) => { if (!user) return; setNotes((current) => current.filter((note) => note.id !== id)); await notesService.trashNote(user.id, id); },
    restoreNote: async (id: string) => { if (!user) return; await mutate(() => notesService.restoreNote(user.id, id)); },
    permanentlyDelete: async (id: string) => { if (!user) return; setNotes((current) => current.filter((note) => note.id !== id)); await notesService.permanentlyDeleteNote(user.id, id); },
  };
}
