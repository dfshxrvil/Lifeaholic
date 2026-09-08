# Build an IPA on GitHub for Sideloadly

The `Build Sideloadly IPA` workflow uses GitHub's macOS runner to compile a
Release iPhone app from the committed iOS workspace. It includes the JavaScript
bundle and widget extension. No Expo login or Apple signing credentials are
needed for the build. Sideloadly signs the downloaded IPA during installation.

## First build

1. Commit and push `.github/workflows/ios-sideloadly.yml` to the repository's
   default branch (`main`).
2. In GitHub, open **Settings > Secrets and variables > Actions** and create
   repository secrets from the corresponding values in your local `.env`:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   Use the client-facing Supabase anon key, never a service-role key. These
   `EXPO_PUBLIC_` values are embedded in the app. Do not commit `.env`.
   Without these settings the app builds in its existing demo/configuration mode;
   authentication and remote data need the appropriate values.
3. Open **Actions > Build Sideloadly IPA > Run workflow**, select `main`, and run.
4. When the build succeeds, open that run and download the
   **Lifeaholic-sideloadly** artifact at the bottom of the page.
5. Extract the downloaded ZIP to get `Lifeaholic-sideloadly.ipa`.
6. Open Sideloadly on Windows, connect and select your iPhone, select the IPA,
   enter your Apple ID in Sideloadly, and start installation.

The workflow runs only when manually requested. GitHub Actions availability and
any usage charges depend on the repository and account plan. Artifacts expire
after seven days; download the IPA before then.

## Widgets and signing

The IPA includes `ExpoWidgetsTarget.appex` and temporary local ad-hoc signatures.
It must be re-signed by Sideloadly before it can be installed on a device.
For a free Apple ID, the main app can be sideloaded, but do not expect shared-data
widgets to work if provisioning removes the App Group capability. If extension
provisioning blocks installation with your account, enable Sideloadly's
**Remove App Extensions (Plug-ins)** option to install the main app alone.
See [widget signing notes](sideloadly-widgets.md) for installation with widgets.

## Troubleshooting

If the workflow fails, open the failed step in the Actions run. An
`ios-build-log` artifact is also uploaded when an Xcode build log is available.
Windows cannot validate the native compilation locally; a successful GitHub
run is required before an IPA is available.
