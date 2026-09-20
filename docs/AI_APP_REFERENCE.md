# Lifeaholic — complete AI engineering reference

Last source audit: 16 September 2026. This document describes the checked-in repository as it exists now. It is intended to be pasted into, or linked from, future AI prompts before asking for a feature or refactor.

## 1. Product summary

Lifeaholic is a portrait-first personal productivity application for iOS, Android, and web. It combines:

- Supabase email/password authentication and per-user data isolation.
- Daily tasks, subtasks, priority management, rollover, completion feedback, and an Eisenhower matrix.
- Focus subjects, live focus/break timers, daily history, and analytics.
- Google Calendar events plus recurring habits that can sync to Google Calendar or the device calendar.
- Personal and shared/group expense tracking using an integer-paise double-entry-style participant ledger.
- Rich notes, folders, checklists, attachments, trash, and a PIN-gate data model.
- Journal entries with prompts, mood, location text, images/video, voice memo, bookmarks, and multiple entries per day.
- D-Day countdowns, themes, deep links, and seven native home-screen widget types on both mobile platforms.

The client is Expo Router + React Native. Ordinary app data is stored in Supabase/PostgreSQL. Google Calendar data remains in Google. Theme preferences also use local storage. Google tokens use secure native storage on iOS, a native Google sign-in token manager on Android, and memory only on web. Widget data is a deliberately small local snapshot shared with native widget code.

## 2. Technology and configuration

### Runtime stack

- Expo SDK `~57.0.16`, React Native `0.86.2`, React `19.2.3`, TypeScript `~6.0.3` in strict mode with `noUncheckedIndexedAccess`.
- Expo Router file-based navigation with typed routes.
- Supabase JS for Auth, PostgREST/RPC calls, and Storage.
- Reanimated and Gesture Handler for interaction and motion.
- Expo Blur, Haptics, Audio, Image Picker, Calendar, Secure Store, Asset, Splash Screen, and Widgets.
- Native rich text uses `react-native-pell-rich-editor`/WebView; web uses a `contentEditable` implementation.
- Web matrix drag-and-drop uses dnd-kit. Native matrix dragging uses React Native gesture/animation primitives.
- Web focus charts use Recharts; native focus analytics intentionally renders a reduced summary.
- Finance charts use React Native SVG and custom components.
- Android Google Calendar auth uses `react-native-nitro-google-signin`; iOS/web use Expo AuthSession.

### App identity

- App name/slug: `Lifeaholic` / `lifeaholic`.
- App version: `1.1.1`; iOS build `4`; Android version code `4`. `package.json` independently says `1.1.0`.
- Main bundle/package: `com.example.lifeaholic`.
- iOS widget extension: `com.example.lifeaholic.widgets`.
- iOS App Group: `group.com.example.lifeaholic`.
- URL scheme: `lifeaholic`.
- Orientation is portrait; iPad support is enabled.

### Environment variables

`.env.example` declares:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

Never place a Supabase service-role key in this client. `EXPO_PUBLIC_*` values are embedded in builds. The real `.env` is intentionally not documented or copied.

### Commands

- `npm start`: Expo development server.
- `npm run android` / `npm run ios`: native development build.
- `npm run web`: Metro-backed web app.
- `npm run typecheck`: `tsc --noEmit`.
- `npm run lint`: Expo ESLint.
- `npm test`: Node tests under `tests/*.test.mjs`.

`metro.config.js` contains a Windows/OneDrive reparse-point workaround. Do not remove it without testing this repository from its current OneDrive path.

## 3. Runtime architecture

The root layout mounts providers in this order:

`GestureHandlerRootView -> SafeAreaProvider -> ThemeProvider -> SpatialModalProvider -> SpatialAppFrame -> AuthProvider -> CalendarProvider -> WidgetSyncProvider -> navigation`

It also mounts `DeepLinkRouter`, registers the Android headless widget task, preloads the splash image, and holds a custom launch overlay until both the root layout and splash asset are ready.

Important boundaries:

- Routes/screens own feature composition and modal visibility.
- Reusable visual elements live in `src/components`.
- Hooks own screen-facing state, optimistic updates, loading/error state, account boundaries, and refresh behavior.
- Services contain direct Supabase, Google, device calendar, and widget calls.
- Finance is stricter: UI -> finance hooks -> `financeRepository` -> Supabase RPC only. Do not bypass the repository.
- Contexts own authentication, theme, global calendar connection/session, and modal depth animation.
- Small in-memory event emitters refresh tasks, habits, finance, and widget snapshots after local mutations. This is not a general realtime/offline sync engine.

