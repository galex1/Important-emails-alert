const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
const t = (...args) => window.I18n.t(...args);

let themeMode = 'system';
let mediaQuery;
let currentView = 'inbox';
let searchTimers = { inbox: null, read: null, spam: null };

function resolvedTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncThemeButtons() {
  document.querySelectorAll('[data-theme-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeMode === themeMode);
  });
  const select = $('settingsForm')?.theme_mode;
  if (select) select.value = themeMode;
}

function applyTheme(mode) {
  themeMode = mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system';
  document.documentElement.setAttribute('data-theme', resolvedTheme(themeMode));
  syncThemeButtons();
}

function watchSystemTheme() {
  if (mediaQuery) mediaQuery.removeEventListener('change', onSystemTheme);
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', onSystemTheme);
}

function onSystemTheme() {
  if (themeMode === 'system') {
    document.documentElement.setAttribute('data-theme', resolvedTheme('system'));
  }
}

async function setThemeMode(mode) {
  applyTheme(mode);
  try {
    await tiny.api.call('saveSettings', { theme_mode: mode });
  } catch {
    /* ignore */
  }
}

function applyLanguage(lang) {
  I18n.setLang(lang);
  I18n.applyDom();
}

function showView(name) {
  currentView = name;
  document.querySelectorAll('.tab').forEach((tEl) => {
    tEl.classList.toggle('active', tEl.dataset.view === name);
  });
  $('view-inbox').classList.toggle('hidden', name !== 'inbox');
  $('view-read').classList.toggle('hidden', name !== 'read');
  $('view-spam').classList.toggle('hidden', name !== 'spam');
  $('view-settings').classList.toggle('hidden', name !== 'settings');
  $('view-logs').classList.toggle('hidden', name !== 'logs');
  if (name === 'logs') refreshLogs().catch(() => {});
  if (name === 'inbox') refreshInbox().catch(() => {});
  if (name === 'read') refreshRead().catch(() => {});
  if (name === 'spam') refreshSpam().catch(() => {});
}

function setStatus(status) {
  const parts = [];
  if (status?.lastError) {
    parts.push(t('statusError', { msg: status.lastError }));
    $('dot').className = 'dot err';
  } else if (status?.lastOkAt) {
    parts.push(t('statusOk'));
    $('dot').className = 'dot ok';
  } else {
    $('dot').className = 'dot';
  }
  if (status?.unread != null) parts.push(t('statusUnread', { n: status.unread }));
  $('statusLine').textContent = parts.join(' · ') || '—';
  $('unreadHint').textContent =
    status?.unread > 0 ? t('waitingConfirm', { n: status.unread }) : '';
}

function actionButtons(mode) {
  if (mode === 'spam') {
    return `<button type="button" class="notSpamBtn">${esc(t('notSpam'))}</button>`;
  }
  if (mode === 'read') {
    return `<div class="row-actions">
      <button type="button" class="unseenBtn">${esc(t('markUnseen'))}</button>
      <button type="button" class="spamBtn">${esc(t('markSpam'))}</button>
    </div>`;
  }
  return `<div class="row-actions">
    <button type="button" class="seenBtn">${esc(t('markSeen'))}</button>
    <button type="button" class="spamBtn">${esc(t('markSpam'))}</button>
  </div>`;
}

