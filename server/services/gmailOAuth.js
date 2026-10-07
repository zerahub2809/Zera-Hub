import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sender = 'onikesamuel@gmail.com';
const gmailScope = 'https://www.googleapis.com/auth/gmail.send';
const pendingStates = new Map();

function config() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Gmail API OAuth client is not configured');
  const serviceUrl = (process.env.RENDER_EXTERNAL_URL || 'https://zera-hub-api.onrender.com').replace(/\/+$/, '');
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GMAIL_OAUTH_REDIRECT_URI || `${serviceUrl}/api/auth/gmail/callback`,
  };
}

function authorizedSetupRequest(req) {
  const setupKey = process.env.GMAIL_OAUTH_SETUP_KEY;
  const header = req.get('authorization') || '';
  if (!setupKey || !header.startsWith('Basic ')) return false;
  let provided;
  try {
    provided = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const expected = Buffer.from(`zera-setup:${setupKey}`);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function readTokenFile(tokenFile) {
  if (!fs.existsSync(tokenFile)) return {};
  return JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
}

function saveTokenFile(tokenFile, tokens) {
  const existing = readTokenFile(tokenFile);
  const saved = { ...existing, ...tokens };
  if (typeof saved.refresh_token !== 'string' || !saved.refresh_token) {
    throw new Error('Google did not return a refresh token; revoke ZERA HUB access and authorize again.');
  }
  fs.writeFileSync(tokenFile, JSON.stringify(saved), { mode: 0o600 });
  try {
    fs.chmodSync(tokenFile, 0o600);
  } catch (error) {
    console.warn('Could not restrict Gmail token file permissions:', error.message);
  }
}

async function exchangeCode(code, tokenFile) {
  const oauth = config();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: oauth.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed (${response.status}): ${result.error_description || result.error || 'unknown error'}`);
  }
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${result.access_token}` },
  });
  const profile = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok || profile.email_verified !== true || String(profile.email || '').toLowerCase() !== sender) {
    throw new Error(`Authorize the Google account ${sender}; the selected account did not match the configured sender.`);
  }
  saveTokenFile(tokenFile, result);
}

async function getAccessToken(tokenFile) {
  const tokens = readTokenFile(tokenFile);
  if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) {
    throw new Error('Gmail OAuth is not authorized; complete the one-time authorization at /api/auth/gmail/authorize');
  }
  const oauth = config();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const refreshed = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google OAuth token refresh failed (${response.status}): ${refreshed.error_description || refreshed.error || 'unknown error'}`);
  }
  saveTokenFile(tokenFile, { ...refreshed, refresh_token: tokens.refresh_token });
  return refreshed.access_token;
}

export function createGmailOAuthRouter({ dataDir }) {
  const router = express.Router();
  const tokenFile = path.join(dataDir, 'gmail-oauth.json');

  router.get('/authorize', (req, res) => {
    if (!authorizedSetupRequest(req)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="ZERA HUB Gmail setup", charset="UTF-8"');
      return res.status(401).send('Gmail OAuth setup authorization required.');
    }
    let oauth;
    try {
      oauth = config();
    } catch (error) {
      return res.status(503).send(error.message);
    }
    const state = randomBytes(32).toString('hex');
    for (const [key, createdAt] of pendingStates) {
      if (Date.now() - createdAt > 10 * 60 * 1000) pendingStates.delete(key);
    }
    pendingStates.set(state, Date.now());
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri,
      response_type: 'code',
      scope: `${gmailScope} openid email`,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    }).toString();
    return res.redirect(url.toString());
  });

  router.get('/callback', async (req, res) => {
    if (typeof req.query.error === 'string') {
      return res.status(400).send(`Google Gmail authorization was not completed: ${req.query.error}`);
    }
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const createdAt = pendingStates.get(state);
    if (!createdAt || Date.now() - createdAt > 10 * 60 * 1000) {
      pendingStates.delete(state);
      return res.status(400).send('Gmail authorization state is missing, expired, or invalid. Start authorization again.');
    }
    pendingStates.delete(state);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) return res.status(400).send('Google did not return an authorization code. Start authorization again.');
    try {
      await exchangeCode(code, tokenFile);
      console.info('Gmail API OAuth completed; refresh token saved on persistent server storage.');
      return res.status(200).send('Gmail authorization complete. ZERA HUB can now send password-reset emails. You may close this page.');
    } catch (error) {
      console.error('Gmail OAuth callback failed:', error.message);
      return res.status(502).send('Gmail authorization could not be completed. Check Render service logs and restart authorization.');
    }
  });

  return router;
}

export async function sendPasswordResetEmail({ dataDir, email, link }) {
  const tokenFile = path.join(dataDir, 'gmail-oauth.json');
  const accessToken = await getAccessToken(tokenFile);
  const message = [
    `From: ZERA HUB <${sender}>`,
    `To: ${email}`,
    'Subject: Reset your ZERA HUB password',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    `We received a request to reset your ZERA HUB password.\n\nOpen this link to choose a new password (valid for one hour):\n${link}\n\nIf you did not request this, you can ignore this email.`,
  ].join('\r\n');
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(message, 'utf8').toString('base64url') }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Gmail API rejected the password-reset email (${response.status}): ${result.error?.message || 'unknown error'}`);
  }
}