### Authentication lifecycle

`AuthProvider` restores Supabase auth, subscribes to auth changes, and exposes the current session/user. Tabs redirect unauthenticated users to `/login`. Sign-out first clears Google Calendar credentials/native sign-in and then signs out of Supabase. Supabase sessions use the platform-aware storage adapter in `src/utils/storage.ts`.

The login screen supports sign-in and sign-up. Sign-up accepts an optional username in user metadata and handles confirmation-email projects. Password length is validated at six characters. If Supabase is unconfigured, the login form displays a configuration error; the app is not meaningfully usable as a signed-in demo.

### Theme and motion

Themes are `light`, `highContrast`, `blackYellow`, and `custom`. Theme state is stored under `lifeaholic.theme.v2`; the former `daylight.theme.v2` key is migrated. Custom mode accepts a background and text hex color, then derives the remainder of the palette. Settings also saves the preference JSON into `profiles.theme_preference`, but startup currently restores from local AsyncStorage rather than the profile.

The UI uses blurred/glass cards, rounded sheets, animated presses, staggered list entrances, animated completion collapse, haptics, and a completion sound. Reduced-motion checks disable many animations. `AppModal` is a blurred bottom sheet with outside-tap dismissal and swipe-down dismissal. While a modal is mounted, `SpatialAppFrame` scales and dims the app underneath it.

## 4. Navigation and routes

| Route | Implementation | Purpose |
| --- | --- | --- |
| `/` | `app/index.tsx` | Shows a loader during auth restoration, then redirects to Home or Login. |
| `/login` | `app/login.tsx` | Brand screen, theme switch, email/password sign-in and sign-up. |
| `/(tabs)/matrix` | `app/(tabs)/matrix.tsx` | Eisenhower matrix and expanded quadrant modal. |
| `/(tabs)/focus` | `app/(tabs)/focus.tsx` | Focus subjects, timers, breaks, day history, summary. |
| `/(tabs)/home` | `app/(tabs)/home.tsx` | Daily tasks, D-Day, next event, progress, finished tasks. |
| `/(tabs)/calendar` | `app/(tabs)/calendar.tsx` | Month calendar, Google events, scheduled tasks, and habits. |
| `/(tabs)/finance` | `src/screens/FinanceScreen.tsx` | Personal/group expenses, balances, groups, analytics. The route file is a one-line re-export. |
| `/(tabs)/notes` | `src/screens/NotesJournalScreen.tsx` | Segmented Notes/Journal workspace. The route file is a one-line re-export. |
| `/settings` | `app/settings.tsx` | Theme, two D-Day records, profile preference save, sign-out. |
| `/notes/new` | `app/notes/new.tsx` | Full-page new-note editor; accepts optional `folderId`. |
| `/focus-analytics` | `app/focus-analytics.tsx` | Loads six months of real focus sessions and renders platform analytics. |

The floating tab bar always contains six tabs in this order: Matrix, Focus, Home, Calendar, Finance, Notes. It is a blurred floating bar that accounts for safe-area insets. Feature FABs use its exported bottom metrics so controls do not overlap it.

### Deep links

- `lifeaholic://home` opens Home.
- `lifeaholic://home?compose=d-day` opens the slot-1 D-Day editor.
- `lifeaholic://home?taskId=<id>` opens the selected task's subtask sheet if the task is on the currently loaded date.
- `lifeaholic://calendar` opens Calendar.
- `lifeaholic://matrix?taskId=<id>` opens the selected task's quadrant.
- `lifeaholic://finance/add-expense` opens Finance and its expense composer.
- `lifeaholic://focus` opens Focus.
- `lifeaholic://focus?startSubjectId=<id>` starts that subject when loaded and no timer is active.
- `lifeaholic://focus/analytics` opens focus analytics.

## 5. Feature behavior

### Home and tasks

Home defaults to today but supports a horizontally scrollable date bar covering 180 days before through 365 days after the center. The selected date drives `useTasks` and new-task creation.

The header contains the date, slot-1 D-Day pill, and Settings. `WhatsNext` shows the next not-yet-started Google event occurring today and recalculates every 30 seconds. The task header shows completed/total counts, a progress bar, and a Finished sheet.

Active task rows provide:

- Priority color and optional original-date rollover tag.
- Checkbox completion with haptic/audio feedback, optimistic update, collapse animation, and a three-second FIFO undo toast.
- Title tap/in-place rename.
- Row open to view/add/toggle subtasks.
- Long press for Edit, Add Subtask, or confirmed Delete.