function renderMailList(listEl, emptyEl, emails, mode) {
  if (!emails || emails.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  listEl.innerHTML = emails
    .map(
      (m) => `
    <li data-uid="${esc(m.uid)}" class="${mode === 'read' ? 'is-read' : ''}${mode === 'spam' ? ' is-spam' : ''}">
      <div>
        <div class="from">${esc(m.from || '—')}</div>
        <div class="meta">${esc(m.received_at || '')}</div>
      </div>
      ${actionButtons(mode)}
      <div class="subject">${esc(m.subject || '')}</div>
      ${m.snippet ? `<div class="snippet">${esc(m.snippet)}</div>` : ''}
    </li>`
    )
    .join('');
}

function renderBlocked(senders) {
  const list = $('blockedList');
  const empty = $('emptyBlocked');
  if (!senders || senders.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = senders
    .map(
      (s) => `
    <li data-email="${esc(s.email)}">
      <span>${esc(s.email)}</span>
      <button type="button" class="unblockBtn">${esc(t('unblock'))}</button>
    </li>`
    )
    .join('');
}

async function refreshInbox() {
  $('inboxErr').textContent = '';
  try {
    const data = await tiny.api.call('getInbox', {
      query: $('searchInbox').value || '',
    });
    renderMailList($('mailList'), $('emptyInbox'), data.emails, 'inbox');
    setStatus(data.status);
    const q = ($('searchInbox').value || '').trim();
    if (q && !data.emails.length) {
      $('emptyInbox').textContent = t('noResults', { q });
      $('emptyInbox').classList.remove('hidden');
    } else if (!data.emails.length) {
      $('emptyInbox').textContent = t('emptyInbox');
    }
  } catch (e) {
    $('inboxErr').textContent = String(e.message || e);
  }
}

async function refreshRead() {
  $('readErr').textContent = '';
  try {
    const data = await tiny.api.call('getRead', {
      query: $('searchRead').value || '',
    });
    renderMailList($('readList'), $('emptyRead'), data.emails, 'read');
    setStatus(data.status);
    const q = ($('searchRead').value || '').trim();
    const n = data.emails.length;
    $('readHint').textContent = q
      ? t('resultsCount', { n })
      : data.count
        ? t('readCount', { n: data.count })
        : '';
    if (q && !n) {
      $('emptyRead').textContent = t('noResults', { q });
      $('emptyRead').classList.remove('hidden');
    } else if (!n) {
      $('emptyRead').textContent = t('emptyRead');
    }
  } catch (e) {
    $('readErr').textContent = String(e.message || e);
  }
}

async function refreshSpam() {
  $('spamErr').textContent = '';
  try {
    const data = await tiny.api.call('getSpam', {
      query: $('searchSpam').value || '',
    });
    renderMailList($('spamList'), $('emptySpam'), data.emails, 'spam');
    renderBlocked(data.senders);
    setStatus(data.status);
    const q = ($('searchSpam').value || '').trim();
    const n = data.emails.length;
    $('spamHint').textContent = q
      ? t('resultsCount', { n })
      : data.count
        ? t('spamCount', { n: data.count })
        : '';
    if (q && !n) {
      $('emptySpam').textContent = t('noResults', { q });
      $('emptySpam').classList.remove('hidden');
    } else if (!n) {
      $('emptySpam').textContent = t('emptySpam');
    }
  } catch (e) {
    $('spamErr').textContent = String(e.message || e);
  }
}

function debounceSearch(which, fn) {
  clearTimeout(searchTimers[which]);
  searchTimers[which] = setTimeout(fn, 220);
}

function fillSettings(s) {
  const form = $('settingsForm');
  form.pop_host.value = s.pop_host || '';
  form.pop_port.value = s.pop_port || 995;
  form.pop_user.value = s.pop_user || '';
  form.pop_password.value = '';
  form.pop_password.placeholder = s.pop_password_set
    ? t('passwordPlaceholderSet')
    : t('passwordPlaceholderNew');
  $('passwordHint').textContent = s.pop_password_set
    ? t('passwordSetHint')
    : t('passwordEmptyHint');
  form.pop_tls.checked = !!s.pop_tls;
  form.slack_enabled.checked = !!s.slack_enabled;
  form.slack_webhook.value = s.slack_webhook || '';
  form.poll_interval_sec.value = s.poll_interval_sec || 60;
  form.notify_repeat_sec.value = s.notify_repeat_sec || 120;
  form.theme_mode.value = s.theme_mode || 'system';
  form.ui_lang.value = s.ui_lang || 'el';
  applyLanguage(s.ui_lang || 'el');
  applyTheme(s.theme_mode || 'system');
}

async function loadSettings() {
  $('settingsErr').textContent = '';
  $('settingsOk').textContent = '';
  const s = await tiny.api.call('getSettings');
  fillSettings(s);
  if (!s.configured) showView('settings');
}

function settingsPayload(form) {
  return {
    pop_host: form.pop_host.value,
    pop_port: form.pop_port.value,
    pop_user: form.pop_user.value,
    pop_password: form.pop_password.value,
    pop_tls: form.pop_tls.checked,
    slack_webhook: form.slack_webhook.value,
    slack_enabled: form.slack_enabled.checked,
    poll_interval_sec: form.poll_interval_sec.value,
    notify_repeat_sec: form.notify_repeat_sec.value,
    theme_mode: form.theme_mode.value,
    ui_lang: form.ui_lang.value,
  };
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
});

document.querySelectorAll('[data-theme-mode]').forEach((btn) => {
  btn.addEventListener('click', () => setThemeMode(btn.dataset.themeMode));
});

$('settingsForm').theme_mode.addEventListener('change', (ev) => {
  setThemeMode(ev.target.value);
});

$('settingsForm').ui_lang.addEventListener('change', async (ev) => {
  applyLanguage(ev.target.value);
  try {
    await tiny.api.call('saveSettings', { ui_lang: ev.target.value });
    await refreshInbox();
  } catch {
    /* ignore */
  }
});

$('searchInbox').addEventListener('input', () => {
  debounceSearch('inbox', () => refreshInbox().catch(() => {}));
});
$('searchRead').addEventListener('input', () => {
  debounceSearch('read', () => refreshRead().catch(() => {}));
});
$('searchSpam').addEventListener('input', () => {
  debounceSearch('spam', () => refreshSpam().catch(() => {}));
});

$('mailList').addEventListener('click', async (ev) => {
  const li = ev.target.closest('li');
  const uid = li?.dataset.uid;
  if (!uid) return;
  try {
    if (ev.target.closest('.seenBtn')) await tiny.api.call('markSeen', { uid });
    else if (ev.target.closest('.spamBtn')) await tiny.api.call('markSpam', { uid });
    else return;
    await refreshInbox();
  } catch (e) {
    $('inboxErr').textContent = String(e.message || e);
  }
});

$('readList').addEventListener('click', async (ev) => {
  const li = ev.target.closest('li');
  const uid = li?.dataset.uid;
  if (!uid) return;
  try {
    if (ev.target.closest('.unseenBtn')) await tiny.api.call('markUnseen', { uid });
    else if (ev.target.closest('.spamBtn')) await tiny.api.call('markSpam', { uid });
    else return;
    await refreshRead();
    await refreshInbox();
  } catch (e) {
    $('readErr').textContent = String(e.message || e);
  }
});

$('spamList').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.notSpamBtn');
  if (!btn) return;
  const uid = btn.closest('li')?.dataset.uid;
  if (!uid) return;
  try {
    await tiny.api.call('markNotSpam', { uid });
    await refreshSpam();
    await refreshInbox();
  } catch (e) {
    $('spamErr').textContent = String(e.message || e);
  }
});

