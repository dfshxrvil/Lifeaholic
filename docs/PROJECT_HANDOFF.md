# Lifeaholic project handoff

Snapshot: 10 September 2026. Reviewed local source, documentation, Git history, and available artifact filenames. Baseline commit: `ce675f4` on `main`. This is a source-based handoff, not confirmation that every feature works on an installed phone or that production services are configured.

## Implemented update: Calendar persistence and Home task actions (10 September 2026)

The working tree now implements the requested three changes on top of the original snapshot:

- iPhone Google OAuth uses offline authorization with PKCE. Access token, refresh token and absolute expiry are saved through Expo SecureStore, tied to the Lifeaholic user and OAuth client. Sessions restore after Supabase auth initializes; tokens renew within 60 seconds of expiry, before calendar operations, on foreground and while active.
- Refresh-token rotation is persisted, omitted refresh tokens are retained, concurrent renewals share one request, temporary network errors keep credentials, and revoked grants require reconnection. Disconnect/sign-out invalidate pending authorization/refresh work before deleting credentials.
- Calendar exposes a Disconnect button and a restoration state. The Events time slots have no long-press handler or helper text. Drag-to-create remains, but now requires actual movement; merely holding/releasing the drag control does not schedule an event.
- Home task rows (including Finished tasks) offer a haptic long-press sheet with Edit, Add Subtask and Delete. Edit reuses the existing task form populated with title, description and priority. Add Subtask focuses the existing sheet input. Delete confirms before updating Supabase/local state and clears that task from the undo queue.
- Existing checkbox completion, title-tap rename, original task dates, task/subtask data, priority colors and D-Day code are retained.
- New session code: `src/services/calendarSession.ts` (testable lifecycle) and `src/services/googleCalendarSession.ts` (SecureStore/Expo OAuth adapter). Android delegates renewal to its existing native Google token manager. Web keeps its existing in-memory OAuth approach because SecureStore is unavailable there.
- New focused tests: `node --test tests/calendar-session.test.mjs`, covering restoration, expiry, refresh rotation, concurrency, offline retry, revoked grants, account isolation and disconnect races. The 12 tests passed.
- `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `git diff --check` passed during implementation; native/device checks remain separate.
- iOS JavaScript export passed with `npx.cmd expo export --platform ios --no-bytecode --output-dir .expo/verification-ios-js` (3,690 modules). The normal export reached Hermes compilation but Windows denied execution of `hermesc.exe`; bytecode/native build validation therefore remains pending on the macOS build runner. No production build configuration was changed to disable bytecode.
- No database migration or new native dependency is required. A new IPA is needed for the installed standalone app. Connect Google Calendar once after upgrading to establish the new offline grant; subsequent restarts should restore it.
- On-device checks still needed: fresh consent and OAuth return, force-close/reopen, expiry renewal, offline recovery, disconnect/sign-out, all three task menu actions, keyboard focus, completion/undo and Matrix drag behavior.

OAuth references used during implementation: [Google native-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Expo AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/). Real Google grants and native keychain behavior were not exercised by the unit tests.

## Product and user context

Lifeaholic is a personal productivity app combining daily tasks, an Eisenhower matrix, focus tracking, calendar events, habits, personal/shared expenses, notes, and journaling. The current user's setup is an iPhone and Windows laptop. The repository also supports Android and web.

The recent conversation compared sideloading tools, then narrowed to iPhone plus Windows. Sideloadly, SideStore, AltStore Classic, and LiveContainer with SideStore were discussed. No installation, tool choice, or successful device test was confirmed in that conversation. The repository already contains a Sideloadly build workflow and IPA artifacts.

## What the app contains

| Area | Current implementation |
| --- | --- |
| Authentication | Supabase email/password sign-in and sign-up, optional username, confirmation-email message, persisted auth sessions, sign-out. Tabs require an authenticated user. |
| Home | Date selection, daily task list, priority colors, progress count/bar, task creation and renaming, subtasks, completion feedback, a 3-second undo queue, finished-task sheet, upcoming event and D-Day countdown. |
| Matrix | Four priority quadrants with separate native and web drag implementations. Priorities are red (urgent and important), yellow (important), blue (urgent), and green (later). Uses the same tasks as Home. |
| Task rollover | Database RPC moves incomplete overdue tasks to a target date while retaining `original_date`. Changes notify other task consumers and widgets. |
| Focus | User-defined subjects, focus timer, pause/stop handling, categorized breaks, daily sessions and summaries, widget timer integration, separate analytics route. |
| Focus analytics | Native and web dashboards. The route loads real Supabase sessions from the start of the month five months ago through the current month. A mock-data file exists but no import was found in the source search. |
| Calendar | Google Calendar connection, event listing/creation/editing/deletion, month/day selection, time-slot scheduling interactions, and selected-day tasks. |
| Habits | Calendar tab includes recurring weekday habits, optional time and emoji, completion logs, streak calculations, editing/deletion, and Google/device-calendar synchronization paths. |
| Finance | Personal/group modes, current-month expense list, search, groups and members, expense categories, split calculations, balances and deletion. Amount display is currently INR. The hook also contains expense updating; the data model tracks settlement status, but a settlement operation was not found in that hook. Hook availability does not establish that every operation has a complete screen flow. |
| Notes | Search, folders, Quick Notes, list/grid views, rich-text editing, pinning, checklists, attachments, PIN/password gate, move-to-folder, trash, restore and permanent deletion. |
| Journal | Shares the Notes tab through a segment switch. Chronological entries grouped by date, prompts/moments, bookmarks, mood/location/media fields and composer. Multiple entries per day are supported. |
| Settings | Light, high-contrast dark, black/yellow and custom colors; two D-Day event slots; profile theme save; sign-out. Home and the shared widget snapshot currently use D-Day slot 1. |
| UI | Floating six-tab navigation, custom launch splash/icons, animated presses and transitions, modal framing, haptics and completion sound, safe-area handling, some reduced-motion support. |

The six tab routes are Matrix, Focus, Home, Calendar, Finance and Notes. Additional routes include login, settings, new note and focus analytics.

## Architecture and files to edit

Declared dependencies: Expo SDK 57 (`~57.0.16`), React Native `0.86.2`, React `19.2.3`, TypeScript `~6.0.3`, Expo Router, Supabase JS, Reanimated/Gesture Handler, Expo media/calendar modules, and native widget bridges. These are repository declarations, not an assessment of latest available versions.

| Path | Responsibility |
| --- | --- |
| `app/` | Expo Router routes, including most primary screens and root providers. |
| `app/(tabs)/` | Six tab routes. Finance and Notes delegate to `src/screens`. |
| `src/screens/` | Finance and combined Notes/Journal screen implementations. |
| `src/components/` | Feature UI, forms, editors, charts, navigation, modals and widget sync provider. |
| `src/hooks/` | Task/habit/note/journal/group/expense state and operations. Expense database writes live here. |
| `src/services/` | Supabase client, task/focus/note/journal/habit services, calendars, widget bridges and local change events. |
| `src/contexts/` | Auth, calendar connection, theme and modal state. |
| `src/constants/theme.ts` | Color palettes, priority colors/labels, typography, spacing and motion constants. |
| `src/types/database.ts` | TypeScript database contract; update when changing schema. |
| `supabase/migrations/` | Five ordered SQL migrations defining tables, policies, triggers and functions. |
| `native-widgets/`, `native-modules/ios/` | Canonical custom Swift widgets and bridge source used by the iOS setup plugin. |
| `ios/` | Committed Xcode workspace, app, generated extension and CocoaPods files. |
| `android/` | Committed Android project including Kotlin widget providers, action receiver, storage and headless service. |
| `plugins/withPersonalTeamWidgetEntitlements.js` | Reapplies custom iOS widget/native target configuration when prebuilding. |
| `widgets/LifeaholicSharedData.tsx` | Shared widget snapshot and action contract. |
| `.github/workflows/ios-sideloadly.yml` | Manually triggered macOS build and IPA packaging workflow. |
| `docs/` | Windows IPA build and iOS widget/signing instructions, plus this handoff. |
| `scripts/` | Chime generation and a script that writes test data. Do not treat the seed script as a read-only test. |
| `artifacts/` | Local IPA/ZIP outputs, untracked at the start of this review. |

Root providers wrap auth, calendars and widget synchronization inside shared theme, safe-area and gesture/modal infrastructure. Features generally read/write Supabase through hooks/services. Local mutation events trigger refreshes; this is not evidence of a universal realtime or offline-first sync engine.

There are platform-specific implementations for matrix dragging, rich text, focus analytics, Google native auth, and widget storage. Native changes may need changes in the canonical source/config plugin as well as generated project files.

## Backend and persistence

The typed database includes 16 tables: profiles, tasks, subtasks, focus_subjects, focus_sessions, focus_breaks, note_folders, notes, journal_entries, groups, group_members, expenses, expense_splits, habits, habit_logs and d_day_events.

Migration progression:

1. `001_initial_schema.sql`: initial app schema and auth/profile foundation.
2. `002_iteration_two.sql`: expanded focus/notes/journal support, completion tracking and attachment storage policies.
3. `003_finance_schema.sql`: groups, membership, expenses, splits and access helpers/policies.
4. `004_iteration_four.sql`: original task dates/rollover, habits/logs, expense categories, richer notes/journal fields and two D-Day slots.
5. `005_habit_emoji.sql`: habit emoji field.

Migrations include row-level security and a private attachments bucket with user-scoped policies. This review did not query a live database or verify that any migration was applied remotely. Existing installations need only their unapplied migrations; do not blindly rerun every SQL file because some policy creation statements are not idempotent.

Supabase credentials and Google client IDs come from `EXPO_PUBLIC_` environment variables. The iPhone workflow expects Supabase URL/anon key and Google iOS/web client IDs as GitHub Actions secrets. Public build variables are embedded in the app. Never put a Supabase service-role key in the mobile client.

Auth uses the project's storage adapter. Themes use local AsyncStorage and can also be written to the profile. Google Calendar has separate authorization from app login. The current iPhone implementation securely persists and refreshes its offline grant as described in the update above.

## Native widgets and iPhone build

The custom iOS widget suite contains D-Day, Tasks, Eisenhower Matrix, What's Next, Add Expense, Focus Controller and Focus Analytics. Android also contains implementations/resources for these seven widget areas.

iOS snapshots use App Group storage; the visible widgets are custom Swift. The config's single `LifeaholicTasksWidget` entry does not describe the entire custom suite: the plugin and native sources are essential. The extension is configured for iOS 17 and is documented as independent of React/Expo/Hermes runtime dependencies.

Task-completion and focus-session actions can be queued by widgets and reconciled by `WidgetSyncProvider`. Synchronization runs on foregrounding, task/widget change events and a 60-second interval while active. Failed actions remain queued. Authentication tokens are not included in the snapshot construction.

Deep links route to Home, Calendar, Matrix/task selection, Add Expense, Focus and Focus Analytics.

Current identifiers are `com.example.lifeaholic`, `com.example.lifeaholic.widgets` and `group.com.example.lifeaholic`, with URL scheme `lifeaholic`. Changes to identifiers require coordinated OAuth, signing, native and widget updates.

The Windows-friendly workflow:

1. Manually trigger **Build Sideloadly IPA** on GitHub.
2. macOS runner installs Node 22 dependencies with `npm ci`.
3. CocoaPods runs `pod update --no-repo-update`.
4. Xcode builds the committed workspace in Release for iPhone without Apple credentials.
5. Packaging checks for the JavaScript bundle and widget extension, adds temporary ad-hoc signatures, verifies the bundle and ZIP, then uploads an IPA.
6. Workflow also uploads the resolved Podfile.lock and failure logs when available. Artifact retention is seven days.
7. Download and extract the IPA, then use Windows Sideloadly to sign/install it.

Existing project documentation flags App Group provisioning as the constraint for shared-data widgets. A successful main-app sideload does not prove widgets can read shared data. Whether the user's actual signing profile preserves the group remains unverified.

Local files found: `artifacts/Lifeaholic-release.ipa`, `artifacts/Lifeaholic-sideloadly.ipa`, `artifacts/Lifeaholic-sideloadly.zip`, and `artifacts/release-34313963321/Lifeaholic-sideloadly.ipa`. The IPA files are roughly 17.4 MB. Their presence proves that files exist, not which source commit or configuration each contains, whether GitHub passed, or whether installation succeeded.

## What happened, based on recorded evidence

| Date | Commit | Recorded change |
| --- | --- | --- |
| 2026-08-29 | `7ee23a4` | Initial commit containing the broad app baseline. Earlier implementation iterations cannot be reconstructed as separate events from this Git history. |
| 2026-08-30 | `e646037` | Updated `package-lock.json`. |
| 2026-09-08 | `a65b2d8` | Commit message says `changes`; actual diff adds the GitHub Sideloadly workflow and Windows build guide. |
| 2026-09-08 | `ce675f4` | Replaced strict `pod install --deployment` with `pod update --no-repo-update` to address a stale native lock after npm dependency updates; added pod logs and resolved-lock upload. |
| 2026-09-08/09 | Local files | IPA/ZIP artifacts have filesystem timestamps around these dates; provenance was not validated. |
| 2026-09-10 | This review | Inspected source/history/docs, checked TypeScript/lint, and created this handoff. No app behavior changes requested or made. |

At review start, `main` tracked `origin/main` with no ahead/behind count in the local status output. That does not verify the current server state because no fetch was performed. The only untracked path was `artifacts/`.

## Gaps and useful next work

These are source observations or follow-up candidates, not claims that each has reproduced as a device bug.

- **Outdated README:** says existing projects need only migration 002 despite the current code requiring later schema; describes demo usability although unauthenticated users are redirected to login and login requires configured Supabase.
- **Native dependency reproducibility:** the last commit works around a stale Podfile.lock during each build. Review a successful build's resolved lock and commit the intended dependency state before tightening installs again.
- **Release provenance:** distinguish older/newer IPA files with build number, source SHA, build time and nonsecret configuration metadata. App/package versions still say 1.0.0.
- **Device/backend verification:** confirm actual installed build, login, applied migrations, attachments, Google OAuth return, and widget entitlement behavior.
- **Calendar session lifecycle:** persistence and renewal are now implemented and unit-tested. Verify real-device consent, force-close/reopen, token expiry and revocation handling.
- **Note locking:** the PIN is salted and hashed, but note content remains stored as text/HTML. The current UI gate is not encrypted note storage.
- **Attachment longevity:** upload stores signed URLs valid for one year; a renewal strategy is not visible in the upload service.
- **Expense consistency:** expense and split updates are separate database calls, including deleting/reinserting splits. Interrupted operations merit review for atomicity.
- **Widget reconciliation:** test user switching, stale snapshots, interrupted acknowledgement and duplicate focus-session replay. Saving a focus session inserts a new row before action acknowledgement; no action-ID deduplication is visible there.
- **Offline scope:** widget queues preserve some actions, but normal app data operations generally depend on Supabase. Do not describe the whole app as offline-ready without further work.
- **Validation coverage:** a focused Calendar session test file was added in this update. Wider UI/integration coverage remains absent; native/device behavior needs separate checks.

## Validation performed during this review

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed with no reported diagnostics.
- `git diff --check`: passed for tracked changes; the newly created handoff is untracked.
- PowerShell blocks the `npm.ps1` wrapper under the current execution policy; using `npm.cmd` ran the checks without changing that policy.
- No native build, simulator, browser UI, installed-phone, live Supabase or remote GitHub run verification was performed. No seed data was written and no credentials were copied into this report.
- The only file added by this review is this handoff. Existing IPA artifacts were left as found.

## Future prompt template

```text
We are continuing Lifeaholic in this repository. Read docs/PROJECT_HANDOFF.md,
then inspect the current code and git status because the handoff may be stale.
My target setup is iPhone plus Windows; retain Android/web compatibility where
the changed feature is shared. Use the existing Expo/React Native architecture,
theme tokens, components, Supabase policies and native widget infrastructure.

Change requested: [describe the feature or bug].
Current behavior: [what happens now, including the screen and reproduction].
Desired behavior: [specific result].
Acceptance criteria: [observable checks].
Design references: [optional screenshots or descriptions].

Implement the change. Add a migration and update database types if necessary.
For native/widget changes, inspect canonical sources and the config plugin so
prebuild preserves the change. Run relevant checks and explain what was tested,
what needs an iPhone/build check, and whether a new IPA is required. Update the
handoff when architecture, configuration or release procedures change.
```

Possible next prompts:

- "Bring README setup instructions up to date with all five migrations, actual auth behavior, and the Windows-to-iPhone build process."
- "Verify the new Google Calendar persistence on an installed iPhone build, including expiry, force-close/reopen, offline recovery and disconnect."
- "Make widget action replay idempotent and isolate shared snapshots by signed-in user; validate account changes and interrupted reconciliation."
- "Make expense and split edits atomic with a Supabase database function and add focused tests for rounding and interrupted updates."
- "Establish a reproducible IPA release process with a resolved native lock, build numbers and source-commit metadata."

These remaining prompts are suggested follow-ups. The Calendar persistence and Home/Calendar interaction update above was explicitly requested and implemented.
