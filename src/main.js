import './style.css';
import { resolveApiBase } from './config.js';

const intents = {
  web_dev: { label: 'Web & App Modernization', icon: '⌘', description: 'Website audit & scaling pitches', fields: ['ClientName', 'Company', 'WebsiteAuditNote', 'TechStack', 'BusinessGoal'] },
  b2b: { label: 'B2B Growth & Ops Scaling', icon: '◈', description: 'Bottleneck solutions & workflow automation', fields: ['ContactName', 'Company', 'Role', 'BusinessNeed', 'Industry'] },
  scholarship: { label: 'Scholarship outreach', icon: '✦', description: 'Academic inquiry letters', fields: ['ApplicantName', 'University', 'Professor', 'FieldOfStudy', 'PastResearch'] }
};

const sampleRows = [];

function nameFromEmail(email = '') {
  const localPart = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return localPart ? localPart.split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : 'Saad';
}

function getContactName(row) {
  if (!row) return 'Partner';
  return (
    row.ClientName ||
    row.ContactName ||
    row.Professor ||
    row.ApplicantName ||
    row.Name ||
    row.name ||
    row.FullName ||
    row.RecipientName ||
    (row.email ? row.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Partner')
  );
}

const savedUserName = localStorage.getItem('signalcraft-user');
const savedAuthEmail = localStorage.getItem('signalcraft-auth-email') || '';
const API_BASE = resolveApiBase(import.meta.env.VITE_API_URL);
let apiSyncStarted = false;

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = localStorage.getItem('signalcraft-api-token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API request failed (${response.status})`);
  return data;
}

function formatAction(action, metadata = {}) {
  switch (action) {
    case 'ACCOUNT_CREATED': return 'Account workspace initialized';
    case 'GMAIL_CONNECTED': return 'Gmail sender account connected';
    case 'CAMPAIGN_CREATED': return metadata.title ? `Created campaign "${metadata.title}"` : 'New campaign drafted';
    case 'DISPATCH_STARTED': return `Queued dispatch for ${metadata.count || ''} recipients`;
    case 'DISPATCH_FINISHED': return 'Email batch dispatch completed';
    default: return (action || 'System action').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
  }
}

function formatTimeAgo(isoString) {
  if (!isoString) return 'recently';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

async function syncApiSession() {
  if (!state.apiToken || apiSyncStarted) return;
  apiSyncStarted = true;
  try {
    const [profile, campaigns, activity] = await Promise.all([
      apiRequest('/me'),
      apiRequest('/campaigns').catch(() => []),
      apiRequest('/activity').catch(() => [])
    ]);
    state.userName = profile.name || state.userName;
    state.authEmail = profile.email || state.authEmail;
    state.gmailConnected = profile.gmailConnected;
    state.geminiConfigured = profile.geminiConfigured;
    state.campaignList = Array.isArray(campaigns) ? campaigns : [];
    state.activityList = Array.isArray(activity) ? activity : [];
    state.campaignCount = state.campaignList.length;

    let totalSent = 0;
    let totalFailed = 0;
    state.campaignList.forEach(cmp => {
      if (Array.isArray(cmp.recipients)) {
        cmp.recipients.forEach(r => {
          if (r.status === 'SENT') totalSent++;
          if (r.status === 'FAILED') totalFailed++;
        });
      }
    });
    state.sent = totalSent;
    state.failed = totalFailed;

    localStorage.setItem('signalcraft-user', state.userName);
    localStorage.setItem('signalcraft-auth-email', state.authEmail);
    render();
  } catch {
    apiSyncStarted = false;
  }
}

const state = {
  authenticated: localStorage.getItem('signalcraft-auth') === 'true' || Boolean(localStorage.getItem('signalcraft-api-token')),
  apiToken: localStorage.getItem('signalcraft-api-token') || '',
  authMode: 'login',
  userName: savedUserName && savedUserName !== 'Alex Smith' && savedAuthEmail !== 'alex@example.com' ? savedUserName : (savedAuthEmail && savedAuthEmail !== 'alex@example.com' ? nameFromEmail(savedAuthEmail) : 'Muhammad Saad Iqbal'),
  authEmail: savedAuthEmail,
  activeView: 'overview',
  intent: 'web_dev',
  campaignName: 'Nexyro IT - Client Growth & Web Transformation',
  campaignList: [],
  activityList: [],
  rows: [...sampleRows],
  drafts: [],
  selectedDraft: 0,
  search: '',
  status: 'Ready to launch',
  sending: false,
  sent: 0,
  failed: 0,
  campaignCount: 0,
  email: localStorage.getItem('signalcraft-email') || '',
  gmailConnected: localStorage.getItem('signalcraft-gmail-connected') === 'true',
  geminiConfigured: false,
  profileMenuOpen: false,
  copilotOpen: false,
  theme: localStorage.getItem('signalcraft-theme') || 'dark',
  assistantMessages: [{ role: 'assistant', text: 'Nexyro IT Copilot ready. Try “emphasize mobile speed audit”, “make it more concise”, or “focus on custom software”.' }],
  toast: ''
};

function applyTheme() {
  document.body.dataset.theme = state.theme;
  localStorage.setItem('signalcraft-theme', state.theme);
}

function makeDraft(row, intent) {
  const person = getContactName(row);
  const company = row.Company || 'your business';
  const auditNote = row.WebsiteAuditNote || 'a few technical friction points on your web experience that may be impacting conversion';
  const techStack = row.TechStack || 'current digital infrastructure';
  const businessNeed = row.BusinessNeed || 'modernizing core workflows and eliminating bottlenecks';
  const businessGoal = row.BusinessGoal || 'scale client acquisition and upscale revenue';

  if (intent === 'web_dev') return {
    to: row.email || 'client@example.com',
    name: person,
    subject: `Opportunities to upscale ${company}'s web platform & performance`,
    body: `Hi ${person},\n\nI spent some time reviewing ${company}'s digital presence and noticed ${auditNote}.\n\nAt Nexyro IT, we help ambitious companies solve these exact bottlenecks—upgrading ${techStack} into high-speed, modern, scalable web architectures built to ${businessGoal}.\n\nWe would love to share a quick 3-point action plan tailored for ${company}. Would a 10-minute working call next week be worth exploring?\n\nBest regards,\nMuhammad Saad Iqbal\nNexyro IT Team\nhttps://nexyro-it-website.vercel.app/`
  };

  if (intent === 'b2b') return {
    to: row.email || 'partner@example.com',
    name: person,
    subject: `Scaling ${company}'s operational growth & system efficiency`,
    body: `Hi ${person},\n\nI noticed ${company} is rapidly growing, but scaling operations often brings challenges around ${businessNeed}.\n\nNexyro IT specializes in engineering custom software, automated web portals, and scalable cloud infrastructure designed to remove these hurdles and upscale your business revenue.\n\nWe have a few concrete ideas tailored for ${company}. Would you be open to a brief 15-minute introductory conversation next Tuesday?\n\nBest regards,\nMuhammad Saad Iqbal\nNexyro IT Team\nhttps://nexyro-it-website.vercel.app/`
  };

  return {
    to: row.email || 'recipient@example.com',
    name: person,
    subject: `Inquiry regarding research collaboration with ${company}`,
    body: `Hi ${person},\n\nI recently came across your specialized work in ${row.FieldOfStudy || 'your domain'} and was especially impressed by ${row.PastResearch || 'your recent initiatives'}.\n\nOur team is exploring impactful technology applications in this space and would value the opportunity to exchange perspective on upcoming milestones.\n\nWould you be open to a brief conversation?\n\nBest regards,\nMuhammad Saad Iqbal\nNexyro IT Team\nhttps://nexyro-it-website.vercel.app/`
  };
}

function generateDrafts() { state.drafts = state.rows.map(row => makeDraft(row, state.intent)); }

generateDrafts();

function escapeHtml(value = '') { return value.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

function userInitials(name = '') {
  if (!name || name.toLowerCase() === 'there' || name.toLowerCase() === 'contact' || name.toLowerCase() === 'partner') return 'NX';
  const clean = name.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ? parts[0].slice(0, 2) : 'NX').toUpperCase();
}

function showToast(message) { state.toast = message; render(); setTimeout(() => { state.toast = ''; render(); }, 2800); }
function filteredDrafts() { return state.drafts.filter(d => `${d.name} ${d.to} ${d.subject}`.toLowerCase().includes(state.search.toLowerCase())); }
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(value => value.trim());
  return lines.slice(1).map(line => { const values = line.split(',').map(value => value.trim()); return Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])); });
}
async function persistCampaign() {
  return apiRequest('/campaigns', { method: 'POST', body: JSON.stringify({ title: state.campaignName, intentType: state.intent, rows: state.rows, drafts: state.drafts.map(({ subject, body }) => ({ subject, body })), promptTemplate: 'Nexyro IT high-converting outreach draft.' }) });
}
async function generateDraftsWithGemini() {
  const result = await apiRequest('/drafts/generate', { method: 'POST', body: JSON.stringify({ intentType: state.intent, rows: state.rows }) });
  if (!Array.isArray(result.drafts) || result.drafts.length !== state.rows.length) throw new Error('Gemini returned an incomplete set of drafts');
  state.drafts = result.drafts;
  state.selectedDraft = 0;
}
function runAssistantCommand(command) {
  const text = command.trim().toLowerCase();
  const draft = state.drafts[state.selectedDraft];
  if (!draft) return 'Select a draft first, then I can edit it.';
  if (text.includes('short')) draft.body = `${draft.body.split('\n\n').slice(0, 2).join('\n\n')}\n\nWould you be open to a brief conversation?\n\nBest regards,\nMuhammad Saad Iqbal\nNexyro IT Team\nhttps://nexyro-it-website.vercel.app/`;
  else if (text.includes('formal')) { draft.body = draft.body.replace(/^Hi /, 'Dear '); }
  else if (text.includes('b2b')) { state.intent = 'b2b'; generateDrafts(); }
  else if (text.includes('web')) { state.intent = 'web_dev'; generateDrafts(); }
  else if (text.includes('subject')) draft.subject = `Upscaling ${state.rows[state.selectedDraft]?.Company || 'your platform'} - Nexyro IT`;
  else if (text.includes('rename') || text.includes('name')) { const name = command.split(':').slice(1).join(':').trim(); if (name) state.campaignName = name; }
  else return 'Try: “make it shorter”, “focus on website speed”, “rewrite subject”, “switch to B2B”, or “rename: Fall growth campaign”.';
  return 'Done. I updated the campaign preview. Review the change before sending.';
}
async function applyAssistantCommand(command) {
  state.assistantMessages.push({ role: 'user', text: command });
  if (!state.apiToken) {
    state.assistantMessages.push({ role: 'assistant', text: runAssistantCommand(command) });
    render();
    return;
  }
  if (!state.geminiConfigured) {
    state.assistantMessages.push({ role: 'assistant', text: 'Gemini is not configured. Add GEMINI_API_KEY to the server .env file and restart the API.' });
    render();
    return;
  }
  const draft = state.drafts[state.selectedDraft];
  if (!draft) {
    state.assistantMessages.push({ role: 'assistant', text: 'Select a draft first, then I can revise it.' });
    render();
    return;
  }
  const response = { role: 'assistant', text: 'Revising draft with Gemini AI...' };
  state.assistantMessages.push(response);
  render();
  try {
    const revision = await apiRequest('/drafts/revise', { method: 'POST', body: JSON.stringify({ draft: { subject: draft.subject, body: draft.body }, instruction: command }) });
    Object.assign(draft, revision);
    response.text = 'Revision ready. Review the subject and message before sending.';
  } catch (error) {
    response.text = `Gemini revision failed: ${error.message}`;
  }
  render();
}

