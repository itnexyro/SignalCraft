import './style.css';
import { resolveApiBase } from './config.js';

const intents = {
  scholarship: { label: 'Scholarship outreach', icon: '✦', description: 'Academic inquiry letters', fields: ['ApplicantName', 'University', 'Professor', 'FieldOfStudy', 'PastResearch'] },
  b2b: { label: 'B2B proposal', icon: '◈', description: 'Partnership conversations', fields: ['ContactName', 'Company', 'Role', 'BusinessNeed', 'Industry'] },
  web_dev: { label: 'App & web development', icon: '⌘', description: 'Digital transformation pitches', fields: ['ClientName', 'Company', 'WebsiteAuditNote', 'TechStack', 'BusinessGoal'] }
};

const sampleRows = [
  { ApplicantName: 'Maya Chen', University: 'University of Toronto', Professor: 'Dr. Elena Vasquez', FieldOfStudy: 'Computational Biology', PastResearch: 'Protein folding models for rare disease research', email: 'elena.vasquez@utoronto.ca' },
  { ApplicantName: 'Jon Bell', University: 'Georgia Tech', Professor: 'Dr. Marcus Reed', FieldOfStudy: 'Human-computer interaction', PastResearch: 'Accessible interfaces for older adults', email: 'marcus.reed@gatech.edu' },
  { ApplicantName: 'Amina Okafor', University: 'University of Edinburgh', Professor: 'Dr. Priya Nair', FieldOfStudy: 'Climate informatics', PastResearch: 'Satellite data and coastal resilience', email: 'priya.nair@ed.ac.uk' },
  { ApplicantName: 'Leo Martinez', University: 'UC San Diego', Professor: 'Dr. Samir Patel', FieldOfStudy: 'Robotics', PastResearch: 'Low-cost tactile sensing systems', email: 'samir.patel@ucsd.edu' }
];