The same long-press actions exist in Finished tasks. Editing preserves the task date and edits title, description, and priority. Deleting a task also removes it from the undo queue. A refresh button refreshes tasks, Google Calendar, and D-Day data together.

Task priorities are:

- red: Urgent & important / NOW
- yellow: Important / PLAN
- blue: Urgent / SOON
- green: Later / LATER

`useTasks` performs the `rollover_overdue_tasks` RPC once per user/day per JS process. It moves incomplete overdue tasks to today while retaining `original_date`. Task mutations notify all mounted task consumers and widget synchronization. Subtasks are fetched separately and attached to each task.

### Eisenhower matrix

Matrix displays only unfinished tasks from today in four quadrants. Dragging changes task priority optimistically, with a refresh fallback on error. Native and web have separate board implementations. Tapping a quadrant opens a full-screen list; a deep-linked task opens its quadrant. Tasks can be renamed and completed, with a three-second undo message.

### Focus tracking

Users create named subjects. Each subject shows focused time for the selected day and has a play/stop control. Long-pressing a subject opens deletion; deletion cascades/removes its sessions in the backend and clears a matching active timer locally.

Only today permits new timers. A focus timer stores `{subject,start}` in component state and writes the widget focus snapshot. Elapsed time is recomputed from wall-clock time every second, so it continues across backgrounding. Stop inserts a `focus_sessions` row with at least one second duration, resets widget focus to idle, and refreshes the day.

Break choices are Stare at wall, Sports, Socialize, Snacks, Washroom, and Other. Other requires a note. Stopping a break inserts `focus_breaks`. The day-summary sheet merges focus sessions and breaks chronologically.

On foreground, the screen can hydrate an active focus/break state from the widget snapshot. A widget subject deep link can start a focus timer. There is no server-side active-timer record; the durable app-side active state is the local widget snapshot on native platforms.

### Focus analytics

The analytics route loads real sessions from the first day five months ago through the first day of next month, maps subject names/colors, and converts seconds to minutes/date keys.

Web provides:

- Current Month, Last Month, and Last 6 Months filters.
- All-subject or one-subject filtering.
- Total time, daily average, most studied subject, and month-over-month KPIs.
- Daily bars with per-session tooltips, subject donut/legend, and six-month history.

Native intentionally provides only current-month total, daily average, and subject split. `mockData.ts` exists for development but is not used by the route.

### Calendar events

The global `CalendarProvider` owns connection state, token restoration, event list, next-event calculation, and event/habit mutations. The Calendar screen combines:

- A 6x7 month grid. Event days have an accent dot; task days have a success dot.
- Selected-day event list and scheduled task list.
- Event creation by button or by dragging a seed into an approximate hour slot (6:00–22:00). A hold without movement does not create an event.
- Event edit/delete actions.
- A title plus validated start/end `HH:MM` inputs. End must be later than start.
- Connect, disconnect, restore, loading, error, and manual refresh states.

Google event operations target the primary calendar with `calendar.events` scope. Events are normalized to local `Date` objects; fetch uses a bounded date range, single events, start ordering, and up to 250 results. Habit-created events use a private `lifeaholicHabitId` extended property so they can be found and replaced/deleted.

OAuth behavior differs by platform:

- iOS: Authorization Code + PKCE, `access_type=offline`, consent prompt, SecureStore persistence bound to Lifeaholic user ID and OAuth client ID, refresh-token renewal within 60 seconds of expiry.
- Android: Nitro Google One Tap/explicit sign-in plus Calendar scope; native token refresh; the JS session stores account binding and expiry.
- Web: implicit token response and memory-only session; reload loses the connection by design.

Refreshes are generation-guarded so stale requests cannot overwrite a disconnect/account change. Concurrent token renewals share one promise. Rotated refresh tokens are persisted; omitted refresh tokens retain the prior token. Revoked grants clear the session; network errors keep credentials for retry.

### Habits

Calendar's Habits segment lists only habits scheduled for the selected weekday. A habit includes title, optional emoji, selected weekdays (`0=Sunday` through `6=Saturday`), optional 24-hour time, archived flag, logs, calculated streak, and selected-day completion.

The form supports preset/custom emoji, weekday selection, and `HH:MM` validation. Rows show completion, emoji, time/Any time, and streak. Tapping a row opens Edit, Archive, or Delete. Completion uses an optimistic cross-hook event, then upserts/deletes a unique `(habit_id, completed_date)` log.

Streaks walk backward only across scheduled weekdays, begin no earlier than habit creation, and do not break merely because today's occurrence is still unfinished. The scan is bounded to 730 days. Habit-log fetches are capped at 2,500 rows.

