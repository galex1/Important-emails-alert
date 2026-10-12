import {
  getSettingsForUi,
  listEmails,
  listSpamSenders,
  markAllSeen,
  markNotSpam,
  markSeen,
  markSpam,
  markUnseen,
  openDb,
  popConfig,
  readCount,
  saveSettings,
  spamCount,
  unblockSender,
  unreadCount,
} from './db.js';
import { setLang, t } from './i18n.js';
import { attachLogger, clearLogs, getLogs, info as logInfo, error as logError } from './log.js';
import { testLogin } from './pop3.js';
import {
  attachPoller,
  getStatus,
  pollOnce,
  pushInbox,
  restartPoller,
  syncLangFromDb,
  updateTray,
} from './poller.js';

function applyLangFromSettings(ui) {
  setLang(ui.ui_lang || 'el');
  syncLangFromDb();
  updateTray();
}

export const api = {
  async getSettings() {
    const ui = getSettingsForUi();
    applyLangFromSettings(ui);
    return ui;
  },

  async saveSettings(params) {
    const ui = saveSettings(params || {});
    applyLangFromSettings(ui);
    logInfo('settings saved', ui.pop_host + ' / ' + ui.pop_user);
    restartPoller();
    pushInbox();
    return ui;
  },

  async testPop() {
    logInfo('POP test start');
    try {
      const result = await testLogin(popConfig());
      logInfo('POP test ok', result.count + ' messages');
      return result;
    } catch (e) {
      logError('POP test failed', e.message || e);
      throw e;
    }
  },

  async getInbox({ query } = {}) {
    return {
      emails: listEmails({ seen: 0, spam: 0, query }),
      status: getStatus(),
    };
  },

  async getRead({ query } = {}) {
    return {
      emails: listEmails({ seen: 1, spam: 0, query }),
      count: readCount(),
      status: getStatus(),
    };
  },

  async getSpam({ query } = {}) {
    return {
      emails: listEmails({ spam: 1, query }),
      senders: listSpamSenders(),
      count: spamCount(),
      status: getStatus(),
    };
  },

  async markSeen({ uid }) {
    if (!uid) throw new Error('missing uid');
    markSeen(uid);
    logInfo('marked seen', uid);
    updateTray();
    pushInbox();
    return { ok: true, unread: unreadCount(), read: readCount() };
  },

  async markUnseen({ uid }) {
    if (!uid) throw new Error('missing uid');
    markUnseen(uid);
    logInfo('marked unseen', uid);
    updateTray();
    pushInbox();
    return { ok: true, unread: unreadCount(), read: readCount() };
  },

  async markSpam({ uid }) {
    if (!uid) throw new Error('missing uid');
    const result = markSpam(uid);
    logInfo(t('logMarkedSpam'), result?.email || uid);
    updateTray();
    pushInbox();
    return { ok: true, ...result, unread: unreadCount(), spam: spamCount() };
  },

  async markNotSpam({ uid }) {
    if (!uid) throw new Error('missing uid');
    const result = markNotSpam(uid);
    logInfo(t('logUnmarkedSpam'), result?.email || uid);
    updateTray();
    pushInbox();
    return { ok: true, ...result, unread: unreadCount(), spam: spamCount() };
  },

  async unblockSender({ email }) {
    if (!email) throw new Error('missing email');
    const addr = unblockSender(email);
    logInfo(t('logUnblocked'), addr || email);
    updateTray();
    pushInbox();
    return { ok: true, email: addr, unread: unreadCount(), spam: spamCount() };
  },

  async markAllSeen() {
    markAllSeen();
    logInfo('marked all seen');
    updateTray();
    pushInbox();
    return { ok: true, unread: 0, read: readCount() };
  },

  async pollNow() {
    return pollOnce();
  },

  async getStatus() {
    return getStatus();
  },

  async getLogs({ limit } = {}) {
    return getLogs({ limit });
  },

  async clearLogs() {
    return clearLogs();
  },
};

export async function init(app) {
  await openDb(app);
  await attachLogger(app);
  attachPoller(app);
  applyLangFromSettings(getSettingsForUi());
  logInfo('app started');

  try {
    app.window('main').setHideOnClose(true);
    app.window('main').setTitle(t('appName'));
  } catch {
    /* older tinyjs */
  }

  updateTray();
  restartPoller();
  pushInbox();
}

export function onTray(id, app) {
  if (id === 'show' || id === 'settings' || id === 'logs' || id === 'read' || id === 'spam') {
    const win = app.window('main');
    win.show();
    if (id === 'settings') app.push('navigate', { view: 'settings' });
    else if (id === 'logs') app.push('navigate', { view: 'logs' });
    else if (id === 'read') app.push('navigate', { view: 'read' });
    else if (id === 'spam') app.push('navigate', { view: 'spam' });
    else app.push('navigate', { view: 'inbox' });
  }
  if (id === 'poll') pollOnce().catch(() => {});
  if (id === 'quit') app.quit();
}

export function onNotificationAction({ id, action }, app) {
  if (action !== 'seen') return;
  const uid = String(id || '').replace(/^(mail|remind)-/, '');
  if (!uid) return;
  markSeen(uid);
  logInfo('marked seen from notification', uid);
  updateTray();
  pushInbox();
  app.window('main').show();
}

export function onNotificationClick(id, app) {
  app.window('main').show();
  app.push('navigate', { view: 'inbox' });
  void id;
}