$('blockedList').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.unblockBtn');
  if (!btn) return;
  const email = btn.closest('li')?.dataset.email;
  if (!email) return;
  try {
    await tiny.api.call('unblockSender', { email });
    await refreshSpam();
    await refreshInbox();
  } catch (e) {
    $('spamErr').textContent = String(e.message || e);
  }
});

$('pollBtn').addEventListener('click', async () => {
  $('inboxErr').textContent = '';
  try {
    await tiny.api.call('pollNow');
    await refreshInbox();
  } catch (e) {
    $('inboxErr').textContent = String(e.message || e);
  }
});

$('markAllBtn').addEventListener('click', async () => {
  await tiny.api.call('markAllSeen');
  await refreshInbox();
});

$('settingsForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('settingsErr').textContent = '';
  $('settingsOk').textContent = '';
  const form = ev.target;
  try {
    const saved = await tiny.api.call('saveSettings', settingsPayload(form));
    fillSettings(saved);
    $('settingsOk').textContent = t('savedOk');
    await refreshInbox();
  } catch (e) {
    $('settingsErr').textContent = String(e.message || e);
  }
});

$('testPopBtn').addEventListener('click', async () => {
  $('settingsErr').textContent = '';
  $('settingsOk').textContent = '';
  try {
    const form = $('settingsForm');
    await tiny.api.call('saveSettings', settingsPayload(form));
    const result = await tiny.api.call('testPop');
    $('settingsOk').textContent = t('testOk', { n: result.count });
  } catch (e) {
    $('settingsErr').textContent = String(e.message || e);
  }
});

function formatLogLine(entry) {
  const time = (entry.ts || '').replace('T', ' ').replace(/\.\d+Z$/, 'Z');
  const detail = entry.detail ? ' — ' + entry.detail : '';
  return `[${time}] ${String(entry.level || 'info').toUpperCase()}  ${entry.message}${detail}`;
}

function appendLogLine(entry) {
  const view = $('logView');
  const follow = $('logsFollow').checked;
  const atBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 40;
  view.textContent += (view.textContent ? '\n' : '') + formatLogLine(entry);
  if (follow || atBottom) view.scrollTop = view.scrollHeight;
}

async function refreshLogs() {
  const rows = await tiny.api.call('getLogs', { limit: 500 });
  $('logView').textContent = (rows || []).map(formatLogLine).join('\n');
  if ($('logsFollow').checked) $('logView').scrollTop = $('logView').scrollHeight;
}

$('refreshLogsBtn').addEventListener('click', () => refreshLogs().catch(() => {}));
$('clearLogsBtn').addEventListener('click', async () => {
  await tiny.api.call('clearLogs');
  $('logView').textContent = '';
});

tiny.api.on('status', (payload) => {
  setStatus(payload);
  if (currentView === 'inbox' && payload.unreadEmails && !($('searchInbox').value || '').trim()) {
    renderMailList($('mailList'), $('emptyInbox'), payload.unreadEmails, 'inbox');
  }
});

tiny.api.on('log', (entry) => {
  if (!$('view-logs').classList.contains('hidden')) appendLogLine(entry);
});

tiny.api.on('logsCleared', () => {
  $('logView').textContent = '';
});

tiny.api.on('navigate', ({ view }) => {
  if (['settings', 'inbox', 'logs', 'read', 'spam'].includes(view)) showView(view);
});

async function init() {
  watchSystemTheme();
  applyTheme('system');
  I18n.applyDom();
  await tiny.api.call('ping');
  await loadSettings();
  await refreshInbox();
}

init().catch((e) => {
  $('inboxErr').textContent = 'init failed: ' + e;
  $('dot').className = 'dot err';
});
