const utf8 = new TextDecoder('utf-8');

// ISO-8859-7 (Greek) for 0xA0–0xFF. Undefined slots → U+FFFD.
const ISO_8859_7 = [
  0x00a0, 0x2018, 0x2019, 0x00a3, 0x20ac, 0x20af, 0x00a6, 0x00a7,
  0x00a8, 0x00a9, 0x037a, 0x00ab, 0x00ac, 0x00ad, 0xfffd, 0x2015,
  0x00b0, 0x00b1, 0x00b2, 0x00b3, 0x0384, 0x0385, 0x0386, 0x00b7,
  0x0388, 0x0389, 0x038a, 0x00bb, 0x038c, 0x00bd, 0x038e, 0x038f,
  0x0390, 0x0391, 0x0392, 0x0393, 0x0394, 0x0395, 0x0396, 0x0397,
  0x0398, 0x0399, 0x039a, 0x039b, 0x039c, 0x039d, 0x039e, 0x039f,
  0x03a0, 0x03a1, 0xfffd, 0x03a3, 0x03a4, 0x03a5, 0x03a6, 0x03a7,
  0x03a8, 0x03a9, 0x03aa, 0x03ab, 0x03ac, 0x03ad, 0x03ae, 0x03af,
  0x03b0, 0x03b1, 0x03b2, 0x03b3, 0x03b4, 0x03b5, 0x03b6, 0x03b7,
  0x03b8, 0x03b9, 0x03ba, 0x03bb, 0x03bc, 0x03bd, 0x03be, 0x03bf,
  0x03c0, 0x03c1, 0x03c2, 0x03c3, 0x03c4, 0x03c5, 0x03c6, 0x03c7,
  0x03c8, 0x03c9, 0x03ca, 0x03cb, 0x03cc, 0x03cd, 0x03ce, 0xfffd,
];

// windows-1253 — close to ISO-8859-7 with extra punctuation in 0x80–0x9F.
const CP1253 = new Array(256);
for (let i = 0; i < 256; i++) CP1253[i] = i < 0x80 ? i : 0xfffd;
Object.assign(CP1253, {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x89: 0x2030, 0x8b: 0x2039, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013,
  0x97: 0x2014, 0x99: 0x2122, 0x9b: 0x203a, 0xa0: 0x00a0, 0xa1: 0x0385,
  0xa2: 0x0386, 0xa3: 0x00a3, 0xa4: 0x00a4, 0xa5: 0x00a5, 0xa6: 0x00a6,
  0xa7: 0x00a7, 0xa8: 0x00a8, 0xa9: 0x00a9, 0xab: 0x00ab, 0xac: 0x00ac,
  0xad: 0x00ad, 0xae: 0x00ae, 0xaf: 0x2015, 0xb0: 0x00b0, 0xb1: 0x00b1,
  0xb2: 0x00b2, 0xb3: 0x00b3, 0xb4: 0x0384, 0xb5: 0x00b5, 0xb6: 0x00b6,
  0xb7: 0x00b7, 0xb8: 0x0388, 0xb9: 0x0389, 0xba: 0x038a, 0xbb: 0x00bb,
  0xbc: 0x038c, 0xbd: 0x00bd, 0xbe: 0x038e, 0xbf: 0x038f, 0xc0: 0x0390,
  0xc1: 0x0391, 0xc2: 0x0392, 0xc3: 0x0393, 0xc4: 0x0394, 0xc5: 0x0395,
  0xc6: 0x0396, 0xc7: 0x0397, 0xc8: 0x0398, 0xc9: 0x0399, 0xca: 0x039a,
  0xcb: 0x039b, 0xcc: 0x039c, 0xcd: 0x039d, 0xce: 0x039e, 0xcf: 0x039f,
  0xd0: 0x03a0, 0xd1: 0x03a1, 0xd3: 0x03a3, 0xd4: 0x03a4, 0xd5: 0x03a5,
  0xd6: 0x03a6, 0xd7: 0x03a7, 0xd8: 0x03a8, 0xd9: 0x03a9, 0xda: 0x03aa,
  0xdb: 0x03ab, 0xdc: 0x03ac, 0xdd: 0x03ad, 0xde: 0x03ae, 0xdf: 0x03af,
  0xe0: 0x03b0, 0xe1: 0x03b1, 0xe2: 0x03b2, 0xe3: 0x03b3, 0xe4: 0x03b4,
  0xe5: 0x03b5, 0xe6: 0x03b6, 0xe7: 0x03b7, 0xe8: 0x03b8, 0xe9: 0x03b9,
  0xea: 0x03ba, 0xeb: 0x03bb, 0xec: 0x03bc, 0xed: 0x03bd, 0xee: 0x03be,
  0xef: 0x03bf, 0xf0: 0x03c0, 0xf1: 0x03c1, 0xf2: 0x03c2, 0xf3: 0x03c3,
  0xf4: 0x03c4, 0xf5: 0x03c5, 0xf6: 0x03c6, 0xf7: 0x03c7, 0xf8: 0x03c8,
  0xf9: 0x03c9, 0xfa: 0x03ca, 0xfb: 0x03cb, 0xfc: 0x03cc, 0xfd: 0x03cd,
  0xfe: 0x03ce,
});

