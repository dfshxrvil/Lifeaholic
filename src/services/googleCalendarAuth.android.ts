import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';

const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const googleClientIdPattern = /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;
let configured = false;

function configureGoogleSignIn() {
  if (configured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId || !googleClientIdPattern.test(webClientId)) {
    throw new Error('Add a valid Google Web OAuth client ID before connecting Calendar.');
  }
  GoogleOneTapSignIn.configure({
    webClientId,
    offlineAccess: false,
    autoSelectOnSignIn: false,
  });
  configured = true;
}

export async function connectGoogleCalendarNative(): Promise<string> {
  configureGoogleSignIn();
  await GoogleOneTapSignIn.checkPlayServices();

  let response = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(response)) response = await GoogleOneTapSignIn.createAccount();
  if (isNoSavedCredentialFoundResponse(response)) response = await GoogleOneTapSignIn.presentExplicitSignIn();
  if (isCancelledResponse(response)) throw new Error('Google Calendar authorization was cancelled.');
  if (!isSuccessResponse(response)) throw new Error('Google Sign-In could not be completed.');

  const authorization = await GoogleOneTapSignIn.requestScopes([CALENDAR_EVENTS_SCOPE]);
  if (!authorization.accessToken) throw new Error('Google did not return a Calendar access token.');
  return authorization.accessToken;
}

export async function disconnectGoogleCalendarNative(): Promise<void> {
  configureGoogleSignIn();
  await GoogleOneTapSignIn.signOut();
}