function nameFromEmail(email = '') {
  const localPart = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return localPart ? localPart.split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : 'Saad';
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

async function syncApiSession() {
  if (!state.apiToken || apiSyncStarted) return;
  apiSyncStarted = true;
  try {
    const [profile, campaigns] = await Promise.all([apiRequest('/me'), apiRequest('/campaigns')]);
    state.userName = profile.name;
    state.authEmail = profile.email;
    state.gmailConnected = profile.gmailConnected;
    state.geminiConfigured = profile.geminiConfigured;
    state.campaignCount = campaigns.length;
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
  userName: savedUserName && savedUserName !== 'Alex Smith' && savedAuthEmail !== 'alex@example.com' ? savedUserName : (savedAuthEmail && savedAuthEmail !== 'alex@example.com' ? nameFromEmail(savedAuthEmail) : 'Saad'),
  authEmail: savedAuthEmail,
  activeView: 'overview',
  intent: 'scholarship',
  campaignName: 'Spring faculty outreach',
  rows: [...sampleRows],
  drafts: [],
  selectedDraft: 0,
  search: '',
  status: 'Ready to launch',
  sending: false,
  sent: 128,
  failed: 3,
  campaignCount: 6,
  email: localStorage.getItem('signalcraft-email') || 'outreach@northstar.studio',
  gmailConnected: localStorage.getItem('signalcraft-gmail-connected') === 'true',
  geminiConfigured: false,
  profileMenuOpen: false,
  theme: localStorage.getItem('signalcraft-theme') || 'dark',
  assistantMessages: [{ role: 'assistant', text: 'I can edit this campaign for you. Try “make it shorter”, “make it more formal”, or “switch to B2B”.' }],
  toast: ''
};

function applyTheme() {
  document.body.dataset.theme = state.theme;
  localStorage.setItem('signalcraft-theme', state.theme);
}

function makeDraft(row, intent) {
  const first = row.ApplicantName || row.ClientName || row.ContactName || 'there';
  const person = row.Professor || row.ContactName || 'there';
  if (intent === 'scholarship') return {
    to: row.email || 'recipient@example.com',
    name: person,
    subject: `A question about ${row.FieldOfStudy || 'your research'} at ${row.University || 'your university'}`,
    body: `Hi ${person},\n\nI recently came across your work in ${row.FieldOfStudy || 'this field'} and was especially interested in ${row.PastResearch || 'your recent research'}.\n\nI am exploring next steps in this area and would value your perspective on the questions your lab is prioritising this year. Would you be open to a brief conversation?\n\nWarmly,\n${first}`
  };
  if (intent === 'b2b') return {
    to: row.email || 'partner@example.com', name: row.ContactName || 'there',
    subject: `A practical idea for ${row.Company || 'your team'}`,
    body: `Hi ${row.ContactName || 'there'},\n\nI noticed ${row.Company || 'your team'} is working in ${row.Industry || 'a fast-moving market'}. We help teams turn ${row.BusinessNeed || 'complex operational priorities'} into focused, measurable growth.\n\nI have one idea that could be useful for your roadmap. Is a 15-minute conversation next week worth exploring?\n\nBest,\nNorthstar Studio`
  };
  return {
    to: row.email || 'client@example.com', name: row.ClientName || 'there',
    subject: `One opportunity I spotted on ${row.Company || 'your digital experience'}`,
    body: `Hi ${row.ClientName || 'there'},\n\nI spent a few minutes looking at ${row.Company || 'your product'} and noticed ${row.WebsiteAuditNote || 'a small opportunity to make the customer journey clearer'}.\n\nOur team helps ambitious companies modernise the parts of their digital experience that quietly hold growth back. Your ${row.TechStack || 'current stack'} looks like a strong foundation.\n\nWould a short working session be useful?\n\nBest,\nNorthstar Studio`
  };
}

function generateDrafts() { state.drafts = state.rows.map(row => makeDraft(row, state.intent)); }

generateDrafts();

function escapeHtml(value = '') { return value.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function userInitials(name = '') { return name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'U'; }
function showToast(message) { state.toast = message; render(); setTimeout(() => { state.toast = ''; render(); }, 2800); }
function filteredDrafts() { return state.drafts.filter(d => `${d.name} ${d.to} ${d.subject}`.toLowerCase().includes(state.search.toLowerCase())); }
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(value => value.trim());
  return lines.slice(1).map(line => { const values = line.split(',').map(value => value.trim()); return Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])); });
}
async function persistCampaign() {
  return apiRequest('/campaigns', { method: 'POST', body: JSON.stringify({ title: state.campaignName, intentType: state.intent, rows: state.rows, drafts: state.drafts.map(({ subject, body }) => ({ subject, body })), promptTemplate: 'Personalized outreach draft generated from mapped audience fields.' }) });
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
  if (text.includes('short')) draft.body = `${draft.body.split('\n\n').slice(0, 2).join('\n\n')}\n\nWould you be open to a brief conversation?`;
  else if (text.includes('formal')) { draft.body = draft.body.replace(/^Hi /, 'Dear ').replace(/Best,|Warmly,/, 'Kind regards,'); }
  else if (text.includes('friendly') || text.includes('casual')) { draft.body = draft.body.replace(/^Dear /, 'Hi ').replace('Kind regards,', 'Warmly,'); }
  else if (text.includes('subject')) draft.subject = `A thoughtful idea for ${state.rows[state.selectedDraft]?.Company || state.rows[state.selectedDraft]?.University || 'your team'}`;
  else if (text.includes('b2b')) { state.intent = 'b2b'; generateDrafts(); }
  else if (text.includes('scholar')) { state.intent = 'scholarship'; generateDrafts(); }
  else if (text.includes('web') || text.includes('development')) { state.intent = 'web_dev'; generateDrafts(); }
  else if (text.includes('rename') || text.includes('name')) { const name = command.split(':').slice(1).join(':').trim(); if (name) state.campaignName = name; }
  else return 'Try: “make it shorter”, “make it formal”, “rewrite subject”, “switch to B2B”, or “rename: Fall faculty outreach”.';
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
  const response = { role: 'assistant', text: 'Revising draft with Gemini...' };
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
  return `<main class="auth-shell"><div class="auth-brand"><span class="brand-mark">✳</span><strong>signalcraft</strong></div><section class="auth-card"><div class="auth-intro"><p class="eyebrow">OUTREACH OPERATIONS</p><h1>${signup ? 'Build your outreach workspace.' : 'Welcome back, Alex.'}</h1><p>${signup ? 'Create an account to turn thoughtful outreach into a repeatable system.' : 'Sign in to continue building conversations that feel human.'}</p></div><div class="auth-tabs"><button class="auth-tab ${!signup ? 'active' : ''}" data-auth-mode="login">Log in</button><button class="auth-tab ${signup ? 'active' : ''}" data-auth-mode="signup">Create account</button></div><form class="auth-form" data-auth-form><label>Email address<input type="email" name="email" placeholder="you@company.com" required value="${escapeHtml(state.authEmail)}" /></label>${signup ? '<label>Your name<input type="text" name="name" placeholder="Alex Smith" required /></label>' : ''}<label>Password<input type="password" name="password" placeholder="At least 8 characters" minlength="8" required /></label><button class="primary-button auth-submit" type="submit">${signup ? 'Create workspace' : 'Log in'} <span>→</span></button></form><p class="auth-note">Demo mode stores only a local session. Production auth should use a secure server session.</p></section></main>`;
}

