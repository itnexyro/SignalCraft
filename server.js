import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStore, writeStore } from './src/storage.js';

const port = Number(process.env.PORT || 8787);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173';
const encryptionSecret = process.env.APP_ENCRYPTION_KEY;
if (process.env.NODE_ENV === 'production' && (!encryptionSecret || encryptionSecret === 'replace-with-a-long-random-secret')) throw new Error('APP_ENCRYPTION_KEY must be set in production');
const encryptionKey = crypto.createHash('sha256').update(encryptionSecret || 'change-this-development-key').digest();
const intents = {
  scholarship: 'academic inquiry letters',
  b2b: 'partnership conversations',
  web_dev: 'digital transformation pitches'
};

function id(prefix) { return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }
function json(res, status, body, request = {}) {
  const origin = request.headers && request.headers.origin ? request.headers.origin : frontendOrigin;
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || frontendOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
  });
  res.end(JSON.stringify(body));
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`))); }
function verifyPassword(password, stored) { const [salt, hash] = stored.split(':'); return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(crypto.timingSafeEqual(Buffer.from(hash, 'hex'), key)))); }
function encrypt(value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`; }
function decrypt(value) { const [iv, tag, encrypted] = value.split(':'); const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'hex')); decipher.setAuthTag(Buffer.from(tag, 'hex')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8'); }
function token() { return crypto.randomBytes(32).toString('hex'); }
async function body(req) { let raw = ''; for await (const chunk of req) raw += chunk; return raw ? JSON.parse(raw) : {}; }
function sessionId(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function getSessionUserId(store, value) {
  const session = store.sessions.find(item => item.id === sessionId(value));
  return session && session.expiresAt > Date.now() ? session.userId : undefined;
}
function setSession(store, value, userId, lifetimeMs = 30 * 24 * 60 * 60 * 1000) {
  const id = sessionId(value);
  store.sessions = store.sessions.filter(item => item.id !== id && item.expiresAt > Date.now());
  store.sessions.push({ id, userId, expiresAt: Date.now() + lifetimeMs });
}
function deleteSession(store, value) { store.sessions = store.sessions.filter(item => item.id !== sessionId(value)); }
function currentUser(req, store) { const auth = req.headers.authorization || ''; const userId = getSessionUserId(store, auth.replace('Bearer ', '')); return store.users.find(user => user.id === userId); }
function audit(store, userId, action, metadata = {}) { store.audit.unshift({ id: id('audit'), userId, action, metadata, createdAt: new Date().toISOString() }); }
const geminiFields = {
  scholarship: ['ApplicantName', 'University', 'Professor', 'FieldOfStudy', 'PastResearch'],
  b2b: ['ContactName', 'Company', 'Role', 'BusinessNeed', 'Industry'],
  web_dev: ['ClientName', 'Company', 'WebsiteAuditNote', 'TechStack', 'BusinessGoal']
};
const draftSchema = { type: 'OBJECT', properties: { subject: { type: 'STRING' }, body: { type: 'STRING' } }, required: ['subject', 'body'] };
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function recipientAddress(row) { return String(row.email || row.Email || row.contactEmail || '').trim(); }
function contactName(row) { return row.Professor || row.ContactName || row.ClientName || row.ApplicantName || 'there'; }
async function geminiJson(prompt, schema) {
  if (!process.env.GEMINI_API_KEY) throw httpError(503, 'GEMINI_API_KEY is not configured');
  const model = encodeURIComponent(process.env.GEMINI_MODEL || 'gemini-2.5-flash');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Write concise, truthful, individualized plain-text outreach. Use only facts in the supplied data; never invent research, results, product capabilities, relationships, or prior contact. Do not include the recipient email address. Return only the requested JSON.' }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: schema }
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) throw httpError(502, 'Gemini could not generate the draft. Check the API key, model, and billing, then retry.');
  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
  if (!text) throw httpError(502, 'Gemini returned an empty response. Please retry.');
  try { return JSON.parse(text); }
  catch { throw httpError(502, 'Gemini returned an invalid draft response. Please retry.'); }
}
async function generateGeminiDrafts(rows, intent, senderName) {
  const generated = [];
  for (let offset = 0; offset < rows.length; offset += 10) {
    const batch = rows.slice(offset, offset + 10).map(row => Object.fromEntries(geminiFields[intent].filter(field => row[field] != null && String(row[field]).trim()).map(field => [field, String(row[field]).slice(0, 1000)])));
    const result = await geminiJson(JSON.stringify({ task: `Write one ${intents[intent]} email for each contact. Keep each message around 60-120 words. Sign as ${senderName || 'the sender'}. Preserve the array order and return exactly ${batch.length} drafts.`, contacts: batch }), {
      type: 'OBJECT', properties: { drafts: { type: 'ARRAY', items: draftSchema } }, required: ['drafts']
    });
    if (!Array.isArray(result.drafts) || result.drafts.length !== batch.length) throw httpError(502, 'Gemini returned the wrong number of drafts. Please retry.');
    generated.push(...result.drafts);
  }
  return generated.map((draft, index) => {
    const subject = String(draft.subject || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 180);
    const message = String(draft.body || '').trim().slice(0, 8000);
    if (!subject || !message) throw httpError(502, 'Gemini returned an incomplete draft. Please retry.');
    return { to: recipientAddress(rows[index]), name: contactName(rows[index]), subject, body: message };
  });
}
async function reviseGeminiDraft(draft, instruction) {
  const result = await geminiJson(JSON.stringify({ task: 'Revise this email according to the instruction. Preserve truthful facts and keep its intent.', instruction, subject: draft.subject, body: draft.body }), draftSchema);
  const subject = String(result.subject || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 180);
  const message = String(result.body || '').trim().slice(0, 8000);
  if (!subject || !message) throw httpError(502, 'Gemini returned an incomplete revision. Please retry.');
  return { subject, body: message };
}
async function exchangeGoogleCode(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: process.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }) });
  if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`);
  return response.json();
}
async function sendGmailMessage(user, recipient) {
  const tokens = JSON.parse(decrypt(user.gmailTokens));
  const message = [`To: ${recipient.data.email || recipient.data.Email || recipient.data.contactEmail}`, `Subject: ${recipient.subject}`, 'Content-Type: text/plain; charset=utf-8', '', recipient.body].join('\r\n');
  const raw = Buffer.from(message).toString('base64url');
  let response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
  if (response.status === 401 && tokens.refresh_token) {
    const refreshed = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }) });
    if (!refreshed.ok) throw new Error('Gmail access token refresh failed');
    const freshTokens = await refreshed.json();
    Object.assign(tokens, freshTokens);
    user.gmailTokens = encrypt(JSON.stringify(tokens));
    response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
  }
  if (!response.ok) throw new Error(`Gmail send failed: ${response.status} ${await response.text()}`);
}

export async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {}, req);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const store = await readStore();
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'signalcraft-api', time: new Date().toISOString() }, req);
    if (req.method === 'GET' && url.pathname === '/api/gmail/callback') {
      const stateToken = url.searchParams.get('state');
      const userId = getSessionUserId(store, `oauth:${stateToken}`);
      if (!userId) return json(res, 400, { error: 'Invalid OAuth state' }, req);
      deleteSession(store, `oauth:${stateToken}`);
      await writeStore(store);
      if (url.searchParams.has('error')) return json(res, 400, { error: 'Google authorization was not completed' }, req);
      const code = url.searchParams.get('code');
      if (!code) return json(res, 400, { error: 'Missing OAuth code' }, req);
      if (!process.env.GOOGLE_CLIENT_SECRET) return json(res, 503, { error: 'GOOGLE_CLIENT_SECRET is not configured' }, req);
      const target = store.users.find(item => item.id === userId);
      if (!target) return json(res, 401, { error: 'Account no longer exists' }, req);
      const googleTokens = await exchangeGoogleCode(code);
      target.gmailTokens = encrypt(JSON.stringify(googleTokens));
      audit(store, userId, 'GMAIL_CONNECTED');
      await writeStore(store);
      res.writeHead(302, { Location: frontendOrigin });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
      const input = await body(req); if (!input.email || !input.password || input.password.length < 8) return json(res, 400, { error: 'Email and an 8-character password are required' }, req);
      if (store.users.some(user => user.email === input.email.toLowerCase())) return json(res, 409, { error: 'An account already exists for this email' }, req);
      const user = { id: id('usr'), email: input.email.toLowerCase(), name: input.name || 'User', passwordHash: await hashPassword(input.password), createdAt: new Date().toISOString() }; store.users.push(user); audit(store, user.id, 'ACCOUNT_CREATED'); const session = token(); setSession(store, session, user.id); await writeStore(store); return json(res, 201, { token: session, user: { id: user.id, email: user.email, name: user.name } }, req);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const input = await body(req); const user = store.users.find(item => item.email === String(input.email || '').toLowerCase()); if (!user || !(await verifyPassword(input.password || '', user.passwordHash))) return json(res, 401, { error: 'Invalid email or password' }, req); const session = token(); setSession(store, session, user.id); await writeStore(store); return json(res, 200, { token: session, user: { id: user.id, email: user.email, name: user.name } }, req);
    }
    const user = currentUser(req, store); if (!user) return json(res, 401, { error: 'Authentication required' }, req);
    if (req.method === 'GET' && url.pathname === '/api/me') return json(res, 200, { id: user.id, email: user.email, name: user.name, gmailConnected: Boolean(user.gmailTokens), geminiConfigured: Boolean(process.env.GEMINI_API_KEY) }, req);
    if (req.method === 'GET' && url.pathname === '/api/campaigns') return json(res, 200, store.campaigns.filter(campaign => campaign.userId === user.id).map(campaign => ({ ...campaign, recipients: store.recipients.filter(row => row.campaignId === campaign.id) })), req);
    if (req.method === 'POST' && url.pathname === '/api/drafts/generate') {
      const input = await body(req);
      if (!intents[input.intentType]) return json(res, 400, { error: 'Unsupported intent type' }, req);
      if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 50) return json(res, 400, { error: 'Draft generation supports 1 to 50 contacts at a time' }, req);
      if (input.rows.some(row => !row || typeof row !== 'object' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientAddress(row)))) return json(res, 400, { error: 'Every contact needs a valid email address' }, req);
      return json(res, 200, { drafts: await generateGeminiDrafts(input.rows, input.intentType, user.name) }, req);
    }
    if (req.method === 'POST' && url.pathname === '/api/drafts/revise') {
      const input = await body(req);
      if (!input.draft || typeof input.draft.subject !== 'string' || typeof input.draft.body !== 'string' || !String(input.instruction || '').trim()) return json(res, 400, { error: 'A draft and revision instruction are required' }, req);
      if (String(input.instruction).length > 500 || input.draft.body.length > 8000) return json(res, 400, { error: 'The instruction or draft is too long' }, req);
      return json(res, 200, await reviseGeminiDraft(input.draft, String(input.instruction).slice(0, 500)), req);
    }
    if (req.method === 'POST' && url.pathname === '/api/campaigns') {
      const input = await body(req);
      const rows = Array.isArray(input.rows) ? input.rows : [];
      const drafts = Array.isArray(input.drafts) ? input.drafts : [];
      if (!intents[input.intentType]) return json(res, 400, { error: 'Unsupported intent type' }, req);
      if (rows.length < 1 || rows.length > 50 || rows.length !== drafts.length) return json(res, 400, { error: 'A reviewed draft is required for each of 1 to 50 contacts' }, req);
      const recipients = rows.map((row, index) => {
        const draft = drafts[index] || {};
        const subject = String(draft.subject || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 180);
        const message = String(draft.body || '').trim().slice(0, 8000);
        return { email: row && typeof row === 'object' ? recipientAddress(row) : '', subject, body: message };
      });
      if (recipients.some((recipient, index) => !rows[index] || typeof rows[index] !== 'object' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email) || !recipient.subject || !recipient.body)) return json(res, 400, { error: 'Each contact needs a valid email address and a complete reviewed draft' }, req);
      const campaign = { id: id('cmp'), userId: user.id, title: input.title || 'Untitled campaign', intentType: input.intentType, promptTemplate: input.promptTemplate || '', createdAt: new Date().toISOString() };
      store.campaigns.push(campaign);
      rows.forEach((row, index) => store.recipients.push({ id: id('rcp'), campaignId: campaign.id, data: row, subject: recipients[index].subject, body: recipients[index].body, status: 'PENDING', errorLog: null, sentAt: null }));
      audit(store, user.id, 'CAMPAIGN_CREATED', { campaignId: campaign.id, title: campaign.title });
      await writeStore(store);
      return json(res, 201, { ...campaign, recipients: store.recipients.filter(row => row.campaignId === campaign.id) }, req);
    }
    if (parts[0] === 'api' && parts[1] === 'campaigns' && parts[2] && parts[3] === 'dispatch' && req.method === 'POST') { const campaign = store.campaigns.find(item => item.id === parts[2] && item.userId === user.id); if (!campaign) return json(res, 404, { error: 'Campaign not found' }, req); if (!user.gmailTokens) return json(res, 400, { error: 'Connect Gmail before dispatching' }, req); const queue = store.recipients.filter(row => row.campaignId === campaign.id && row.status !== 'SENT').slice(0, 50); audit(store, user.id, 'DISPATCH_STARTED', { campaignId: campaign.id, count: queue.length }); await writeStore(store); dispatchQueue(store, user, campaign, queue); return json(res, 202, { queued: queue.length, message: 'Dispatch queue started' }, req); }
    if (parts[0] === 'api' && parts[1] === 'recipients' && parts[3] === 'retry' && req.method === 'POST') { const recipient = store.recipients.find(row => row.id === parts[2]); if (!recipient) return json(res, 404, { error: 'Recipient not found' }, req); recipient.status = 'PENDING'; recipient.errorLog = null; await writeStore(store); return json(res, 200, recipient, req); }
    if (req.method === 'GET' && url.pathname === '/api/activity') return json(res, 200, store.audit.filter(item => item.userId === user.id), req);
    if (req.method === 'GET' && url.pathname === '/api/gmail/connect') { if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) return json(res, 503, { error: 'Google OAuth is not configured', setup: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] }, req); const stateToken = token(); setSession(store, `oauth:${stateToken}`, user.id, 10 * 60 * 1000); await writeStore(store); const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GOOGLE_REDIRECT_URI, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: 'https://www.googleapis.com/auth/gmail.send', state: stateToken }); return json(res, 200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }, req); }
    return json(res, 404, { error: 'Route not found' }, req);
  } catch (error) { console.error(error); return json(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' }, req); }
}

async function dispatchQueue(store, user, campaign, queue) {
  for (const recipient of queue) {
    const productionDelay = 15000 + Math.floor(Math.random() * 30001);
    const demoMode = process.env.DEMO_MODE !== 'false';
    const delay = demoMode ? 100 : productionDelay;
    await new Promise(resolve => setTimeout(resolve, delay));
    try { if (!demoMode) await sendGmailMessage(user, recipient); else decrypt(user.gmailTokens); recipient.status = 'SENT'; recipient.sentAt = new Date().toISOString(); recipient.errorLog = null; }
    catch (error) { recipient.status = 'FAILED'; recipient.errorLog = error.message; }
    await writeStore(store);
  }
  audit(store, user.id, 'DISPATCH_FINISHED', { campaignId: campaign.id }); await writeStore(store);
}

export function createServer() {
  return http.createServer((req, res) => handleRequest(req, res));
}

export function startServer() {
  const server = createServer();
  server.listen(port, () => console.log(`Signalcraft API listening on http://127.0.0.1:${port}`));
  return server;
}

const isDirectExecution = typeof process.argv[1] === 'string' && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) startServer();