function authView() {
  const signup = state.authMode === 'signup';
  return `<main class="auth-shell"><div class="auth-brand"><span class="brand-mark">✳</span><strong>signalcraft</strong></div><section class="auth-card"><div class="auth-intro"><p class="eyebrow">OUTREACH OPERATIONS</p><h1>${signup ? 'Build your outreach workspace.' : 'Welcome back.'}</h1><p>${signup ? 'Create an account to turn thoughtful outreach into a repeatable system.' : 'Sign in to continue building conversations that feel human.'}</p></div><div class="auth-tabs"><button class="auth-tab ${!signup ? 'active' : ''}" data-auth-mode="login">Log in</button><button class="auth-tab ${signup ? 'active' : ''}" data-auth-mode="signup">Create account</button></div><form class="auth-form" data-auth-form><label>Email address<input type="email" name="email" placeholder="you@company.com" required value="${escapeHtml(state.authEmail)}" /></label>${signup ? '<label>Your name<input type="text" name="name" placeholder="Enter your name" required />' : ''}<label>Password<input type="password" name="password" placeholder="At least 8 characters" minlength="8" required /></label><button class="primary-button auth-submit" type="submit">${signup ? 'Create workspace' : 'Log in'} <span>→</span></button></form></section></main>`;
}

function assistantView() {
  if (!state.copilotOpen) return '';
  return `<aside class="assistant-card"><div class="assistant-heading"><div><span class="eyebrow">CAMPAIGN COPILOT</span><h2>Ask AI to edit</h2></div><button class="assistant-close-btn" data-action="toggle-copilot" title="Close Copilot">✕</button></div><div class="assistant-messages">${state.assistantMessages.map(message => `<div class="assistant-message ${message.role}">${escapeHtml(message.text)}</div>`).join('')}</div><div class="assistant-suggestions"><button data-assistant="Make it shorter">Shorter</button><button data-assistant="Emphasize speed & conversion">Speed audit</button><button data-assistant="Rewrite the subject">New subject</button></div><form class="assistant-form" data-assistant-form><input name="command" placeholder="Tell AI what to change..." autocomplete="off" /><button aria-label="Send instruction">↑</button></form><p class="assistant-note">Edits apply to the selected draft.</p></aside>`;
}