function assistantView() {
  return `<aside class="assistant-card"><div class="assistant-heading"><div><span class="eyebrow">CAMPAIGN COPILOT</span><h2>Ask me to edit</h2></div><span class="assistant-spark">✧</span></div><div class="assistant-messages">${state.assistantMessages.map(message => `<div class="assistant-message ${message.role}">${escapeHtml(message.text)}</div>`).join('')}</div><div class="assistant-suggestions"><button data-assistant="Make it shorter">Shorter</button><button data-assistant="Make it more formal">Formal</button><button data-assistant="Rewrite the subject">New subject</button></div><form class="assistant-form" data-assistant-form><input name="command" placeholder="Tell me what to change..." autocomplete="off" /><button aria-label="Send instruction">↑</button></form><p class="assistant-note">Edits apply to the selected draft.</p></aside>`;
}

function settingsView() {
  return `<section class="page"><div class="page-heading"><div><p class="eyebrow">WORKSPACE SETTINGS</p><h1>Settings</h1><p class="subheading">Manage your account, sender connection, and AI preferences.</p></div><button class="primary-button" data-action="save-settings">Save changes</button></div><div class="settings-grid"><section class="settings-card"><div class="settings-card-title"><h2>Profile</h2><p>Your workspace identity.</p></div><label class="field-label">DISPLAY NAME<input class="text-input" data-setting-name value="${escapeHtml(state.userName)}" /></label><label class="field-label">ACCOUNT EMAIL<input class="text-input" data-setting-email value="${escapeHtml(state.authEmail)}" /></label></section><section class="settings-card"><div class="settings-card-title"><h2>Connections</h2><p>Services used for campaign delivery.</p></div><div class="connection-row"><span class="gmail-mark">M</span><div><strong>Gmail</strong><small>${state.gmailConnected ? 'Connected and ready to send' : 'Not connected'}</small></div><button class="outline-button" data-action="gmail">${state.gmailConnected ? 'Disconnect' : 'Connect Gmail'}</button></div><div class="connection-row"><span class="ai-mark">✧</span><div><strong>Gemini</strong><small>${state.geminiConfigured ? 'Draft generation ready' : 'API key not configured'}</small></div><span class="ready-label">${state.geminiConfigured ? 'Ready' : 'Setup needed'}</span></div></section><section class="settings-card wide"><div class="settings-card-title"><h2>Safety & delivery</h2><p>Protect sender reputation with controlled dispatch.</p></div><div class="setting-toggle"><div><strong>Randomized send delay</strong><small>Use a 15–45 second delay between messages in production.</small></div><span class="toggle on">●</span></div><div class="setting-toggle"><div><strong>Audit log</strong><small>Record campaign actions and delivery errors.</small></div><span class="toggle on">●</span></div><div class="legal-link-row"><button class="text-button" data-view="privacy">Privacy policy</button><button class="text-button" data-view="terms">Terms of service</button></div></section></div></section>`;
}

function legalPageView(kind) {
  const isPrivacy = kind === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
  const summary = isPrivacy ? 'We store account information, campaign contacts, and Gmail OAuth credentials encrypted at rest. Contact fields and revision instructions are sent to Google Gemini to generate or revise email drafts. Review Google API data terms before using personal or confidential information.' : 'Users agree to use the platform in compliance with CAN-SPAM, GDPR, and other applicable anti-spam regulations. The platform reserves the right to suspend abusive accounts or those exceeding safe Gmail rate limits.';
  return `<section class="page legal-page"><div class="page-heading"><div><p class="eyebrow">LEGAL</p><h1>${title}</h1><p class="subheading">Security, compliance, and operating guardrails.</p></div><button class="primary-button" data-view="settings">Back to settings</button></div><div class="legal-shell"><div class="legal-card"><div class="terminal-badge">${isPrivacy ? 'DATA PROTECTION' : 'USAGE TERMS'}</div><p>${summary}</p><h3>Core requirements</h3><ul>${isPrivacy ? '<li>Account data and uploaded spreadsheets are stored securely.</li><li>Credentials are encrypted at rest using AES-256-GCM.</li><li>Zero data sharing with public model providers.</li>' : '<li>Users remain responsible for recipient consent and anti-spam compliance.</li><li>Campaign records and recipient data can be purged from settings.</li><li>Abusive or unsafe sending practices may trigger suspension.</li>'}</ul></div></div></section>`;
}

