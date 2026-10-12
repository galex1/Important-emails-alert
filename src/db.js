import { Database } from 'tjs:sqlite';
import { normalizeLang } from './i18n.js';

const SETTINGS_KEYS = [
  'pop_host',
  'pop_port',
  'pop_user',
  'pop_password',
  'pop_tls',
  'slack_webhook',
  'slack_enabled',
  'poll_interval_sec',
  'notify_repeat_sec',
  'theme_mode',
  'ui_lang',
];

const DEFAULTS = {
  pop_host: '',
  pop_port: '995',
  pop_user: '',
  pop_password: '',
  pop_tls: '1',
  slack_webhook: '',
  slack_enabled: '1',
  poll_interval_sec: '60',
  notify_repeat_sec: '120',
  theme_mode: 'system',
  ui_lang: 'el',
};

let db;

export async function openDb(app) {
  const dataDir = app.paths.data;
  await tjs.makeDir(dataDir, { recursive: true });
  db = new Database(dataDir + '/important-emails.db');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emails (
      uid TEXT PRIMARY KEY,
      from_addr TEXT,
      subject TEXT,
      snippet TEXT,
      received_at TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      spam INTEGER NOT NULL DEFAULT 0,
      slack_sent INTEGER NOT NULL DEFAULT 0,
      last_notified_at TEXT
    );
    CREATE TABLE IF NOT EXISTS spam_senders (
      email TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `);

  const cols = db.prepare('PRAGMA table_info(emails)').all().map((c) => c.name);
  if (!cols.includes('snippet')) db.exec('ALTER TABLE emails ADD COLUMN snippet TEXT');
  if (!cols.includes('spam')) db.exec('ALTER TABLE emails ADD COLUMN spam INTEGER NOT NULL DEFAULT 0');

  // migrate from older filename if present
  try {
    const oldPath = dataDir + '/support-alert.db';
    const st = await tjs.stat(oldPath);
    if (st && st.isFile) {
      // already opened new empty db — copy settings/emails if new is empty
      const n = db.prepare('SELECT COUNT(*) AS n FROM emails').all()[0]?.n || 0;
      if (n === 0) {
        const old = new Database(oldPath);
        try {
          for (const row of old.prepare('SELECT key, value FROM settings').all()) {
            db.prepare(
              'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
            ).run(row.key, row.value);
          }
          const oldCols = old.prepare('PRAGMA table_info(emails)').all().map((c) => c.name);
          const hasSnippet = oldCols.includes('snippet');
          const hasSpam = oldCols.includes('spam');
          for (const row of old.prepare('SELECT * FROM emails').all()) {
            db.prepare(
              `INSERT OR IGNORE INTO emails
               (uid, from_addr, subject, snippet, received_at, seen, spam, slack_sent, last_notified_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              row.uid,
              row.from_addr,
              row.subject,
              hasSnippet ? row.snippet : '',
              row.received_at,
              row.seen,
              hasSpam ? row.spam : 0,
              row.slack_sent,
              row.last_notified_at
            );
          }
        } finally {
          old.close();
        }
      }
    }
  } catch {
    /* no old db */
  }

  return db;
}

function ensureDb() {
  if (!db) throw new Error('database not open');
  return db;
}