function settingsView() {
  return `<section class="page"><div class="page-heading"><div><p class="eyebrow">WORKSPACE SETTINGS</p><h1>Settings</h1><p class="subheading">Manage your account, sender connection, and AI preferences.</p></div><button class="primary-button" data-action="save-settings">Save changes</button></div><div class="settings-grid"><section class="settings-card"><div class="settings-card-title"><h2>Profile</h2><p>Your workspace identity.</p></div><label class="field-label">DISPLAY NAME<input class="text-input" data-setting-name value="${escapeHtml(state.userName)}" /></label><label class="field-label">ACCOUNT EMAIL<input class="text-input" data-setting-email value="${escapeHtml(state.authEmail)}" /></label></section><section class="settings-card"><div class="settings-card-title"><h2>Connections</h2><p>Services used for campaign delivery.</p></div><div class="connection-row"><span class="gmail-mark">M</span><div><strong>Gmail</strong><small>${state.gmailConnected ? 'Connected and ready to send' : 'Not connected'}</small></div><button class="outline-button" data-action="gmail">${state.gmailConnected ? 'Disconnect' : 'Connect Gmail'}</button></div><div class="connection-row"><span class="ai-mark">✧</span><div><strong>Gemini</strong><small>${state.geminiConfigured ? 'Draft generation ready' : 'API key not configured'}</small></div><span class="ready-label">${state.geminiConfigured ? 'Ready' : 'Setup needed'}</span></div></section><section class="settings-card wide"><div class="settings-card-title"><h2>Safety & delivery</h2><p>Protect sender reputation with controlled dispatch.</p></div><div class="setting-toggle"><div><strong>Randomized send delay</strong><small>Use a 15–45 second delay between messages in production.</small></div><span class="toggle on">●</span></div><div class="setting-toggle"><div><strong>Audit log</strong><small>Record campaign actions and delivery errors.</small></div><span class="toggle on">●</span></div><div class="legal-link-row"><button class="text-button" data-view="privacy">Privacy policy</button><button class="text-button" data-view="terms">Terms of service</button></div></section></div></section>`;
}