Calendar synchronization behavior:

- If Google Calendar is connected, a habit replaces any prior Google recurrence and creates a weekly RRULE for one year. Timed habits last 30 minutes; untimed habits are all-day.
- Otherwise native platforms request device calendar permission, select a writable/default/primary/Google-like calendar, remove prior marked events, and create one weekly recurrence per selected weekday for one year.
- Web without Google reports that calendar synchronization is unsupported.
- Archive/delete attempts to clean up both device and connected Google calendar events.

### Finance

Finance stores money as integer paise (`bigint` in TypeScript, numeric/bigint in PostgreSQL). Never convert finance calculations to floating point. Canonical RPC JSON sends paise as decimal strings; the repository accepts safe integer numbers only as a compatibility fallback.

The screen supports Personal and Group modes, month navigation, search, cursor pagination (30 per page), pull-to-refresh, archive by button/swipe, edit by tapping a transaction, and monthly totals. Group mode can show all groups or one group and displays owed-to-you, you-owe, and net balances.

Expense entry supports:

- Description, exact INR amount with at most two decimals, category, optional/required custom category note for Other.
- Categories: Food, Online shopping, Investments, Laundry, Drinks, Grocery, Other.
- Transaction date and time, never in the future. `expenseDate` is the selected local reporting date; `transactionTimestamp` is ISO/timestamptz. Legacy rows may have no timestamp and are edited from local midnight.
- Personal ledger: current user both paid and owes the full amount.
- Group ledger: choose payer and either equal split, “You're Owed Full,” or “You Owe Full.” Equal-split remainder paise are assigned deterministically starting with the payer.
- Active-roster revalidation before submission.
- Immutable editing: the backend creates a new revision and supersedes the old expense.
- Stable idempotency keys across retries of the same logical mutation.

The Group modal supports group creation, incoming invitation accept/decline, owner-only candidate search (query length >= 3), invitations, roster/balance display, settled-member removal, suggested repayments, and recording a settlement when the current user is the payer. Backend APIs also support group archival and settlement reversal even though those operations are not prominently exposed in the current modal UI.

Financial Analytics has Overview, Categories, and Trends tabs. It loads every page for the selected month and previous month, calculates spend using the user's owed share for group expenses, and shows total/run rate/month-over-month, personal vs group share, top three outflows, interactive category pie/details, and tappable daily bars.

`financeRepository.ts` validates every returned object: UUIDs, ISO dates/timestamps, enums, decimal integer money, participant uniqueness, and paid/owed totals. It retains operation, PostgreSQL/PostgREST code, details, hint, and retryability. The UI currently renders verbose diagnostic boxes when finance calls fail; treat these as development-oriented output before a public release.

### Notes

The Notes/Journal tab defaults to Notes. Notes support:

- Search with a 180 ms debounce against title/content.
- Scopes: All Notes, Quick Notes (`folder_id = null`), individual folders, Recently Deleted.
- Folder creation and note movement.
- List/grid presentation.
- Pinned and unpinned sections.
- Rich HTML editing; native toolbar includes bold/italic/underline/headings/paragraph/lists/undo/redo/font sizes/highlights, while web includes bold/italic/underline/headings/body/highlights.
- Editable checklists.
- Photo/video selection and audio recording/upload.
- Pin/unpin, move, soft delete, restore, and confirmed permanent delete.
- A separate `/notes/new` full-page composer plus a modal editor for existing notes.

Attachments upload to the private `attachments` bucket at `<user>/<notes|journal>/<timestamp>-<safe filename>` and store a one-year signed URL. There is no visible URL-renewal job, orphan-file cleanup, or attachment deletion from Storage.

The data/service layer supports `is_locked` and a salted SHA-256 PIN hash. The list screen prompts for a PIN when opening an already locked note. However, the current note creation/editor UIs do not pass a `pin` to `saveNote`, so users cannot newly enable or change a lock through the checked-in UI. The PIN gate does not encrypt note contents.

### Journal

Journal search is debounced and entries are ordered by journal date descending then creation time descending, allowing multiple entries per day. The feed groups by `date_string` and displays time, mood, location name, title, body preview, media grid, voice memo marker, bookmark, and delete.

The Moments carousel offers Gratitude, Reflection, Growth, and People prompts. The composer supports date, title/body, three quick prompts, location text, mood, prompt category, images, one voice/video URL slot behavior, editing, bookmark, and hard deletion. The media grid shows up to four items; video URLs render a video placeholder rather than an inline player.

### Settings and D-Day

