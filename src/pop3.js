import {
  bytesToBinaryString,
  decodeBestEffort,
  decodeBytes,
  normalizeCharset,
} from './charset.js';

const enc = new TextEncoder();

class LineReader {
  constructor(readable) {
    this.reader = readable.getReader();
    this.buf = new Uint8Array(0);
  }

  async readLineBytes() {
    while (true) {
      for (let i = 0; i < this.buf.length; i++) {
        if (this.buf[i] !== 0x0a) continue;
        let end = i;
        if (end > 0 && this.buf[end - 1] === 0x0d) end -= 1;
        const line = this.buf.subarray(0, end);
        this.buf = this.buf.subarray(i + 1);
        return line;
      }
      const { value, done } = await this.reader.read();
      if (done) {
        if (!this.buf.length) throw new Error('POP3 connection closed');
        let line = this.buf;
        if (line.length && line[line.length - 1] === 0x0d) {
          line = line.subarray(0, line.length - 1);
        }
        this.buf = new Uint8Array(0);
        return line;
      }
      const next = new Uint8Array(this.buf.length + value.length);
      next.set(this.buf);
      next.set(value, this.buf.length);
      this.buf = next;
    }
  }

  async readLine() {
    return bytesToBinaryString(await this.readLineBytes());
  }

  async readUntilDot() {
    const lines = [];
    while (true) {
      const line = await this.readLine();
      if (line === '.') break;
      lines.push(line.startsWith('..') ? line.slice(1) : line);
    }
    return lines;
  }

  cancel() {
    return this.reader.cancel().catch(() => {});
  }
}

async function writeLine(writer, line) {
  await writer.write(enc.encode(line + '\r\n'));
}

async function expectOk(reader, cmd) {
  const line = await reader.readLine();
  if (!line.startsWith('+OK')) {
    throw new Error((cmd ? cmd + ': ' : '') + line);
  }
  return line;
}

export async function fetchHeaders(cfg) {
  return fetchMessages(cfg);
}

export async function fetchMessages({ host, port, user, password, tls }) {
  if (!host || !user || !password) {
    throw new Error('Συμπλήρωσε host, χρήστη και κωδικό στις Ρυθμίσεις');
  }

  const proto = tls ? 'tls' : 'tcp';
  const portNum = Number(port) || (tls ? 995 : 110);
  const opts = tls ? { sni: host, verifyPeer: true } : undefined;
  const sock = await tjs.connect(proto, host, portNum, opts);
  const opened = await sock.opened;
  const writer = opened.writable.getWriter();
  const reader = new LineReader(opened.readable);

  try {
    await expectOk(reader, 'greeting');
    await writeLine(writer, 'USER ' + user);
    await expectOk(reader, 'USER');
    await writeLine(writer, 'PASS ' + password);
    await expectOk(reader, 'PASS');

    await writeLine(writer, 'UIDL');
    await expectOk(reader, 'UIDL');
    const uidlLines = await reader.readUntilDot();
    const messages = [];
    for (const line of uidlLines) {
      const sp = line.indexOf(' ');
      if (sp < 0) continue;
      const num = line.slice(0, sp).trim();
      const uid = line.slice(sp + 1).trim();
      if (!num || !uid) continue;
      messages.push({ num, uid });
    }

    const out = [];
    for (const msg of messages) {
      // headers + first body lines for snippet
      await writeLine(writer, 'TOP ' + msg.num + ' 40');
      await expectOk(reader, 'TOP');
      const raw = await reader.readUntilDot();
      out.push(parseMessage(msg.uid, raw));
    }

    await writeLine(writer, 'QUIT');
    try {
      await expectOk(reader, 'QUIT');
    } catch {
      /* some servers close immediately */
    }

    return out;
  } finally {
    try {
      await writer.close();
    } catch {
      /* ignore */
    }
    await reader.cancel();
    try {
      sock.close();
    } catch {
      /* ignore */
    }
  }
}

export async function testLogin(cfg) {
  const list = await fetchMessages(cfg);
  return { ok: true, count: list.length };
}

function parseMessage(uid, lines) {
  let sep = lines.indexOf('');
  if (sep < 0) sep = lines.length;
  const headerText = lines.slice(0, sep).join('\n');
  const bodyLines = lines.slice(sep + 1);
  const headers = parseHeaders(headerText);
  const snippet = extractSnippet(headers, bodyLines);
  return {
    uid,
    from: headers.from || '',
    subject: headers.subject || '(χωρίς θέμα)',
    snippet,
    date: headers.date || '',
  };
}

function parseHeaders(text) {
  const unfolded = text.replace(/\r?\n[ \t]+/g, ' ');
  const from = matchHeader(unfolded, 'From');
  const subject = matchHeader(unfolded, 'Subject');
  const dateRaw = matchHeader(unfolded, 'Date');
  const contentType = matchHeader(unfolded, 'Content-Type');
  const transferEncoding = matchHeader(unfolded, 'Content-Transfer-Encoding');
  return {
    from: decodeHeaderValue(from),
    subject: decodeHeaderValue(subject),
    date: formatEmailDate(dateRaw),
    contentType,
    transferEncoding,
    charset: charsetFromContentType(contentType) || 'utf-8',
  };
}

