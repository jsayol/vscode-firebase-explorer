import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// https://firebase.google.com/docs/functions/typescript

export const debugInfo = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    console.error('Only POST requests are allowed.');
    return;
  }

  try {
    const { category, data } = req.body;
    await admin
      .database()
      .ref('debug')
      .child(category)
      .push(data);
  } catch (err) {
    console.error('Failed pushing debug info to database:', err);
  }

  res.end();
});