Settings exposes theme selection, custom background/text hex colors, two D-Day slots, profile preference save, account email display, sign-out, and credits. Both a D-Day title and `YYYY-MM-DD` date are required together. Empty slots are deleted.

Home and widget snapshot currently use only slot 1. Settings is the only UI for slot 2. Home also provides a compact slot-1 editor and notifies widget sync after saving.

## 6. Native widgets — complete behavior

The shared snapshot contract is `LifeaholicWidgetSnapshot` version 1:

- `updatedAt`
- up to 32 tasks: id, title, priority, completion
- optional slot-1 D-Day: title, date, days remaining
- up to 16 today's Google events: id, title, start/end Unix seconds
- up to 12 focus subjects with today's seconds
- focus state: idle/focus/paused/break, optional subject/start, accumulated seconds
- up to 12 nonzero focus analytics rows with color
- up to 64 durable pending actions: `completeTask` or `saveFocusSession`

`WidgetSyncProvider` runs on mount, app foreground, task/widget events, and every 60 seconds while active. It first replays pending actions to Supabase, acknowledges only successful actions, then rebuilds the snapshot from today's tasks, D-Day slot 1, current calendar events, subjects, sessions, and live focus time. Offline failures preserve the last valid snapshot and pending queue. Auth tokens are never written into widget storage.

| Widget | iOS families | Android presentation | Data/action |
| --- | --- | --- | --- |
| D-Day | Small | Dedicated D-Day layout | Slot-1 day count/title; opens Home D-Day editor. |
| Tasks | Medium, Large | Shows up to 7 tasks | iOS shows 4/8 numbered rows and opens task/Home. Android checkbox completes locally then queues Supabase sync. |
| Matrix | Large, Extra Large | Four quadrants | Groups unfinished tasks by priority; task opens its quadrant. Android rows have completion actions. |
| What's Next | Small, Medium | Next-event layout | Closest future event from today's snapshot; opens Calendar. |
| Add Expense | Small, Medium | Add-expense launcher | Static shortcut to Finance expense composer. |
| Focus Controller | Large | Status plus up to 5 subjects | iOS can start, pause, resume, end, enter break, and end break with App Intents. Android currently deep-links a subject into the Focus screen rather than controlling timer state in-place. |
| Focus Analytics | Small, Medium | Small/normal pie layouts | Today's total and subject split; opens Focus. |

Important iOS detail: `CompleteLifeaholicTaskIntent` exists and correctly queues `completeTask`, but the current Swift Tasks and Matrix views use `Link` rows and do not attach a `Button(intent:)` to that intent. Therefore checked-in iOS task/matrix widgets are not currently interactive completion controls, despite their descriptions. Wire the intent into those views if that behavior is requested.

iOS uses the `LifeaholicSharedData` Expo widget only as an App Group storage bridge; it is intentionally absent from the visible WidgetBundle. `WidgetModule.swift` reads/writes its Expo timeline key and reloads WidgetKit. Both the app and extension resolve the actually provisioned App Group at runtime, which accommodates re-signers that replace it with another valid shared group. No code can compensate if signing removes App Groups entirely.

Android uses private `SharedPreferences` JSON, seven `AppWidgetProvider` classes, `RemoteViews`, a native bridge, and a broadcast receiver. Task completion commits the local snapshot first, redraws all widgets, enqueues a durable action, and attempts a Headless JS Supabase update; foreground sync retries if background execution/network/auth fails.

## 7. Data model and backend

### Core tables

- `profiles`: user id, username/email, legacy D-Day fields, theme JSON, created time.
- `tasks`: owner, title/description, current date, original date, completion/completed time, priority, created time.
- `subtasks`: parent task, title, completion, created time.
- `focus_subjects`, `focus_sessions`, `focus_breaks`.
- `note_folders`, `notes`, `journal_entries`.
- `habits`, `habit_logs` with unique occurrence semantics.
- `d_day_events` with per-user slots 1–2.

### Finance tables

- `finance_groups`
- `finance_group_members`
- `finance_group_membership_history`
- `finance_group_invitations`
- `finance_expenses`
- `finance_expense_participants`
- `finance_settlements`
- `finance_operation_requests` for idempotency

Finance invariants and all writes live behind SQL functions/RPCs. The public client methods cover create/list/archive groups; invitations/search/respond; roster/removal; create/edit/archive/get/list expenses; balances; record/reverse settlements. RLS permits authenticated reads only where membership/participation rules allow; client writes are performed through granted RPCs rather than direct table mutation.

### Migration order

