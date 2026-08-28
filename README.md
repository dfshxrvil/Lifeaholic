# Lifeaholic productivity app

Cross-platform Expo application for daily tasks, focus sessions, and Google Calendar events.

## Setup

1. Copy `.env.example` to `.env` and add Supabase and Google OAuth credentials.
2. Run the SQL files in `supabase/migrations` in numeric order. Existing Iteration 1 projects should run only `002_iteration_two.sql` now.
3. Add the redirect URI printed on the Calendar connection screen to each Google OAuth client.
4. Run `npm install`, then `npm run web` or launch through Expo Go/dev builds.

The app remains usable in a configuration/demo mode when environment variables are absent, but authentication and remote data require Supabase credentials.

## Iteration 2 native modules

- `expo-audio` records journal and note audio attachments.
- `expo-image-picker` selects photo attachments.
- `react-native-pell-rich-editor` and `react-native-webview` provide the native rich-text editor; Web uses a content-editable implementation.
- Matrix and calendar drag surfaces use React Native Animated/PanResponder on top of the existing Gesture Handler/Reanimated setup.

After adding or changing native modules, rebuild the development client. Expo Go is not sufficient for the Google OAuth redirect and full native media workflow.
# Lifeaholic
