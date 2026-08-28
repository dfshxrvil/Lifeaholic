export async function connectGoogleCalendarNative(): Promise<string> {
  throw new Error('Native Google Calendar authorization is only available on Android.');
}

export async function disconnectGoogleCalendarNative(): Promise<void> {
  // Android supplies the native implementation through the platform-specific file.
}