1. `001_initial_schema.sql`: profiles, tasks, subtasks, auth trigger, RLS.
2. `002_iteration_two.sql`: completed-time trigger; focus, note, journal tables; indexes/RLS; private attachments bucket/policies.
3. `003_profile_email.sql`: profile email and username/email lookup indexes; updated auth profile trigger.
4. `004_iteration_four.sql`: original task dates and rollover RPC; habits/logs; richer notes/journal; D-Day table; attachment MIME expansion.
5. `005_habit_emoji.sql`: habit emoji.
6. `009_remove_finance_backend.sql`: destructive clean removal of the retired finance backend.
7. `010_rebuild_finance.sql`: current finance schema, invariants, RLS, RPCs.
8. `011_add_finance_categories.sql`: Laundry, Drinks, Grocery.
9. `012_finance_rpc_contract_hardening.sql`: camel-case/string-money contract, correct limit+1 pagination, grants/cache reload.
10. `013_finance_transaction_timestamp.sql`: optional timestamptz and create/edit contract updates.

Do not blindly re-run all migrations on a live project. Migration 009 intentionally drops the retired finance system, and not every older policy statement is idempotent.

## 8. Source map: every authored app area

### Root and routes

- `app.json`: Expo identity, assets, permissions/plugins, native IDs, widget extension configuration.
- `package.json` / lock: scripts and exact dependency graph.
- `tsconfig.json`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `postcss.config.js`, `global.css`, `eslint.config.js`: compilation, alias `@/* -> src/*`, web styling, linting, and OneDrive compatibility.
- `app/_layout.tsx`: provider tree, splash, navigation, Android headless registration.
- `app/index.tsx`, `login.tsx`, `settings.tsx`, `focus-analytics.tsx`, `notes/new.tsx`: non-tab routes described above.
- `app/(tabs)/_layout.tsx`: auth guard and six-tab order.
- `app/(tabs)/home.tsx`, `matrix.tsx`, `focus.tsx`, `calendar.tsx`: primary feature screens.
- `app/(tabs)/finance.tsx`, `notes.tsx`: one-line exports of `src/screens` implementations.

### Screens and components

- `src/screens/FinanceScreen.tsx`: finance list/orchestration.
- `src/screens/NotesJournalScreen.tsx`: combined Notes/Journal orchestration.
- `components/auth/AuthForm.tsx`: login/signup state and validation.
- `components/branding/LaunchSplash.tsx`: custom animated launch overlay.
- `components/navigation/FloatingTabBar.tsx`, `DeepLinkRouter.tsx`: tab UI/metrics and URL dispatch.
- `components/home/WhatsNext.tsx`, `DDayWidget.tsx`: Home event/D-Day cards.
- `components/tasks/AddTaskModal.tsx`, `SubtaskModal.tsx`, `CompactTaskRow.tsx`, `TaskCard.tsx`, `DateSelector.tsx`, `DateTag.tsx`, `UndoToast.tsx`: all task UI. `TaskCard` is an alias of `CompactTaskRow`; `DateSelector` is an alias of `CalendarBar`.
- `components/matrix/MatrixBoard.native.tsx`, `.web.tsx`, `.d.ts`: platform drag boards and declaration.
- `components/calendar/CalendarGrid.tsx`, `UpcomingEventCard.tsx`: month grid and reusable upcoming-event card. Home currently uses `WhatsNext`, not `UpcomingEventCard`.
- `components/habits/HabitFormModal.tsx`, `HabitRow.tsx`: habit form/list row.
- `components/finance/AddExpenseModal.tsx`, `ExpenseDateTimePicker.tsx`, `.web.tsx`, `GroupModal.tsx`, `AnalyticsModal.tsx`, `CategoryPieChart.tsx`: complete finance composer/group/analytics UI and platform picker.
- `components/notes/RichTextEditor.native.tsx`, `.web.tsx`, `.d.ts`, `NoteEditorModal.tsx`, `NoteCard.tsx`, `AttachmentBar.tsx`: rich notes. The notes attachment file re-exports the shared implementation.
- `components/journal/JournalComposer.tsx`, `JournalCard.tsx`, `MediaGrid.tsx`, `MomentsCarousel.tsx`: journal UI.
- `components/shared/AttachmentBar.tsx`: image/video picker and high-quality audio recorder/upload callback.
- `components/focus/FocusAnalyticsDashboard.web.tsx`, `.native.tsx`, `.d.ts`; `focus/analytics/{types,analytics,mockData}.ts`: platform dashboards and pure calculations.
- `components/widgets/WidgetSyncProvider.tsx`: native snapshot/action reconciliation.
- `components/ui/AnimatedPressable.tsx`, `AppModal.tsx`, `Button.tsx`, `Checkbox.tsx`, `FormInput.tsx`, `Screen.tsx`, `SlidingSegmentedControl.tsx`, `ThemeSwitch.tsx`, `ValidationFeedback.tsx`: shared interaction, sheet, form, layout, segmented, theme, and error-shake primitives.

