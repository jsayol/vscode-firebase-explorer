import * as request from 'request-promise-native';

const DEBUG_FUNCTION_URL =
  'https://us-central1-vscode-ext-firebase.cloudfunctions.net/debugInfo';

export async function sendDebugInfo(
  category: string,
  data: any
): Promise<void> {
  try {
    await request({
      method: 'POST',
      url: DEBUG_FUNCTION_URL,
      json: true,
      body: { category, data }
    });
  } catch (err) {
    console.error('Failed sending debug info:', err);
  }
}
