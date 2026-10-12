const MAX = 500;
const enc = new TextEncoder();
const dec = new TextDecoder();

const entries = [];
let appRef = null;
let logsDir = null;
let writeChain = Promise.resolve();

export async function attachLogger(app) {
  appRef = app;
  logsDir = app.paths?.logs || null;
  if (logsDir) {
    await tjs.makeDir(logsDir, { recursive: true });
    await hydrateFromToday();
  }
}

function dayStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate())
  );
}

function todayLogPath() {
  if (!logsDir) return null;
  return logsDir.replace(/\/$/, '') + '/' + dayStamp() + '.log';
}

function formatLine(entry) {
  const detail = entry.detail ? ' — ' + entry.detail : '';
  return (
    '[' +
    entry.ts +
    '] ' +
    String(entry.level || 'info').toUpperCase() +
    '  ' +
    entry.message +
    detail +
    '\n'
  );
}

async function appendToFile(entry) {
  const path = todayLogPath();
  if (!path) return;
  const fh = await tjs.open(path, 'a');
  try {
    await fh.write(enc.encode(formatLine(entry)));
  } finally {
    await fh.close();
  }
}

function queueWrite(entry) {
  writeChain = writeChain
    .then(() => appendToFile(entry))
    .catch(() => {
      /* disk errors must not break the app */
    });
  return writeChain;
}

function parseLogLine(line, id) {
  const m = line.match(
    /^\[([^\]]+)\]\s+(\w+)\s{2}(.*?)(?:\s+—\s+(.*))?$/
  );
  if (!m) {
    return {
      id,
      ts: new Date().toISOString(),
      level: 'info',
      message: line,
      detail: '',
    };
  }
  return {
    id,
    ts: m[1],
    level: m[2].toLowerCase(),
    message: m[3] || '',
    detail: m[4] || '',
  };
}

async function hydrateFromToday() {
  const path = todayLogPath();
  if (!path) return;
  try {
    const data = await tjs.readFile(path);
    const text = dec.decode(data);
    const lines = text.split(/\r?\n/).filter(Boolean);
    const slice = lines.slice(-MAX);
    entries.length = 0;
    slice.forEach((line, i) => {
      entries.push(parseLogLine(line, i + 1));
    });
  } catch {
    /* file may not exist yet */
  }
}

export function log(level, message, detail) {
  const entry = {
    id: entries.length ? entries[entries.length - 1].id + 1 : 1,
    ts: new Date().toISOString(),
    level: level || 'info',
    message: String(message || ''),
    detail: detail == null ? '' : String(detail),
  };
  entries.push(entry);
  while (entries.length > MAX) entries.shift();
  queueWrite(entry);
  if (appRef) {
    try {
      appRef.push('log', entry);
    } catch {
      /* ignore */
    }
  }
  return entry;
}

export function info(message, detail) {
  return log('info', message, detail);
}

export function warn(message, detail) {
  return log('warn', message, detail);
}

export function error(message, detail) {
  return log('error', message, detail);
}

export function getLogs({ limit } = {}) {
  const n = Math.max(1, Math.min(MAX, Number(limit) || MAX));
  return entries.slice(-n);
}

export function clearLogs() {
  entries.length = 0;
  if (appRef) {
    try {
      appRef.push('logsCleared', {});
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

/** Absolute path of today's log file (if logger attached). */
export function todayLogFile() {
  return todayLogPath();
}

export function getLogsDir() {
  return logsDir;
}
