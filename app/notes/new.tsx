import { BlurView } from 'expo-blur';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ListChecks, Plus, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RichTextEditor } from '@/components/notes/RichTextEditor';
import { AttachmentBar } from '@/components/shared/AttachmentBar';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { saveNote, uploadAttachment } from '@/services/notes';
import type { ChecklistItem, NoteAttachment } from '@/types/database';

export default function NewNoteScreen() {
  const router = useRouter(); const params = useLocalSearchParams<{ folderId?: string }>(); const { user } = useAuth(); const { colors, theme } = useTheme(); const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(''); const [content, setContent] = useState(''); const [checks, setChecks] = useState<ChecklistItem[]>([]); const [newCheck, setNewCheck] = useState(''); const [attachments, setAttachments] = useState<NoteAttachment[]>([]); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const folderId = typeof params.folderId === 'string' && params.folderId ? params.folderId : null;
  const save = async () => { if (!user) return; setSaving(true); setError(null); try { await saveNote(user.id, { folderId, title: title.trim() || 'New Note', content, checklistData: checks, attachments }); router.back(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save note.'); } finally { setSaving(false); } };
  const addCheck = () => { if (!newCheck.trim()) return; setChecks((current) => [...current, { id: `${Date.now()}`, text: newCheck.trim(), isCompleted: false }]); setNewCheck(''); };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { backgroundColor: colors.background }]} keyboardVerticalOffset={90}>
    <Stack.Screen options={{ title: folderId ? 'New Folder Note' : 'New Note' }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.canvas, { paddingBottom: 118 + insets.bottom }]}>
      <Text style={[styles.date, { color: colors.textMuted }]}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      <TextInput accessibilityLabel="Note title" value={title} onChangeText={setTitle} autoFocus placeholder="A title for this thought" placeholderTextColor={colors.textMuted} style={[styles.title, { color: colors.text }]} />
      <RichTextEditor value={content} onChange={setContent} minHeight={300} style={styles.editor} />
      <View style={[styles.checklist, { borderTopColor: colors.border }]}><View style={styles.checkHeader}><ListChecks size={18} color={colors.notesAccent} /><Text style={[styles.checkTitle, { color: colors.text }]}>Checklist</Text></View>
        {checks.map((item) => <View key={item.id} style={styles.checkRow}><AnimatedPressable accessibilityLabel={`Toggle ${item.text}`} onPress={() => setChecks((current) => current.map((value) => value.id === item.id ? { ...value, isCompleted: !value.isCompleted } : value))} style={[styles.checkbox, { borderColor: colors.notesAccent, backgroundColor: item.isCompleted ? colors.notesAccent : 'transparent' }]}>{item.isCompleted && <Check size={12} color="#000" />}</AnimatedPressable><TextInput value={item.text} onChangeText={(text) => setChecks((current) => current.map((value) => value.id === item.id ? { ...value, text } : value))} style={[styles.checkInput, { color: colors.text }]} /><AnimatedPressable onPress={() => setChecks((current) => current.filter((value) => value.id !== item.id))}><Trash2 size={16} color={colors.textMuted} /></AnimatedPressable></View>)}
        <View style={styles.checkRow}><Plus size={17} color={colors.notesAccent} /><TextInput value={newCheck} onChangeText={setNewCheck} onSubmitEditing={addCheck} placeholder="Add checklist item" placeholderTextColor={colors.textMuted} style={[styles.checkInput, { color: colors.text }]} /></View>
      </View>
      {attachments.map((item) => <View key={item.id} style={[styles.attachment, { backgroundColor: colors.card }]}><Text numberOfLines={1} style={[styles.attachmentText, { color: colors.text }]}>{item.name ?? item.kind}</Text><AnimatedPressable onPress={() => setAttachments((current) => current.filter((value) => value.id !== item.id))}><X size={16} color={colors.textMuted} /></AnimatedPressable></View>)}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
    <BlurView intensity={80} tint={theme === 'light' ? 'light' : 'dark'} style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom), borderTopColor: colors.border, backgroundColor: colors.glass }]}>
      <AttachmentBar onAttachment={async (file) => { if (!user) throw new Error('Sign in to upload.'); const uploaded = await uploadAttachment(user.id, file.uri, file.mimeType, file.fileName, 'notes'); setAttachments((current) => [...current, { id: `${Date.now()}`, kind: file.kind, url: uploaded.signedUrl, path: uploaded.path, name: file.fileName }]); }} />
      <Button label="Save Note" loading={saving} onPress={() => void save()} style={styles.save} />
    </BlurView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, canvas: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 12, gap: 12 }, date: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }, title: { fontSize: 30, lineHeight: 38, fontWeight: '800', paddingVertical: 7 }, editor: { minHeight: 300 }, checklist: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 5 }, checkHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 }, checkTitle: { fontSize: 15, fontWeight: '800' }, checkRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 9 }, checkbox: { width: 21, height: 21, borderRadius: 7, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' }, checkInput: { flex: 1, minHeight: 38, fontSize: 14 }, attachment: { minHeight: 44, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }, attachmentText: { flex: 1, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }, bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 76, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, overflow: 'hidden' }, save: { minHeight: 38, paddingHorizontal: 15 } });