### Contexts, hooks, services, domain

- `contexts/AuthContext.tsx`, `CalendarContext.tsx`, `ThemeContext.tsx`, `SpatialModalContext.tsx`: global state described above.
- `hooks/useTasks.ts`, `useHabits.ts`, `useNotes.ts`, `useJournal.ts`: feature data adapters.
- `hooks/useCompletionFeedback.ts`: checkmark haptic plus generated `chime.wav` playback.
- `hooks/useScrollBoundaryHaptics.ts`: top-edge/pull refresh haptic behavior.
- `hooks/finance/useFinance.ts`: account-safe queries, pagination, refresh subscriptions, and idempotent mutations.
- `hooks/finance/useFinanceAnalytics.ts`: full-page month loading and pure analytics composition.
- `services/supabase.ts`, `profile.ts`, `tasks.ts`, `focus.ts`, `habits.ts`, `notes.ts`, `journal.ts`, `dDayEvents.ts`: direct core persistence.
- `services/googleCalendar.ts`, `googleCalendarAuth.ts`, `.android.ts`, `calendarSession.ts`, `googleCalendarSession.ts`, `deviceCalendar.ts`: calendar API, OAuth, secure session lifecycle, and device recurrence.
- `services/taskEvents.ts`, `habitEvents.ts`, `widgetDataEvents.ts`, `finance/financeEvents.ts`: in-memory change notifications.
- `services/widgetSuite.ts`, `.ios.ts`, `.android.ts`, `widgetReload.ts`: no-op web/default bridge and native storage/reload implementations.
- `repositories/financeRepository.ts`: only finance persistence boundary and response validator.
- `domain/finance/money.ts`, `ledger.ts`, `idempotency.ts`, `analytics.ts`, `index.ts`: exact money, balanced allocations, retry keys, analytics, exports.
- `types/database.ts`, `finance.ts`, `calendar.ts`: client data contracts.
- `utils/dates.ts`, `expenseTimestamp.ts`, `pinSecurity.ts`, `storage.ts`: local date keys/labels, timestamp merge/format, salted PIN hashing, auth storage.
- `constants/theme.ts`, `animations.ts`: palettes, priority semantics, typography/radii/layout/motion, collapse exit.
- `src/widgets/androidHeadlessTask.ts`: best-effort Android background completion sync.

### Native projects and widgets

- `widgets/LifeaholicSharedData.tsx`: versioned shared snapshot schema/storage-only Expo widget.
- `native-widgets/LifeaholicWidgets.swift`, `index.swift`: canonical iOS WidgetKit suite and WidgetBundle.
- `native-modules/ios/WidgetModule.swift`, `.m`: canonical React Native iOS widget bridge.
- `ios/ExpoWidgetsTarget/*`: generated/committed copies of the Swift extension, Info.plist, entitlements.
- `ios/Lifeaholic/WidgetModule.swift`, `.m`: generated/committed bridge copy; keep canonical and generated copies aligned or rerun prebuild.
- `plugins/withPersonalTeamWidgetEntitlements.js`: copies canonical sources, removes unwanted push entitlement/Pods extension target, injects bridge sources, pins widget deployment to iOS 17, configures signing/Release optimization.
- `android/app/src/main/java/.../widgets/*`: bridge/package, providers/renderer, SharedPreferences store, action receiver, headless service.
- `android/app/src/main/res/layout/widget_*.xml`, `drawable/widget_*.xml`, `xml/widget_*_info.xml`: Android widget views/backgrounds/metadata.
- `android/app/src/main/AndroidManifest.xml`: app permissions, seven receivers, action receiver/service, deep-link activity.
- `ios/` and `android/`: committed native projects. Native dependency/config changes can require Expo prebuild plus CocoaPods/Gradle rebuild; do not edit only JS when the contract changes.

### Tests, scripts, docs, CI, artifacts