export function extractEmail(from) {
  const s = String(from || '').trim();
  const m = s.match(/<([^>]+)>/);
  const addr = (m ? m[1] : s).trim().toLowerCase();
  if (!addr.includes('@')) return '';
  return addr.replace(/^["']+|["']+$/g, '');
}

export function getSettings() {
  const rows = ensureDb().prepare('SELECT key, value FROM settings').all();
  const map = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export function getSettingsForUi() {
  const s = getSettings();
  const passwordSet = Boolean(s.pop_password);
  return {
    pop_host: s.pop_host,
    pop_port: s.pop_port,
    pop_user: s.pop_user,
    pop_password: '',
    pop_password_set: passwordSet,
    pop_tls: s.pop_tls === '1',
    slack_webhook: s.slack_webhook,
    slack_enabled: s.slack_enabled === '1',
    poll_interval_sec: Number(s.poll_interval_sec) || 60,
    notify_repeat_sec: Number(s.notify_repeat_sec) || 120,
    theme_mode: normalizeTheme(s.theme_mode),
    ui_lang: normalizeLang(s.ui_lang),
    configured: Boolean(s.pop_host && s.pop_user && s.pop_password),
  };
}

function normalizeTheme(value) {
  const v = String(value || 'system').toLowerCase();
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

export function saveSettings(input) {
  const current = getSettings();
  const next = {
    pop_host: String(input.pop_host ?? current.pop_host).trim(),
    pop_port: String(input.pop_port ?? current.pop_port ?? '995').trim() || '995',
    pop_user: String(input.pop_user ?? current.pop_user).trim(),
    pop_password: current.pop_password,
    pop_tls:
      input.pop_tls === undefined
        ? current.pop_tls
        : input.pop_tls === false || input.pop_tls === '0'
          ? '0'
          : '1',
    slack_webhook:
      input.slack_webhook === undefined
        ? current.slack_webhook
        : String(input.slack_webhook ?? '').trim(),
    slack_enabled:
      input.slack_enabled === undefined
        ? current.slack_enabled
        : input.slack_enabled === false || input.slack_enabled === '0'
          ? '0'
          : '1',
    poll_interval_sec: String(
      Math.max(
        15,
        Number(
          input.poll_interval_sec === undefined
            ? current.poll_interval_sec
            : input.poll_interval_sec
        ) || 60
      )
    ),
    notify_repeat_sec: String(
      Math.max(
        30,
        Number(
          input.notify_repeat_sec === undefined
            ? current.notify_repeat_sec
            : input.notify_repeat_sec
        ) || 120
      )
    ),
    theme_mode: normalizeTheme(
      input.theme_mode === undefined ? current.theme_mode : input.theme_mode
    ),
    ui_lang: normalizeLang(input.ui_lang === undefined ? current.ui_lang : input.ui_lang),
  };

  const incomingPassword = String(input.pop_password ?? '');
  if (incomingPassword.length > 0) next.pop_password = incomingPassword;
  if (input.clear_password) next.pop_password = '';

  const stmt = ensureDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const key of SETTINGS_KEYS) {
    stmt.run(key, next[key] ?? '');
  }
  stmt.finalize();
  return getSettingsForUi();
}

export function popConfig() {
  const s = getSettings();
  return {
    host: s.pop_host,
    port: Number(s.pop_port) || 995,
    user: s.pop_user,
    password: s.pop_password,
    tls: s.pop_tls !== '0',
  };
}

export function slackConfig() {
  const s = getSettings();
  return {
    webhook: s.slack_webhook,
    enabled: s.slack_enabled === '1' && Boolean(s.slack_webhook),
  };
}

export function pollIntervals() {
  const s = getSettings();
  return {
    pollMs: (Number(s.poll_interval_sec) || 60) * 1000,
    notifyMs: (Number(s.notify_repeat_sec) || 120) * 1000,
  };
}

export function isSpamSender(from) {
  const email = extractEmail(from);
  if (!email) return false;
  const row = ensureDb()
    .prepare('SELECT email FROM spam_senders WHERE email = ?')
    .all(email)[0];
  return Boolean(row);
}

export function addSpamSender(from) {
  const email = extractEmail(from);
  if (!email) return '';
  ensureDb()
    .prepare(
      `INSERT INTO spam_senders (email, created_at) VALUES (?, datetime('now'))
       ON CONFLICT(email) DO NOTHING`
    )
    .run(email);
  ensureDb()
    .prepare('UPDATE emails SET spam = 1, seen = 1 WHERE instr(lower(from_addr), ?) > 0')
    .run(email);
  return email;
}

export function removeSpamSender(emailOrFrom) {
  const email = extractEmail(emailOrFrom) || String(emailOrFrom || '').trim().toLowerCase();
  if (!email) return '';
  ensureDb().prepare('DELETE FROM spam_senders WHERE email = ?').run(email);
  return email;
}

export function listSpamSenders() {
  return ensureDb()
    .prepare('SELECT email, created_at FROM spam_senders ORDER BY created_at DESC')
    .all();
}

export function upsertEmail({ uid, from, subject, snippet, date, spam }) {
  const asSpam = spam ? 1 : isSpamSender(from) ? 1 : 0;
  // Prefer the email's own Date header; fall back to "seen by app" time only on insert
  const when = String(date || '').trim();
  ensureDb()
    .prepare(
      `INSERT INTO emails (uid, from_addr, subject, snippet, received_at, spam, seen)
       VALUES (
         ?, ?, ?, ?,
         CASE WHEN ? != '' THEN ? ELSE datetime('now') END,
         ?, ?
       )
       ON CONFLICT(uid) DO UPDATE SET
         from_addr = excluded.from_addr,
         subject = excluded.subject,
         snippet = excluded.snippet,
         received_at = CASE
           WHEN ? != '' THEN ?
           ELSE emails.received_at
         END,
         spam = CASE
           WHEN emails.spam = 1 THEN 1
           ELSE excluded.spam
         END`
    )
    .run(
      uid,
      from || '',
      subject || '',
      snippet || '',
      when,
      when,
      asSpam,
      asSpam ? 1 : 0,
      when,
      when
    );
  return asSpam === 1;
}

const EMAIL_SELECT = `uid, from_addr AS "from", subject, snippet, received_at, last_notified_at, slack_sent, seen, spam`;

function fold(s) {
  try {
    return String(s || '').toLocaleLowerCase('el');
  } catch {
    return String(s || '').toLowerCase();
  }
}

function filterByQuery(rows, query) {
  const q = fold(query).trim();
  if (!q) return rows;
  return rows.filter((r) => {
    return (
      fold(r.from).includes(q) ||
      fold(r.subject).includes(q) ||
      fold(r.snippet).includes(q)
    );
  });
}

export function listUnread() {
  return ensureDb()
    .prepare(
      `SELECT ${EMAIL_SELECT}
       FROM emails WHERE seen = 0 AND spam = 0
       ORDER BY received_at DESC`
    )
    .all();
}

/** @param {{ seen?: 0|1|'all', spam?: 0|1, query?: string, limit?: number }} opts */
export function listEmails(opts = {}) {
  const spam = opts.spam === 1 ? 1 : 0;
  const seen = opts.seen;
  let rows;
  if (spam === 1) {
    rows = ensureDb()
      .prepare(
        `SELECT ${EMAIL_SELECT}
         FROM emails WHERE spam = 1
         ORDER BY received_at DESC`
      )
      .all();
  } else if (seen === 0 || seen === 1) {
    rows = ensureDb()
      .prepare(
        `SELECT ${EMAIL_SELECT}
         FROM emails WHERE seen = ? AND spam = 0
         ORDER BY received_at DESC`
      )
      .all(seen);
  } else {
    rows = ensureDb()
      .prepare(
        `SELECT ${EMAIL_SELECT}
         FROM emails WHERE spam = 0
         ORDER BY received_at DESC`
      )
      .all();
  }
  rows = filterByQuery(rows, opts.query);
  const limit = Math.max(1, Math.min(1000, Number(opts.limit) || 500));
  return rows.slice(0, limit);
}

export function markSeen(uid) {
  ensureDb().prepare('UPDATE emails SET seen = 1 WHERE uid = ?').run(uid);
}

export function markUnseen(uid) {
  ensureDb()
    .prepare(
      `UPDATE emails
       SET seen = 0, last_notified_at = NULL, spam = 0
       WHERE uid = ?`
    )
    .run(uid);
}

export function markAllSeen() {
  ensureDb().prepare('UPDATE emails SET seen = 1 WHERE seen = 0 AND spam = 0').run();
}

export function markSpam(uid) {
  const row = ensureDb()
    .prepare(`SELECT from_addr FROM emails WHERE uid = ?`)
    .all(uid)[0];
  if (!row) return null;
  ensureDb()
    .prepare(
      `UPDATE emails SET spam = 1, seen = 1, last_notified_at = datetime('now') WHERE uid = ?`
    )
    .run(uid);
  const email = addSpamSender(row.from_addr);
  return { uid, email, from: row.from_addr };
}

export function markNotSpam(uid) {
  const row = ensureDb()
    .prepare(`SELECT from_addr FROM emails WHERE uid = ?`)
    .all(uid)[0];
  if (!row) return null;
  const email = extractEmail(row.from_addr);
  removeSpamSender(row.from_addr);
  if (email) {
    ensureDb()
      .prepare(
        `UPDATE emails
         SET spam = 0, seen = 0, last_notified_at = NULL
         WHERE instr(lower(from_addr), ?) > 0`
      )
      .run(email);
  } else {
    ensureDb()
      .prepare(
        `UPDATE emails
         SET spam = 0, seen = 0, last_notified_at = NULL
         WHERE uid = ?`
      )
      .run(uid);
  }
  return { uid, email, from: row.from_addr };
}

export function unblockSender(email) {
  const addr = removeSpamSender(email);
  if (!addr) return null;
  // leave existing spam-flagged mails as-is except those exact sender — restore them
  ensureDb()
    .prepare(
      `UPDATE emails
       SET spam = 0, seen = 0, last_notified_at = NULL
       WHERE instr(lower(from_addr), ?) > 0`
    )
    .run(addr);
  return addr;
}

export function readCount() {
  const row = ensureDb()
    .prepare('SELECT COUNT(*) AS n FROM emails WHERE seen = 1 AND spam = 0')
    .all()[0];
  return row ? row.n : 0;
}

export function spamCount() {
  const row = ensureDb()
    .prepare('SELECT COUNT(*) AS n FROM emails WHERE spam = 1')
    .all()[0];
  return row ? row.n : 0;
}

export function markSlackSent(uid) {
  ensureDb().prepare('UPDATE emails SET slack_sent = 1 WHERE uid = ?').run(uid);
}

export function touchNotified(uid) {
  ensureDb()
    .prepare(`UPDATE emails SET last_notified_at = datetime('now') WHERE uid = ?`)
    .run(uid);
}

export function unreadCount() {
  const row = ensureDb()
    .prepare('SELECT COUNT(*) AS n FROM emails WHERE seen = 0 AND spam = 0')
    .all()[0];
  return row ? row.n : 0;
}

export function knownUids() {
  return new Set(
    ensureDb()
      .prepare('SELECT uid FROM emails')
      .all()
      .map((r) => r.uid)
  );
}