/** RFC 2822 Date → local `YYYY-MM-DD HH:mm:ss` (empty if unparsable). */
function formatEmailDate(raw) {
  if (!raw) return '';
  const cleaned = String(raw)
    .replace(/\s+/g, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim();
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':' +
    pad(d.getSeconds())
  );
}

function matchHeader(text, name) {
  const re = new RegExp('^' + name + ':\\s*(.*)$', 'im');
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

function charsetFromContentType(value) {
  if (!value) return '';
  const m = value.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  return m ? normalizeCharset(m[1]) : '';
}

function decodeHeaderValue(value) {
  if (!value) return '';
  // Adjacent encoded-words must be joined without the unfolding space
  let v = value.replace(/(\?=)\s+(=\?)/g, '$1$2');
  if (!/=\?/.test(v)) {
    return guessDecodeRaw(v);
  }
  return v.replace(
    /=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g,
    (_all, charset, encType, data) => {
      try {
        const bytes =
          encType.toUpperCase() === 'B' ? decodeBase64(data) : decodeQuotedPrintable(data, true);
        return decodeBytes(bytes, charset);
      } catch {
        return data;
      }
    }
  );
}

function guessDecodeRaw(value) {
  // Already unicode-looking (from UTF-8 socket decode path) — keep
  if (!/[^\x00-\x7f]/.test(value)) return value;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  const asUtf = decodeBytes(bytes, 'utf-8');
  if (!asUtf.includes('\uFFFD')) return asUtf;
  return decodeBytes(bytes, 'iso-8859-7');
}

function decodeBase64(data) {
  const clean = String(data).replace(/[\s\r\n]+/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeQuotedPrintable(data, underscoreIsSpace) {
  const parts = [];
  const s = String(data).replace(/=\r?\n/g, '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && i + 2 < s.length && /[0-9A-Fa-f]{2}/.test(s.slice(i + 1, i + 3))) {
      parts.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (underscoreIsSpace && s[i] === '_') {
      parts.push(0x20);
    } else {
      parts.push(s.charCodeAt(i) & 0xff);
    }
  }
  return Uint8Array.from(parts);
}

function extractSnippet(headers, bodyLines) {
  const rawBody = bodyLines.join('\n');
  if (!rawBody.trim()) return '';

  const ct = headers.contentType || '';
  let text = '';
  if (/multipart\//i.test(ct)) {
    text = extractMultipartText(ct, rawBody);
  } else {
    text = decodeBodyPart(rawBody, headers.transferEncoding, headers.charset, ct);
  }

  text = stripHtml(text)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (text.length > 180) text = text.slice(0, 177).trimEnd() + '…';
  return text;
}

function extractMultipartText(contentType, rawBody) {
  const bm = contentType.match(/boundary\s*=\s*"?([^";\s]+)"?/i);
  if (!bm) return rawBody;
  const boundary = bm[1];
  const parts = rawBody.split(new RegExp('--' + escapeRe(boundary) + '(?:--)?(?:\r?\n|$)'));
  let plain = '';
  let html = '';
  for (const part of parts) {
    if (!part || part === '--') continue;
    let sep = part.indexOf('\n\n');
    const sepCr = part.indexOf('\r\n\r\n');
    if (sepCr >= 0 && (sep < 0 || sepCr < sep)) sep = sepCr;
    if (sep < 0) continue;
    const ph = part.slice(0, sep).replace(/\r?\n[ \t]+/g, ' ');
    const pb = part.slice(sep).replace(/^\r?\n\r?\n/, '').replace(/^\n\n/, '');
    const pct = matchHeader(ph, 'Content-Type');
    const pte = matchHeader(ph, 'Content-Transfer-Encoding');
    const pcs = charsetFromContentType(pct) || 'utf-8';
    if (/text\/plain/i.test(pct)) {
      plain = decodeBodyPart(pb, pte, pcs, pct);
      break;
    }
    if (/text\/html/i.test(pct) && !html) {
      html = decodeBodyPart(pb, pte, pcs, pct);
    }
  }
  return plain || html || '';
}

function decodeBodyPart(raw, transferEncoding, charset, contentType) {
  const te = String(transferEncoding || '').toLowerCase();
  let bytes;
  if (te.includes('base64')) {
    bytes = decodeBase64(raw);
  } else if (te.includes('quoted-printable')) {
    bytes = decodeQuotedPrintable(raw, false);
  } else {
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
  }
  let declared = charset || charsetFromContentType(contentType) || '';
  // HTML often lies in the MIME charset — trust <meta charset> when present
  const asUtfPeek = decodeBytes(bytes, 'utf-8');
  const metaCs = charsetFromHtml(asUtfPeek) || charsetFromHtml(decodeBytes(bytes, 'iso-8859-1'));
  if (metaCs) declared = metaCs;
  return decodeBestEffort(bytes, declared || 'utf-8');
}

function charsetFromHtml(html) {
  if (!html) return '';
  let m = html.match(/<meta[^>]+charset\s*=\s*["']?([^"'>\s]+)/i);
  if (m) return normalizeCharset(m[1]);
  m = html.match(/<meta[^>]+content=["'][^"']*charset=([^"'>\s]+)/i);
  return m ? normalizeCharset(m[1]) : '';
}

function stripHtml(html) {
  if (!/[<>]/.test(html)) return decodeEntities(html);
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return code > 0 ? String.fromCodePoint(code) : _;
    });
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
