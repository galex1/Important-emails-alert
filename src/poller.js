import {
  getSettings,
  knownUids,
  listUnread,
  markSlackSent,
  pollIntervals,
  popConfig,
  slackConfig,
  touchNotified,
  unreadCount,
  upsertEmail,
} from './db.js';
import { getLang, setLang, t } from './i18n.js';
import { error as logError, info as logInfo, warn as logWarn } from './log.js';
import { fetchHeaders } from './pop3.js';

let appRef = null;
let timer = null;
let busy = false;
let lastError = null;
let lastPollAt = null;
let lastOkAt = null;

export function attachPoller(app) {
  appRef = app;
  syncLangFromDb();
}

export function syncLangFromDb() {
  setLang(getSettings().ui_lang || 'el');
}

export function getStatus() {
  return {
    lastError,
    lastPollAt,
    lastOkAt,
    unread: unreadCount(),
    polling: busy,
    lang: getLang(),
    ...pollIntervals(),
  };
}

export function restartPoller() {
  syncLangFromDb();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const { pollMs } = pollIntervals();
  timer = setInterval(() => {
    pollOnce().catch(() => {});
  }, pollMs);
  pollOnce().catch(() => {});
}

export async function pollOnce() {
  if (busy) return getStatus();
  syncLangFromDb();
  const cfg = popConfig();
  if (!cfg.host || !cfg.user || !cfg.password) {
    lastError = t('lastErrorNotConfigured');
    logWarn('poll skipped', lastError);
    pushStatus();
    return getStatus();
  }

  busy = true;
  lastPollAt = new Date().toISOString();
  logInfo(t('logPollStart'), cfg.host + ':' + cfg.port);
  pushStatus();

  try {
    const headers = await fetchHeaders(cfg);
    const known = knownUids();
    const fresh = [];

    for (const msg of headers) {
      const isNew = !known.has(msg.uid);
      const spam = upsertEmail(msg);
      if (isNew) fresh.push({ ...msg, spam });
    }

    logInfo(
      t('logPollOk'),
      headers.length + ' mailbox, ' + fresh.filter((m) => !m.spam).length + ' new'
    );

    for (const msg of fresh) {
      if (msg.spam) {
        logInfo(t('logSpamSkipped'), (msg.from || '') + ' — ' + (msg.subject || ''));
        continue;
      }
      await notifyNew(msg);
      const snip = msg.snippet ? ' · ' + msg.snippet : '';
      logInfo(t('logNewMail'), (msg.from || '') + ' — ' + (msg.subject || '') + snip);
    }

    const slackErr = await flushSlack();
    await remindUnread();

    lastOkAt = new Date().toISOString();
    lastError = slackErr;
    if (slackErr) logWarn('slack', slackErr);
  } catch (e) {
    lastError = String(e.message || e);
    logError(t('logPollFailed'), lastError);
  } finally {
    busy = false;
    updateTray();
    pushStatus();
  }

  return getStatus();
}

async function notifyNew(msg) {
  if (!appRef) return;
  const title = t('notifyTitle');
  const body = [msg.from || '—', msg.subject || '', msg.snippet || '']
    .filter(Boolean)
    .join('\n');
  try {
    appRef.notify({
      title,
      body,
      id: 'mail-' + msg.uid,
      sound: true,
      actions: [{ id: 'seen', title: t('markSeen') }],
    });
  } catch {
    try {
      appRef.notify({ title, body, id: 'mail-' + msg.uid, sound: true });
    } catch {
      /* ignore */
    }
  }
  touchNotified(msg.uid);
}

async function remindUnread() {
  if (!appRef) return;
  const { notifyMs } = pollIntervals();
  const unread = listUnread();
  const now = Date.now();

  for (const mail of unread) {
    const lastMs = mail.last_notified_at
      ? Date.parse(mail.last_notified_at.replace(' ', 'T') + 'Z')
      : 0;
    if (lastMs && now - lastMs < notifyMs) continue;

    const n = unread.length;
    const title = n === 1 ? t('notifyRemindOne') : t('notifyRemindMany', { n });
    const body = [mail.from || '', mail.subject || '', mail.snippet || '']
      .filter(Boolean)
      .join('\n');
    try {
      appRef.notify({
        title,
        body,
        id: 'remind-' + mail.uid,
        sound: true,
        actions: [{ id: 'seen', title: t('markSeen') }],
      });
    } catch {
      try {
        appRef.notify({ title, body, id: 'remind-' + mail.uid, sound: true });
      } catch {
        /* ignore */
      }
    }
    touchNotified(mail.uid);
    break;
  }
}

async function flushSlack() {
  const slack = slackConfig();
  if (!slack.enabled) return null;

  const pending = listUnread().filter((m) => !m.slack_sent);
  let err = null;
  for (const msg of pending) {
    try {
      const snip = msg.snippet ? `\n>${msg.snippet}` : '';
      const text = `*${t('notifyTitle')}*\n${msg.from || '—'}\n${msg.subject || '—'}${snip}`;
      const res = await fetch(slack.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error('Slack webhook failed: ' + res.status + ' ' + body);
      }
      markSlackSent(msg.uid);
      logInfo('slack sent', msg.subject || msg.uid);
    } catch (e) {
      err = String(e.message || e);
    }
  }
  return err;
}

function pushStatus() {
  if (!appRef) return;
  appRef.push('status', {
    ...getStatus(),
    unreadEmails: listUnread(),
  });
}

export function updateTray() {
  if (!appRef) return;
  syncLangFromDb();
  const n = unreadCount();
  const title = n > 0 ? String(n) : '◎';
  const tooltip = n > 0 ? t('trayUnread', { n }) : t('trayNone');
  appRef.tray.set({
    title,
    tooltip,
    menu: [
      { id: 'show', label: t('trayOpen') },
      { id: 'poll', label: t('trayPoll') },
      { separator: true },
      { id: 'settings', label: t('traySettings') },
      { id: 'read', label: t('trayRead') },
      { id: 'spam', label: t('traySpam') },
      { id: 'logs', label: t('trayLogs') },
      { separator: true },
      { id: 'quit', label: t('trayQuit') },
    ],
  });
}

export function pushInbox() {
  pushStatus();
}