- `tests/calendar-session.test.mjs`: restore/expiry/rotation/concurrency/offline/revocation/account/disconnect races.
- `tests/finance-money.test.mjs`, `finance-idempotency.test.mjs`, `finance-analytics.test.mjs`, `finance-repository.test.mjs`, `finance-timestamp.test.mjs`: exact money, ledgers/retries, analytics, RPC validation, migration/timestamp behavior.
- `scripts/generate-chime.mjs`: generates the completion sound.
- `scripts/seed-test-data.mjs`: writes test data; it is not read-only and should not be run casually against production.
- `.github/workflows/ios-sideloadly.yml`: manual macOS build, unsigned/ad-hoc IPA packaging, extension/bundle checks, seven-day artifacts.
- `docs/BUILD_IPA_WINDOWS.md`, `IOS_WIDGETS.md`, `sideloadly-widgets.md`, `finance-core.md`, `PROJECT_HANDOFF.md`: specialized operational/history notes. This file is the current AI-oriented source map.
- `artifacts/`: generated IPA/ZIP/export outputs and verification scripts. These are delivery/build products, not source of truth; do not edit bundled Hermes/assets to implement features.

## 9. Known limitations and source truths

- No universal offline-first database layer or Supabase Realtime subscription exists. Most server data requires network; local optimistic state is reconciled by explicit refresh/events.
- Native active focus is widget-snapshot based, not a server-owned timer. Web has no widget snapshot persistence.
- iOS task completion App Intent exists but is not wired into the visible task/matrix Swift views.
- Android Focus Controller is a deep-link controller, not equivalent to the interactive iOS App Intent controller.
- Native focus analytics is deliberately less capable than web.
- Note lock creation/change is supported by service/schema but not wired into the current editors, and it is not encryption.
- Signed attachment URLs expire after one year; there is no renewal/orphan cleanup flow.
- Home/widgets use only D-Day slot 1; slot 2 is settings-only.
- `UpcomingEventCard` and focus mock data are present but not used by current primary screens.
- Finance group archive and settlement reversal exist in the repository/backend but are not primary current UI actions.
- Widget App Group behavior depends on signing/provisioning. A free/personal signing flow may install the app while stripping the shared group, making data widgets unusable.
- `RECORD_AUDIO` is removed in the committed Android manifest even though the JS attachment UI can request microphone recording; verify the generated native manifest/device behavior when changing audio.
- Some source text displays mojibake sequences in raw Windows output. Preserve intended Unicode labels and verify encoding when editing those files.

## 10. Rules for future AI changes

1. Identify every affected layer before editing: route/screen, component, hook, service/repository, type, SQL migration, widget snapshot/native implementation, tests, and documentation.
2. Preserve authentication/account boundaries. Clear stale user data on account changes and guard late async responses.
3. Use local calendar date keys (`YYYY-MM-DD`) for user-selected days; use ISO timestamps for real instants. Do not derive local reporting dates by slicing UTC timestamps.
4. Keep finance in integer paise and preserve balanced participant totals. Use the repository/RPC boundary and idempotency flow.
5. Add a new numbered Supabase migration for schema/RPC changes; do not rewrite deployed migration history unless explicitly working on a clean unreleased database.
6. For widget-visible data, update the TypeScript snapshot contract, iOS Swift Codable model/views/intents, Android JSON renderer/resources/actions, bridge safety limits, deep links, and reconciliation together.
7. Treat `native-widgets/` and `native-modules/ios/` as canonical sources; generated `ios/` copies must stay synchronized.
8. Preserve reduced motion, safe-area/tab-bar spacing, accessible labels/roles, loading/error/empty states, haptic behavior, and web/native variants.
9. Do not edit `artifacts/`, exported bundles, IPA contents, or `node_modules` as application source.
10. Run at least `npm run typecheck`, `npm run lint`, and `npm test`. Widget/native changes additionally need Android/iOS native compilation and device/simulator checks.

## 11. Recommended structured prompt format

Use this format for future changes:

```text
Read docs/AI_APP_REFERENCE.md first and inspect the current source files it points to.

Goal:
[One precise user-facing outcome]

Platforms:
[iOS / Android / web / widgets; say whether behavior must match]

Current behavior:
[What happens now]

Required behavior:
[Detailed states, interactions, validation, persistence, errors, and empty/loading behavior]

Data/backend impact:
[New/changed fields, migrations, RPCs, external APIs, offline behavior]

Widget/deep-link impact:
[Snapshot fields, native controls, links, reconciliation]

Design constraints:
[Theme, layout, accessibility, motion, reference screenshots]

Compatibility:
[What must not regress]

Acceptance criteria:
- [Observable requirement 1]
- [Observable requirement 2]
- [Tests/builds that must pass]

Deliverables:
[Code, migration, tests, docs, build artifact, etc.]
```

When a request is ambiguous, the AI should inspect the referenced implementation and state its assumptions before making any change that would alter product behavior, schema, authentication, signing, or external data.