function mapDecode(bytes, table, offset) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < offset) out += String.fromCharCode(b);
    else out += String.fromCharCode(table[b - offset] ?? 0xfffd);
  }
  return out;
}

export function normalizeCharset(name) {
  const n = String(name || 'utf-8')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/^charset=/i, '');
  if (!n || n === 'utf8' || n === 'utf-8' || n === 'unicode-1-1-utf-8') return 'utf-8';
  if (n === 'us-ascii' || n === 'ascii' || n === 'ansi_x3.4-1968') return 'ascii';
  if (n === 'latin1' || n === 'iso-8859-1' || n === 'iso_8859-1' || n === 'l1' || n === 'cp819')
    return 'iso-8859-1';
  if (
    n === 'iso-8859-7' ||
    n === 'iso_8859-7' ||
    n === 'greek' ||
    n === 'greek8' ||
    n === 'csisolatingreek' ||
    n === 'ecma-118' ||
    n === 'elot_928'
  )
    return 'iso-8859-7';
  if (n === 'windows-1253' || n === 'cp1253' || n === 'ms-greek' || n === 'x-cp1253')
    return 'windows-1253';
  if (n === 'windows-1252' || n === 'cp1252') return 'windows-1252';
  return n;
}

export function decodeBytes(bytes, charset) {
  if (!bytes || !bytes.length) return '';
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const cs = normalizeCharset(charset);
  if (cs === 'utf-8') {
    try {
      return utf8.decode(view);
    } catch {
      return latin1(view);
    }
  }
  if (cs === 'ascii' || cs === 'iso-8859-1' || cs === 'windows-1252') return latin1(view);
  if (cs === 'iso-8859-7') return mapDecode(view, ISO_8859_7, 0xa0);
  if (cs === 'windows-1253') {
    let out = '';
    for (let i = 0; i < view.length; i++) {
      out += String.fromCharCode(CP1253[view[i]] ?? 0xfffd);
    }
    return out;
  }
  try {
    return new TextDecoder(cs).decode(view);
  } catch {
    // Prefer Greek over opaque UTF-8 replacement for unknown 8-bit mail
    const asUtf = utf8.decode(view);
    if (!asUtf.includes('\uFFFD')) return asUtf;
    return mapDecode(view, ISO_8859_7, 0xa0);
  }
}

function latin1(view) {
  let out = '';
  for (let i = 0; i < view.length; i++) out += String.fromCharCode(view[i]);
  return out;
}

/** Decode text that may already be a binary-latin1 string of raw bytes. */
export function decodeBinaryString(str, charset) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return decodeBytes(bytes, charset);
}

export function bytesToBinaryString(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function countChar(str, re) {
  const m = str.match(re);
  return m ? m.length : 0;
}

/** Lower is better. Penalize replacement chars and UTF-8-as-ISO Greek mojibake. */
export function scoreDecodedText(text) {
  if (!text) return 1e9;
  const len = Math.max(text.length, 1);
  const bad = countChar(text, /\uFFFD/g);
  // UTF-8 Greek misread as ISO-8859-7 → Ξ΅, Ξ±, Ο€, Οƒ …
  const mojibake = countChar(text, /[ΞΟ][\u00A0-\u00FF΅·±]/g);
  const mojibake2 = countChar(text, /Î.|Ã./g);
  const goodGreek = countChar(text, /[\u0370-\u03FF\u1F00-\u1FFF]/g);
  // real Greek letters that are NOT the mojibake capitals Ξ/Ο alone in pairs
  return bad * 50 + mojibake * 8 + mojibake2 * 8 - goodGreek * 0.4 + (bad / len) * 20;
}

/**
 * Pick the best decode among UTF-8 and declared/greek charsets.
 * Mislabelled Greek mail often declares iso-8859-7 while the body is UTF-8.
 */
export function decodeBestEffort(bytes, declaredCharset) {
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const candidates = ['utf-8'];
  const declared = normalizeCharset(declaredCharset || '');
  if (declared && !candidates.includes(declared)) candidates.push(declared);
  for (const extra of ['iso-8859-7', 'windows-1253', 'iso-8859-1']) {
    if (!candidates.includes(extra)) candidates.push(extra);
  }

  let best = '';
  let bestScore = Infinity;
  for (const cs of candidates) {
    const text = decodeBytes(view, cs);
    const score = scoreDecodedText(text);
    if (score < bestScore) {
      bestScore = score;
      best = text;
    }
  }
  return best;
}