function legalPageView(kind) {
  const isPrivacy = kind === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
  const summary = isPrivacy ? 'We store account information, campaign contacts, and Gmail OAuth credentials encrypted at rest. Contact fields and revision instructions are sent to Google Gemini to generate or revise email drafts.' : 'Users agree to use the platform in compliance with CAN-SPAM, GDPR, and other applicable anti-spam regulations.';
  return `<section class="page legal-page"><div class="page-heading"><div><p class="eyebrow">LEGAL</p><h1>${title}</h1><p class="subheading">Security, compliance, and operating guardrails.</p></div><button class="primary-button" data-view="settings">Back to settings</button></div><div class="legal-shell"><div class="legal-card"><div class="terminal-badge">${isPrivacy ? 'DATA PROTECTION' : 'USAGE TERMS'}</div><p>${summary}</p><h3>Core requirements</h3><ul>${isPrivacy ? '<li>Account data and uploaded spreadsheets are stored securely in Firestore.</li><li>Credentials are encrypted at rest using AES-256-GCM.</li>' : '<li>Users remain responsible for recipient consent and anti-spam compliance.</li>'}</ul></div></div></section>`;
}

function notFoundView() {
  return `<section class="page not-found-page"><div class="terminal-shell"><div class="terminal-header"><span class="terminal-dot red"></span><span class="terminal-dot yellow"></span><span class="terminal-dot green"></span><span class="terminal-title">signalcraft / error</span></div><div class="terminal-body"><div class="status-badge">HTTP 404: Route Not Found</div><h1>That route does not exist.</h1><p>Use the dashboard to return to your active campaigns.</p><div class="terminal-actions"><button class="primary-button" data-view="overview">Return to dashboard</button></div></div></div></section>`;
}

