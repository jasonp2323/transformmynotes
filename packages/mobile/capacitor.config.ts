import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL ?? 'https://app.transformmynotes.com';

const config: CapacitorConfig = {
  appId: 'com.transformmynotes.app',
  appName: 'TransformMyNotes',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https',
    allowNavigation: ['*.transformmynotes.com'],
  },
};

export default config;