function notFoundView() {
  return `<section class="page not-found-page"><div class="terminal-shell"><div class="terminal-header"><span class="terminal-dot red"></span><span class="terminal-dot yellow"></span><span class="terminal-dot green"></span><span class="terminal-title">signalcraft / error</span></div><div class="terminal-body"><div class="status-badge">HTTP 404: Route Not Found</div><h1>That route does not exist.</h1><p>Use the dashboard to return to your active campaigns or contact engineering support.</p><div class="terminal-actions"><button class="primary-button" data-view="overview">Return to dashboard</button><button class="outline-button" data-action="notifications">Contact engineering</button></div></div></div></section>`;
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
          ${[['overview','Overview','◒'],['campaigns','Campaigns','◎'],['contacts','Contacts','◌'],['activity','Activity','≋'],['settings','Settings','⚙']].map(([id,label,icon]) => `<button class="nav-item ${active === id ? 'active' : ''}" data-view="${id}"><span>${icon}</span>${label}${id === 'campaigns' ? '<small>6</small>' : ''}</button>`).join('')}
        </nav>
        <div class="sidebar-bottom"><div class="profile" data-action="open-settings" title="Open profile settings"><div class="avatar">${userInitials(state.userName)}</div><div><strong>${escapeHtml(state.userName)}</strong><small>${escapeHtml(state.authEmail || 'Admin workspace')}</small></div><button class="logout-button" data-action="logout" title="Log out">↪</button></div></div>
      </aside>
      <main class="main-content">
        <header class="topbar"><div class="crumb">${active === 'overview' ? 'Overview' : active === 'privacy' ? 'Privacy Policy' : active === 'terms' ? 'Terms of Service' : active === 'not-found' ? 'Error' : active[0].toUpperCase() + active.slice(1)}</div><div class="top-actions"><button class="icon-button" aria-label="Toggle theme" data-theme-toggle>${state.theme === 'dark' ? '☀' : '☾'}</button><button class="icon-button" aria-label="Notifications" data-action="notifications">♧<i></i></button><div class="profile-menu"><button class="profile-menu-trigger" data-action="toggle-profile" aria-label="Open account menu"><span class="avatar avatar-small">${userInitials(state.userName)}</span><span class="profile-menu-name">${escapeHtml(state.userName)}</span><span class="profile-chevron">⌄</span></button>${state.profileMenuOpen ? '<div class="profile-dropdown"><button data-action="open-settings">⚙ &nbsp; Settings</button><button data-action="view-privacy">▣ &nbsp; Privacy</button><button class="dropdown-logout" data-action="logout">↪ &nbsp; Log out</button></div>' : ''}</div></div></header>
        ${pageContent}
        ${active === 'campaigns' ? assistantView() : ''}
        ${active === 'campaigns' ? '<input class="file-input" type="file" accept=".csv,text/csv" />' : ''}
      </main>
      ${state.toast ? `<div class="toast">✓ &nbsp;${escapeHtml(state.toast)}</div>` : ''}
    </div>`;
  bindEvents();
  syncApiSession();
}

function overviewView() {
  return `<section class="page"><div class="page-heading"><div><p class="eyebrow">THURSDAY, SEPTEMBER 24, 2026</p><h1>Good morning, ${escapeHtml(state.userName.split(' ')[0])} <span class="sun">✦</span></h1><p class="subheading">Your outreach engine is humming. Here’s the pulse.</p></div><button class="primary-button" data-action="new-campaign">＋ New campaign</button></div>
    <div class="metric-grid"><div class="metric-card accent"><div class="metric-label">SENT THIS MONTH <span>↗</span></div><div class="metric-value">${state.sent.toLocaleString()}</div><div class="metric-foot"><span class="positive">↑ 18.4%</span> vs last month</div><div class="sparkline"><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b></div></div><div class="metric-card"><div class="metric-label">REPLY RATE <span>↗</span></div><div class="metric-value">24.8%</div><div class="metric-foot"><span class="positive">↑ 4.2%</span> vs last month</div><div class="mini-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="metric-card"><div class="metric-label">ACTIVE CAMPAIGNS</div><div class="metric-value">${state.campaignCount}</div><div class="metric-foot">2 launching this week</div><div class="orbit">◌</div></div><div class="metric-card"><div class="metric-label">FAILED DELIVERIES</div><div class="metric-value warning">${state.failed}</div><div class="metric-foot">Need your attention</div><div class="failure-dot">!</div></div></div>
    <div class="section-row"><div><h2>Campaign pulse</h2><p class="section-note">Live performance across your active campaigns</p></div><button class="text-button" data-view="campaigns">View all campaigns <span>→</span></button></div>
    <div class="campaign-table"><div class="table-head"><span>CAMPAIGN</span><span>TYPE</span><span>PROGRESS</span><span>REPLY RATE</span><span>STATUS</span><span></span></div>${[['Faculty outreach · Fall 2026','Scholarship','62','28.4%','Running'],['Q4 product partnerships','B2B proposal','44','21.9%','Running'],['Digital refresh prospects','App & web dev','89','31.2%','Complete'],['Alumni network reactivation','Scholarship','16','—','Draft']].map((r,i) => `<div class="table-row"><div class="campaign-name"><span class="campaign-icon c${i}">${i === 0 ? '✦' : i === 1 ? '◈' : i === 2 ? '⌘' : '○'}</span><strong>${r[0]}</strong></div><span class="type-tag">${r[1]}</span><div class="progress-wrap"><div class="progress"><i style="width:${r[2]}%"></i></div><small>${r[2]}%</small></div><span class="reply">${r[3]}</span><span class="status-pill ${r[4].toLowerCase()}"><i></i>${r[4]}</span><button class="row-more">•••</button></div>`).join('')}</div>
    <div class="bottom-grid"><div class="insight-panel"><div class="panel-heading"><div><h2>Outreach insight</h2><p class="section-note">Based on your last 30 days</p></div><span class="insight-icon">✧</span></div><p class="insight-copy">Messages mentioning a <strong>specific research detail</strong> receive <strong>2.4× more replies.</strong> Your scholarship campaigns are outperforming your average by 18%.</p><button class="outline-button" data-action="new-campaign">Build a campaign <span>→</span></button></div><div class="activity-panel"><div class="panel-heading"><div><h2>Recent activity</h2><p class="section-note">The last 24 hours</p></div><button class="text-button" data-view="activity">See all</button></div><div class="activity-item"><span class="activity-dot green"></span><div><strong>Campaign completed</strong><p>Digital refresh prospects · 89 contacts</p></div><time>2h ago</time></div><div class="activity-item"><span class="activity-dot blue"></span><div><strong>New replies</strong><p>Q4 product partnerships · 7 replies</p></div><time>5h ago</time></div></div></div></section>`;
}

function campaignView(view) {
  const drafts = filteredDrafts();
  const isContacts = view === 'contacts';
  const isActivity = view === 'activity';
  if (isContacts) return `<section class="page"><div class="page-heading"><div><p class="eyebrow">DIRECTORY</p><h1>Contacts</h1><p class="subheading">${state.rows.length} people ready for thoughtful outreach.</p></div><button class="primary-button" data-action="upload">＋ Import contacts</button></div><div class="toolbar"><div class="search"><span>⌕</span><input data-search placeholder="Search contacts" value="${state.search}" /></div><span class="toolbar-count">${state.rows.length} contacts</span></div><div class="contact-grid">${state.rows.map((r,i) => `<div class="contact-card"><div class="contact-avatar">${(r.ApplicantName || r.ClientName || r.ContactName || 'C').split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div><strong>${r.Professor || r.ContactName || r.ClientName}</strong><p>${r.University || r.Company || 'Prospect'}</p><small>${r.email}</small></div><span class="contact-status">Ready</span></div>`).join('')}</div></section>`;
  if (isActivity) return `<section class="page"><div class="page-heading"><div><p class="eyebrow">AUDIT LOG</p><h1>Activity</h1><p class="subheading">A clear record of every campaign action.</p></div></div><div class="activity-log">${['Drafts generated for Spring faculty outreach','Gmail connection verified','3 failed deliveries queued for retry','Digital refresh prospects marked complete','Campaign export downloaded'].map((x,i) => `<div class="log-row"><span class="log-icon">${i === 2 ? '!' : '✓'}</span><div><strong>${x}</strong><p>Alex Smith · ${i + 1} ${i === 0 ? 'min' : 'hr'} ago</p></div><span class="log-kind">${i === 2 ? 'ATTENTION' : 'SYSTEM'}</span></div>`).join('')}</div></section>`;
  return `<section class="page"><div class="page-heading"><div><p class="eyebrow">CAMPAIGN STUDIO</p><h1>Build an outreach campaign</h1><p class="subheading">Turn a spreadsheet into conversations that feel human.</p></div><div class="draft-status"><span class="status-dot"></span>${state.status}</div></div><div class="studio-grid"><div class="studio-main"><div class="stepper"><span class="step done">01 <b>Audience</b></span><span class="step-line"></span><span class="step active">02 <b>Intent & voice</b></span><span class="step-line"></span><span class="step">03 <b>Review & send</b></span></div><div class="studio-card"><div class="card-title"><div><h2>Choose your outreach intent</h2><p>Signalcraft adapts the message structure to your goal.</p></div></div><div class="intent-grid">${Object.entries(intents).map(([key,item]) => `<button class="intent-card ${state.intent === key ? 'selected' : ''}" data-intent="${key}"><span class="intent-icon">${item.icon}</span><strong>${item.label}</strong><small>${item.description}</small><span class="radio">${state.intent === key ? '●' : '○'}</span></button>`).join('')}</div><label class="field-label">CAMPAIGN NAME<input class="text-input" data-campaign-name value="${escapeHtml(state.campaignName)}" /></label><label class="field-label">GMAIL SENDER ACCOUNT<div class="sender-input ${state.gmailConnected ? 'gmail-ready' : ''}"><span class="gmail-mark">M</span><input data-email value="${escapeHtml(state.email)}" ${state.gmailConnected ? '' : 'placeholder="Connect Gmail first"'} /><button class="gmail-connect" data-action="gmail">${state.gmailConnected ? 'Disconnect' : 'Connect Gmail'}</button></div></label><p class="connection-help">${state.gmailConnected ? 'Gmail connected. Messages will be sent through your authorized account.' : 'Connect Gmail with OAuth before dispatching a campaign.'}</p><div class="upload-zone" data-action="upload"><span class="upload-icon">↥</span><div><strong>Drop a CSV or Excel file here</strong><p>or click to browse · ${state.rows.length} sample rows loaded</p></div><button class="outline-button small">Choose file</button></div><div class="mapping-head"><div><h3>Column mapping</h3><p>We found ${Object.keys(state.rows[0] || {}).length} columns in your file.</p></div><button class="text-button" data-action="regenerate">↻ Regenerate drafts</button></div><div class="mapping-list">${intents[state.intent].fields.slice(0,4).map((field,i) => `<div class="mapping-row"><span>${field}</span><span class="mapping-arrow">→</span><select><option>${Object.keys(state.rows[0] || {})[i] || field}</option></select><span class="mapping-check">✓</span></div>`).join('')}</div></div></div><aside class="preview-card"><div class="preview-head"><div><span class="eyebrow">LIVE PREVIEW</span><h2>Message drafts</h2></div><span class="draft-count">${state.drafts.length} drafts</span></div><div class="draft-tabs">${drafts.map((d,i) => `<button class="draft-tab ${state.selectedDraft === i ? 'active' : ''}" data-draft="${i}"><span>${d.name.slice(0,2).toUpperCase()}</span>${d.name.split(' ')[0]}</button>`).join('')}</div>${drafts.length ? `<div class="message-meta"><span>TO</span><strong>${drafts[state.selectedDraft]?.to}</strong></div><input class="subject-input" data-subject value="${escapeHtml(drafts[state.selectedDraft]?.subject || '')}" /><textarea class="body-input" data-body>${escapeHtml(drafts[state.selectedDraft]?.body || '')}</textarea><div class="preview-footer"><span>AI draft · editable</span><button class="primary-button send-button" data-action="send" ${state.gmailConnected ? '' : 'disabled title="Connect Gmail first"'}>Send campaign →</button></div>` : '<p>No matching drafts.</p>'}</aside></div></section>`;
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
      showToast(`API unavailable: ${error.message}. Demo mode remains active.`);
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
    showToast(state.gmailConnected ? 'Gmail connected for this demo session' : 'Gmail disconnected');
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
  document.querySelector('[data-subject]')?.addEventListener('input', e => state.drafts[state.selectedDraft].subject = e.target.value);
  document.querySelector('[data-body]')?.addEventListener('input', e => state.drafts[state.selectedDraft].body = e.target.value);
}

render();
