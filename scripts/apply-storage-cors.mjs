#!/usr/bin/env node
/**
 * Applies storage-cors.json to the Firebase Storage bucket.
 * Requires `firebase login` (uses the Firebase CLI OAuth token).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BUCKET = 'home-grid-23c8b.firebasestorage.app';
const CORS_FILE = new URL('../storage-cors.json', import.meta.url);

async function getAccessToken() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const tokens = config.tokens;
  if (!tokens?.access_token) {
    throw new Error('No Firebase access token. Run: npx firebase-tools login');
  }
  const expiresAt = tokens.expires_at ?? 0;
  if (Date.now() > expiresAt - 60_000) {
    throw new Error('Firebase access token expired. Run: npx firebase-tools login');
  }
  return tokens.access_token;
}

async function main() {
  const accessToken = await getAccessToken();
  const cors = JSON.parse(readFileSync(CORS_FILE, 'utf8'));

  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}?fields=cors`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cors }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to set bucket CORS (${res.status}): ${text}`);
  }

  const body = await res.json();
  console.log(`CORS applied to gs://${BUCKET}`);
  console.log(JSON.stringify(body.cors, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
