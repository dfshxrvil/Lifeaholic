export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type TaskPriority = 'red' | 'yellow' | 'blue' | 'green';
export type BreakActivity = 'stare_at_wall' | 'sports' | 'socialize' | 'snacks' | 'washroom' | 'other';
export type ExpenseSplitType = 'personal' | 'split_equally' | 'you_owed_full' | 'other_owed_full' | 'custom';
export type ExpenseCategory = 'Food' | 'Online shopping' | 'Other' | 'Investments';
export type ChecklistItem = { id: string; text: string; isCompleted: boolean };
export type NoteAttachment = { id: string; kind: 'image' | 'video' | 'audio' | 'file'; url: string; path?: string; name?: string };
export type JournalLocation = { name: string; latitude?: number; longitude?: number };

type Table<Row, Insert, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        { id: string; username: string | null; email: string | null; created_at: string; d_day_event_title: string | null; d_day_event_date: string | null; theme_preference: Json },
        { id: string; username?: string | null; email?: string | null; created_at?: string; d_day_event_title?: string | null; d_day_event_date?: string | null; theme_preference?: Json },
        { username?: string | null; email?: string | null; d_day_event_title?: string | null; d_day_event_date?: string | null; theme_preference?: Json }
      >;
      tasks: Table<
        { id: string; user_id: string; title: string; description: string | null; date: string; original_date: string; is_completed: boolean; priority: TaskPriority; completed_at: string | null; created_at: string },
        { id?: string; user_id: string; title: string; description?: string | null; date: string; original_date?: string; is_completed?: boolean; priority?: TaskPriority; completed_at?: string | null; created_at?: string },
        { title?: string; description?: string | null; date?: string; original_date?: string; is_completed?: boolean; priority?: TaskPriority; completed_at?: string | null }
      >;
      subtasks: Table<
        { id: string; task_id: string; title: string; is_completed: boolean; created_at: string },
        { id?: string; task_id: string; title: string; is_completed?: boolean; created_at?: string },
        { title?: string; is_completed?: boolean }
      >;
      focus_subjects: Table<
        { id: string; user_id: string; name: string; created_at: string },
        { id?: string; user_id: string; name: string; created_at?: string }
      >;
      focus_sessions: Table<
        { id: string; user_id: string; subject_id: string; start_time: string; end_time: string; duration_seconds: number },
        { id?: string; user_id: string; subject_id: string; start_time: string; end_time: string; duration_seconds: number }
      >;
      focus_breaks: Table<
        { id: string; user_id: string; activity_type: BreakActivity; custom_note: string | null; start_time: string; end_time: string; duration_seconds: number },
        { id?: string; user_id: string; activity_type: BreakActivity; custom_note?: string | null; start_time: string; end_time: string; duration_seconds: number }
      >;
      note_folders: Table<
        { id: string; user_id: string; name: string; created_at: string },
        { id?: string; user_id: string; name: string; created_at?: string }
      >;
      notes: Table<
        { id: string; user_id: string; folder_id: string | null; title: string; content_html: string; content: string; is_pinned: boolean; checklist_data: Json; attachments: Json; deleted_at: string | null; is_locked: boolean; pin_hash: string | null; created_at: string; updated_at: string },
        { id?: string; user_id: string; folder_id?: string | null; title: string; content_html?: string; content?: string; is_pinned?: boolean; checklist_data?: Json; attachments?: Json; deleted_at?: string | null; is_locked?: boolean; pin_hash?: string | null; created_at?: string; updated_at?: string },
        { folder_id?: string | null; title?: string; content_html?: string; content?: string; is_pinned?: boolean; checklist_data?: Json; attachments?: Json; deleted_at?: string | null; is_locked?: boolean; pin_hash?: string | null; updated_at?: string }
      >;
      journal_entries: Table<
        { id: string; user_id: string; date_string: string; title: string; content_html: string; body_text: string; media_urls: string[]; location: Json | null; voice_memo_url: string | null; is_bookmarked: boolean; prompt_category: string | null; mood: string | null; created_at: string; updated_at: string },
        { id?: string; user_id: string; date_string: string; title?: string; content_html?: string; body_text?: string; media_urls?: string[]; location?: Json | null; voice_memo_url?: string | null; is_bookmarked?: boolean; prompt_category?: string | null; mood?: string | null; created_at?: string; updated_at?: string },
        { date_string?: string; title?: string; content_html?: string; body_text?: string; media_urls?: string[]; location?: Json | null; voice_memo_url?: string | null; is_bookmarked?: boolean; prompt_category?: string | null; mood?: string | null; updated_at?: string }
      >;
      groups: Table<
        { id: string; name: string; created_by: string; created_at: string },
        { id?: string; name: string; created_by: string; created_at?: string },
        { name?: string }
      >;
      group_members: Table<
        { group_id: string; user_id: string; joined_at: string },
        { group_id: string; user_id: string; joined_at?: string }
      >;
      expenses: Table<
        { id: string; created_by: string; group_id: string | null; description: string; amount: number; expense_date: string; paid_by: string; split_type: ExpenseSplitType; category: ExpenseCategory; custom_category_note: string | null; created_at: string },
        { id?: string; created_by: string; group_id?: string | null; description: string; amount: number; expense_date: string; paid_by: string; split_type: ExpenseSplitType; category?: ExpenseCategory; custom_category_note?: string | null; created_at?: string },
        { group_id?: string | null; description?: string; amount?: number; expense_date?: string; paid_by?: string; split_type?: ExpenseSplitType; category?: ExpenseCategory; custom_category_note?: string | null }
      >;
      expense_splits: Table<
        { id: string; expense_id: string; user_id: string; amount_owed: number; is_settled: boolean },
        { id?: string; expense_id: string; user_id: string; amount_owed: number; is_settled?: boolean },
        { amount_owed?: number; is_settled?: boolean }
      >;
      habits: Table<
        { id: string; user_id: string; title: string; emoji: string | null; days_of_week: number[]; time: string | null; is_archived: boolean; created_at: string },
        { id?: string; user_id: string; title: string; emoji?: string | null; days_of_week: number[]; time?: string | null; is_archived?: boolean; created_at?: string },
        { title?: string; emoji?: string | null; days_of_week?: number[]; time?: string | null; is_archived?: boolean }
      >;
      habit_logs: Table<
        { id: string; habit_id: string; completed_date: string; created_at: string },
        { id?: string; habit_id: string; completed_date: string; created_at?: string },
        { completed_date?: string }
      >;
      d_day_events: Table<
        { id: string; user_id: string; slot: number; title: string; event_date: string; created_at: string; updated_at: string },
        { id?: string; user_id: string; slot: number; title: string; event_date: string; created_at?: string; updated_at?: string },
        { title?: string; event_date?: string; updated_at?: string }
      >;
    };
    Views: Record<string, never>;
    Functions: { rollover_overdue_tasks: { Args: { target_date: string }; Returns: number } };
    Enums: { task_priority: TaskPriority };
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Task = Database['public']['Tables']['tasks']['Row'];
export type Subtask = Database['public']['Tables']['subtasks']['Row'];
export type TaskWithSubtasks = Task & { subtasks: Subtask[] };
export type FocusSubject = Database['public']['Tables']['focus_subjects']['Row'];
export type FocusSession = Database['public']['Tables']['focus_sessions']['Row'];
export type FocusBreak = Database['public']['Tables']['focus_breaks']['Row'];
export type NoteFolder = Database['public']['Tables']['note_folders']['Row'];
export type Note = Database['public']['Tables']['notes']['Row'];
export type JournalEntry = Database['public']['Tables']['journal_entries']['Row'];
export type Group = Database['public']['Tables']['groups']['Row'];
export type GroupMember = Database['public']['Tables']['group_members']['Row'];
export type Expense = Database['public']['Tables']['expenses']['Row'];
export type ExpenseSplit = Database['public']['Tables']['expense_splits']['Row'];
export type GroupMemberProfile = GroupMember & { profile: Profile };
export type ExpenseWithSplits = Expense & { splits: ExpenseSplit[] };
export type Habit = Database['public']['Tables']['habits']['Row'];
export type HabitInput = { title: string; emoji?: string | null; daysOfWeek: number[]; time?: string | null };
export type HabitLog = Database['public']['Tables']['habit_logs']['Row'];
export type HabitWithLogs = Habit & { logs: HabitLog[]; streak: number; completedOnSelectedDate: boolean };
export type DDayEvent = Database['public']['Tables']['d_day_events']['Row'];