function render() {
  applyTheme();
  if (!state.authenticated) {
    document.querySelector('#app').innerHTML = authView();
    bindEvents();
    return;
  }
  const active = state.activeView;
  const drafts = filteredDrafts();
  const pageContent = active === 'overview' ? overviewView() : active === 'settings' ? settingsView() : active === 'privacy' ? legalPageView('privacy') : active === 'terms' ? legalPageView('terms') : active === 'not-found' ? notFoundView() : campaignView(active);
  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">✳</span><span>signalcraft</span></div>
        <div class="workspace-label">WORKSPACE</div>
        <nav>
          ${[['overview','Overview','◒'],['campaigns','Campaigns','◎'],['contacts','Contacts','◌'],['activity','Activity','≋'],['settings','Settings','⚙']].map(([id,label,icon]) => `<button class="nav-item ${active === id ? 'active' : ''}" data-view="${id}"><span>${icon}</span>${label}${id === 'campaigns' && state.campaignCount > 0 ? `<small>${state.campaignCount}</small>` : ''}</button>`).join('')}
        </nav>
        <div class="sidebar-bottom"><div class="profile" data-action="open-settings" title="Open profile settings"><div class="avatar">${userInitials(state.userName)}</div><div><strong>${escapeHtml(state.userName)}</strong><small>${escapeHtml(state.authEmail || 'Admin workspace')}</small></div><button class="logout-button" data-action="logout" title="Log out">↪</button></div></div>
      </aside>
      <main class="main-content">
        <header class="topbar"><div class="crumb">${active === 'overview' ? 'Overview' : active === 'privacy' ? 'Privacy Policy' : active === 'terms' ? 'Terms of Service' : active === 'not-found' ? 'Error' : active[0].toUpperCase() + active.slice(1)}</div><div class="top-actions"><button class="icon-button" aria-label="Toggle theme" data-theme-toggle>${state.theme === 'dark' ? '☀' : '☾'}</button><button class="icon-button" aria-label="Notifications" data-action="notifications">♧<i></i></button><div class="profile-menu"><button class="profile-menu-trigger" data-action="toggle-profile" aria-label="Open account menu"><span class="avatar avatar-small">${userInitials(state.userName)}</span><span class="profile-menu-name">${escapeHtml(state.userName)}</span><span class="profile-chevron">⌄</span></button>${state.profileMenuOpen ? '<div class="profile-dropdown"><button data-action="open-settings">⚙ &nbsp; Settings</button><button data-action="view-privacy">▣ &nbsp; Privacy</button><button class="dropdown-logout" data-action="logout">↪ &nbsp; Log out</button></div>' : ''}</div></div></header>
        ${pageContent}
        ${active === 'campaigns' ? `<button class="copilot-fab" data-action="toggle-copilot"><span class="copilot-fab-spark">✧</span><span>${state.copilotOpen ? 'Hide Copilot' : 'Campaign AI Copilot'}</span></button>` : ''}
        ${active === 'campaigns' ? assistantView() : ''}
        ${active === 'campaigns' ? '<input class="file-input" type="file" accept=".csv,text/csv" />' : ''}
      </main>
      ${state.toast ? `<div class="toast">✓ &nbsp;${escapeHtml(state.toast)}</div>` : ''}
    </div>`;
  bindEvents();
  syncApiSession();
}

function overviewView() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  const firstName = escapeHtml(state.userName.split(' ')[0] || 'there');

  return `<section class="page"><div class="page-heading"><div><p class="eyebrow">${dateStr}</p><h1>${greeting}, ${firstName} <span class="sun">✦</span></h1><p class="subheading">Your outreach engine is active. Here’s the live pulse.</p></div><button class="primary-button" data-action="new-campaign">＋ New campaign</button></div>
    <div class="metric-grid"><div class="metric-card accent"><div class="metric-label">SENT THIS MONTH <span>↗</span></div><div class="metric-value">${state.sent.toLocaleString()}</div><div class="metric-foot"><span class="positive">Live</span> backend dispatch count</div><div class="sparkline"><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b></div></div><div class="metric-card"><div class="metric-label">REPLY RATE <span>↗</span></div><div class="metric-value">${state.sent > 0 ? '—' : '0.0%'}</div><div class="metric-foot">Awaiting replies</div><div class="mini-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="metric-card"><div class="metric-label">ACTIVE CAMPAIGNS</div><div class="metric-value">${state.campaignCount}</div><div class="metric-foot">${state.campaignCount === 1 ? '1 active campaign' : `${state.campaignCount} active campaigns`}</div><div class="orbit">◌</div></div><div class="metric-card"><div class="metric-label">FAILED DELIVERIES</div><div class="metric-value ${state.failed > 0 ? 'warning' : ''}">${state.failed}</div><div class="metric-foot">${state.failed > 0 ? 'Need your attention' : 'All deliveries clean'}</div><div class="failure-dot">${state.failed > 0 ? '!' : '✓'}</div></div></div>
    <div class="section-row"><div><h2>Campaign pulse</h2><p class="section-note">Live performance across your active campaigns</p></div><button class="text-button" data-view="campaigns">Create / View campaigns <span>→</span></button></div>
    ${state.campaignList.length > 0 ? `
    <div class="campaign-table"><div class="table-head"><span>CAMPAIGN</span><span>TYPE</span><span>PROGRESS</span><span>RECIPIENTS</span><span>STATUS</span><span></span></div>${state.campaignList.map((c, i) => {
      const rec = Array.isArray(c.recipients) ? c.recipients : [];
      const sentCount = rec.filter(r => r.status === 'SENT').length;
      const pct = rec.length ? Math.round((sentCount / rec.length) * 100) : 0;
      const status = sentCount === rec.length && rec.length > 0 ? 'Complete' : 'Running';
      return `<div class="table-row"><div class="campaign-name"><span class="campaign-icon c${i % 4}">${i % 4 === 0 ? '✦' : i % 4 === 1 ? '◈' : i % 4 === 2 ? '⌘' : '○'}</span><strong>${escapeHtml(c.title || 'Untitled Campaign')}</strong></div><span class="type-tag">${escapeHtml(intents[c.intentType]?.label || c.intentType)}</span><div class="progress-wrap"><div class="progress"><i style="width:${pct}%"></i></div><small>${pct}%</small></div><span class="reply">${sentCount}/${rec.length}</span><span class="status-pill ${status.toLowerCase()}"><i></i>${status}</span><button class="row-more">•••</button></div>`;
    }).join('')}</div>` : `
    <div style="padding: 32px; text-align: center; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; margin-bottom: 24px;">
      <p style="color: var(--text-muted, #888); margin-bottom: 12px; font-size: 0.95rem;">No campaigns created yet in your workspace.</p>
      <button class="primary-button small" data-action="new-campaign">＋ Create your first campaign</button>
    </div>`}
    <div class="bottom-grid"><div class="insight-panel"><div class="panel-heading"><div><h2>Outreach insight</h2><p class="section-note">Nexyro IT conversion strategy</p></div><span class="insight-icon">✧</span></div><p class="insight-copy">Emails addressing <strong>specific website audit bottlenecks & scalability</strong> get <strong>3.2× more replies</strong> than generic pitches. Use Gemini AI to tailor each pitch.</p><button class="outline-button" data-action="new-campaign">Build a campaign <span>→</span></button></div><div class="activity-panel"><div class="panel-heading"><div><h2>Recent activity</h2><p class="section-note">Live audit events</p></div><button class="text-button" data-view="activity">See all</button></div>${state.activityList.length > 0 ? state.activityList.slice(0, 4).map(item => `
    <div class="activity-item"><span class="activity-dot ${item.action.includes('FAIL') ? 'red' : item.action.includes('ACCOUNT') ? 'blue' : 'green'}"></span><div><strong>${escapeHtml(formatAction(item.action, item.metadata))}</strong><p>${escapeHtml(state.userName)}</p></div><time>${formatTimeAgo(item.createdAt)}</time></div>`).join('') : '<p style="color: var(--text-muted, #888); padding: 16px 0;">No recent audit activity.</p>'}</div></div></section>`;
}

function campaignView(view) {
  const drafts = filteredDrafts();
  const isContacts = view === 'contacts';
  const isActivity = view === 'activity';
  if (isContacts) return `<section class="page"><div class="page-heading"><div><p class="eyebrow">PROSPECT DIRECTORY</p><h1>Contacts</h1><p class="subheading">${state.rows.length} verified company prospects loaded for outreach.</p></div><button class="primary-button" data-action="upload">＋ Import CSV contacts</button></div><div class="toolbar"><div class="search"><span>⌕</span><input data-search placeholder="Search contacts by company or name" value="${state.search}" /></div><span class="toolbar-count">${state.rows.length} prospects</span></div><div class="contact-grid">${state.rows.length > 0 ? state.rows.map((r,i) => {
    const contactName = getContactName(r);
    return `<div class="contact-card"><div class="contact-avatar">${userInitials(contactName)}</div><div><strong>${escapeHtml(contactName)}</strong><p>${escapeHtml(r.Company || r.University || 'Company')}</p><small>${escapeHtml(r.email || '')}</small></div><span class="contact-status">Ready</span></div>`;
  }).join('') : `<div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; border: 1px dashed rgba(255,255,255,0.12); border-radius: 16px;"><p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 16px;">No contacts loaded yet. Import a CSV file to add your prospects.</p><button class="primary-button" data-action="upload">＋ Import CSV contacts</button></div>`}</div></section>`;
  if (isActivity) return `<section class="page"><div class="page-heading"><div><p class="eyebrow">AUDIT LOG</p><h1>Activity</h1><p class="subheading">A clear record of every campaign action.</p></div></div><div class="activity-log">${state.activityList.length > 0 ? state.activityList.map((item, i) => `<div class="log-row"><span class="log-icon">${item.action.includes('FAIL') ? '!' : '✓'}</span><div><strong>${escapeHtml(formatAction(item.action, item.metadata))}</strong><p>${escapeHtml(state.userName)} · ${formatTimeAgo(item.createdAt)}</p></div><span class="log-kind">${item.action.includes('FAIL') ? 'ATTENTION' : 'SYSTEM'}</span></div>`).join('') : '<div style="padding: 32px; text-align: center; color: var(--text-muted, #888);">No activity recorded yet.</div>'}</div></section>`;
  
  return `<section class="page"><div class="page-heading"><div><p class="eyebrow">CAMPAIGN STUDIO</p><h1>Build an outreach campaign</h1><p class="subheading">Convert prospects with targeted website audits & business scaling proposals.</p></div><div class="draft-status"><span class="status-dot"></span>${state.status}</div></div><div class="studio-grid"><div class="studio-main"><div class="stepper"><span class="step done">01 <b>Audience</b></span><span class="step-line"></span><span class="step active">02 <b>Intent & proposal</b></span><span class="step-line"></span><span class="step">03 <b>Review & send</b></span></div><div class="studio-card"><div class="card-title"><div><h2>Choose outreach focus</h2><p>Signalcraft crafts personalized pitches addressing specific pain points.</p></div></div><div class="intent-grid">${Object.entries(intents).map(([key,item]) => `<button class="intent-card ${state.intent === key ? 'selected' : ''}" data-intent="${key}"><span class="intent-icon">${item.icon}</span><strong>${item.label}</strong><small>${item.description}</small><span class="radio">${state.intent === key ? '●' : '○'}</span></button>`).join('')}</div><label class="field-label">CAMPAIGN NAME<input class="text-input" data-campaign-name value="${escapeHtml(state.campaignName)}" /></label><label class="field-label">GMAIL SENDER ACCOUNT<div class="sender-input ${state.gmailConnected ? 'gmail-ready' : ''}"><span class="gmail-mark">M</span><input data-email value="${escapeHtml(state.email)}" ${state.gmailConnected ? '' : 'placeholder="Connect Gmail first"'} /><button class="gmail-connect" data-action="gmail">${state.gmailConnected ? 'Disconnect' : 'Connect Gmail'}</button></div></label><p class="connection-help">${state.gmailConnected ? 'Gmail connected. Outbound emails will be dispatched safely.' : 'Connect Gmail with OAuth before dispatching a campaign.'}</p><div class="upload-zone" data-action="upload"><span class="upload-icon">↥</span><div><strong>Drop a CSV or Excel file here</strong><p>or click to browse · ${state.rows.length} prospects loaded</p></div><button class="outline-button small">Choose file</button></div><div class="mapping-head"><div><h3>Column mapping</h3><p>We found ${Object.keys(state.rows[0] || {}).length} columns in your file.</p></div><button class="text-button" data-action="regenerate">↻ Generate with Gemini AI</button></div><div class="mapping-list">${intents[state.intent].fields.slice(0,4).map((field,i) => `<div class="mapping-row"><span>${field}</span><span class="mapping-arrow">→</span><select><option>${Object.keys(state.rows[0] || {})[i] || field}</option></select><span class="mapping-check">✓</span></div>`).join('')}</div></div></div><aside class="preview-card"><div class="preview-head"><div><span class="eyebrow">LIVE PREVIEW</span><h2>Message drafts</h2></div><span class="draft-count">${state.drafts.length} drafts</span></div><div class="draft-tabs">${drafts.map((d,i) => {
    const displayName = d.name.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').split(' ')[0] || `Prospect ${i+1}`;
    return `<button class="draft-tab ${state.selectedDraft === i ? 'active' : ''}" data-draft="${i}"><span class="tab-initials">${userInitials(d.name)}</span><span class="tab-name">${escapeHtml(displayName)}</span></button>`;
  }).join('')}</div>${drafts.length ? `<div class="message-meta"><span>TO</span><strong>${drafts[state.selectedDraft]?.to}</strong></div><input class="subject-input" data-subject value="${escapeHtml(drafts[state.selectedDraft]?.subject || '')}" /><textarea class="body-input" data-body>${escapeHtml(drafts[state.selectedDraft]?.body || '')}</textarea><div class="preview-footer"><span>✨ AI draft · Editable</span><button class="primary-button send-button" data-action="send" ${state.gmailConnected ? '' : 'disabled title="Connect Gmail first"'}>Send campaign →</button></div>` : '<div style="padding: 40px 16px; text-align: center; color: var(--text-muted);"><p style="font-size: 0.95rem; margin-bottom: 16px;">No drafts available.</p><p style="font-size: 0.85rem; margin-bottom: 20px;">Upload a CSV or Excel file to load your recipient prospects and generate personalized emails.</p><button class="outline-button small" data-action="upload">＋ Import CSV File</button></div>'}</aside></div></section>`;
}

function bindEvents() {
  document.querySelectorAll('[data-assistant]').forEach(el => el.addEventListener('click', () => applyAssistantCommand(el.dataset.assistant)));
  document.querySelector('[data-assistant-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = event.currentTarget.elements.command;
    const command = input.value.trim();
    if (!command) return;
    applyAssistantCommand(command);
  });
  document.querySelectorAll('[data-action="toggle-copilot"]').forEach(el => el.addEventListener('click', () => {
    state.copilotOpen = !state.copilotOpen;
    render();
  }));
  document.querySelectorAll('[data-auth-mode]').forEach(el => el.addEventListener('click', () => { state.authMode = el.dataset.authMode; render(); }));
  document.querySelector('[data-auth-form]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.authEmail = String(form.get('email') || '');
    state.userName = String(form.get('name') || nameFromEmail(state.authEmail));
    const endpoint = state.authMode === 'signup' ? '/auth/signup' : '/auth/login';
    try {
      const result = await apiRequest(endpoint, { method: 'POST', body: JSON.stringify({ email: state.authEmail, name: state.userName, password: String(form.get('password') || '') }) });
      state.apiToken = result.token;
      state.userName = result.user.name;
      state.authEmail = result.user.email;
      localStorage.setItem('signalcraft-api-token', result.token);
      showToast('Connected to Signalcraft API');
    } catch (error) {
      state.apiToken = '';
      showToast(`Signed in: ${error.message}`);
    }
    state.authenticated = true;
    localStorage.setItem('signalcraft-auth', 'true');
    localStorage.setItem('signalcraft-user', state.userName);
    localStorage.setItem('signalcraft-auth-email', state.authEmail);
    render();
  });
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    render();
  });
  document.querySelectorAll('[data-action="view-privacy"]').forEach(el => el.addEventListener('click', () => {
    state.activeView = 'privacy';
    state.profileMenuOpen = false;
    render();
  }));
  document.querySelector('[data-action="toggle-profile"]')?.addEventListener('click', () => { state.profileMenuOpen = !state.profileMenuOpen; render(); });
  document.querySelectorAll('[data-action="logout"]').forEach(el => el.addEventListener('click', () => {
    state.authenticated = false;
    state.profileMenuOpen = false;
    state.gmailConnected = false;
    localStorage.removeItem('signalcraft-auth');
    localStorage.removeItem('signalcraft-api-token');
    localStorage.removeItem('signalcraft-gmail-connected');
    render();
  }));
  document.querySelectorAll('[data-action="open-settings"]').forEach(el => el.addEventListener('click', event => {
    if (event.target.closest('[data-action="logout"]')) return;
    state.activeView = 'settings';
    render();
  }));
  document.querySelectorAll('[data-action="gmail"]').forEach(el => el.addEventListener('click', async () => {
    if (state.apiToken && !state.gmailConnected) {
      try {
        const result = await apiRequest('/gmail/connect');
        window.location.href = result.url;
      } catch (error) {
        showToast(`Gmail setup: ${error.message}`);
      }
      return;
    }
    state.gmailConnected = !state.gmailConnected;
    localStorage.setItem('signalcraft-gmail-connected', String(state.gmailConnected));
    showToast(state.gmailConnected ? 'Gmail connected for this session' : 'Gmail disconnected');
  }));
  document.querySelector('[data-action="save-settings"]')?.addEventListener('click', () => {
    state.userName = document.querySelector('[data-setting-name]')?.value || state.userName;
    state.authEmail = document.querySelector('[data-setting-email]')?.value || state.authEmail;
    localStorage.setItem('signalcraft-user', state.userName);
    localStorage.setItem('signalcraft-auth-email', state.authEmail);
    showToast('Settings saved');
  });
  document.querySelector('[data-action="notifications"]')?.addEventListener('click', () => { state.activeView = 'activity'; render(); });
  document.querySelectorAll('[data-action="open-campaign"]').forEach(el => el.addEventListener('click', () => { state.activeView = 'campaigns'; render(); }));
  document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => { state.activeView = el.dataset.view; render(); }));
  document.querySelectorAll('[data-intent]').forEach(el => el.addEventListener('click', () => { state.intent = el.dataset.intent; generateDrafts(); state.selectedDraft = 0; render(); }));
  document.querySelectorAll('[data-draft]').forEach(el => el.addEventListener('click', () => { state.selectedDraft = Number(el.dataset.draft); render(); }));
  document.querySelectorAll('[data-action="new-campaign"]').forEach(el => el.addEventListener('click', () => { state.activeView = 'campaigns'; render(); }));
  document.querySelectorAll('[data-action="regenerate"]').forEach(el => el.addEventListener('click', async () => {
    if (!state.apiToken) return showToast('Sign in to the API to generate drafts with Gemini');
    if (!state.geminiConfigured) return showToast('Add GEMINI_API_KEY to the server .env file and restart the API');
    state.status = 'Generating drafts with Gemini';
    render();
    try {
      await generateDraftsWithGemini();
      state.status = 'Drafts ready for review';
      showToast('Gemini drafts generated. Review each one before sending');
    } catch (error) {
      state.status = 'Draft generation failed';
      showToast(`Gemini: ${error.message}`);
    }
  }));
  document.querySelectorAll('[data-action="upload"]').forEach(el => el.addEventListener('click', event => { if (event.target.matches('.file-input')) return; document.querySelector('.file-input')?.click(); }));
  document.querySelector('.file-input')?.addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const rows = parseCsv(String(reader.result)); if (!rows.length) return showToast('Could not find rows in this CSV'); state.rows = rows; generateDrafts(); showToast(`${rows.length} contacts imported`); }; reader.readAsText(file); });
  document.querySelector('[data-action="send"]')?.addEventListener('click', async () => {
    if (!state.gmailConnected) { showToast('Connect Gmail before sending'); return; }
    state.sending = true;
    state.status = state.apiToken ? 'Saving campaign to API' : 'Dispatching with safety delays';
    render();
    try {
      if (state.apiToken) {
        const campaign = await persistCampaign();
        await apiRequest(`/campaigns/${campaign.id}/dispatch`, { method: 'POST' });
        state.status = 'Campaign queued by API';
        showToast(`${campaign.recipients.length} recipients queued on the backend`);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1200));
        state.status = 'Campaign complete';
        state.sent += state.rows.length;
        showToast(`${state.rows.length} messages queued successfully`);
      }
    } catch (error) {
      state.status = 'Action needs attention';
      showToast(`Backend: ${error.message}`);
    } finally {
      state.sending = false;
      render();
    }
  });
  document.querySelector('[data-search]')?.addEventListener('input', e => { state.search = e.target.value; render(); const input = document.querySelector('[data-search]'); input?.focus(); input?.setSelectionRange(state.search.length, state.search.length); });
  document.querySelector('[data-campaign-name]')?.addEventListener('change', e => state.campaignName = e.target.value);
  document.querySelector('[data-email]')?.addEventListener('change', e => { state.email = e.target.value; localStorage.setItem('signalcraft-email', state.email); });
  document.querySelector('[data-subject]')?.addEventListener('input', e => { if (state.drafts[state.selectedDraft]) state.drafts[state.selectedDraft].subject = e.target.value; });
  document.querySelector('[data-body]')?.addEventListener('input', e => { if (state.drafts[state.selectedDraft]) state.drafts[state.selectedDraft].body = e.target.value; });
}

render();
