'use strict';

// ---------------------------------------------------------------- QR 형식
//
// 평문   : SANVEL:QRSTART:{이름}:{성별}:{생년월일}:{휴대폰번호}:QREND
// 인코딩 : SANVEL:QRSTART:B64:{base64url("이름:성별:생년월일:휴대폰번호")}:QREND
//
// 스캐너(DS9308)는 USB Keyboard HID로 동작한다. 값을 키보드처럼 타이핑하므로
// US 키맵 밖 문자는 전달되지 않는다. 한글 이름은 인코딩 형식을 써야 한다.

const PREFIX = 'SANVEL:QRSTART:';
const SUFFIX = ':QREND';
const B64 = 'B64:';

function toBase64Url(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** QR에 넣을 문자열을 만든다. */
function buildQr({ name, gender, birth, phone }, encoded) {
  const fields = [name, gender, birth, phone];
  if (fields.some(f => f.includes(':'))) {
    throw new Error('필드에 구분자 ":"를 포함할 수 없습니다');
  }
  const body = fields.join(':');
  return PREFIX + (encoded ? B64 + toBase64Url(body) : body) + SUFFIX;
}

/** SANVEL QR이 아니면 null. */
function parseQr(raw) {
  const s = raw.trim();
  if (!s.startsWith(PREFIX) || !s.endsWith(SUFFIX)) return null;

  let body = s.slice(PREFIX.length, -SUFFIX.length);
  if (body.startsWith(B64)) {
    try {
      body = fromBase64Url(body.slice(B64.length));
    } catch {
      return null;
    }
  }

  const parts = body.split(':');
  if (parts.length !== 4 || parts.some(p => p === '')) return null;
  return { name: parts[0], gender: parts[1], birth: parts[2], phone: parts[3] };
}

// ------------------------------------------------------- HID 스캔 버퍼
//
// 스캐너는 키보드처럼 문자를 하나씩 보낸다. ":QREND"가 보이면 1건으로 확정한다.
// SANVEL prefix와 어긋나는 입력은 버퍼에 남기지 않는다. 수동 입력이나 다른 키
// 입력이 QR 수신 상태로 잘못 잡히는 것을 막는다.

// ------------------------------------------------------- 키 이벤트 → 문자
//
// 스캐너는 HID 키보드라 OS의 입력기(IME)를 그대로 통과한다. 한글 입력 상태면
// 키가 한글로 변환돼 들어온다.
//   SANVEL:QRSTART:...  →  ㄴ뭎띠:ㅃㄲㄴㅆㅁㄲㅆ:...
// 변환된 문자(e.key) 대신 물리 키 위치(e.code)로 원래 문자를 복원한다.
// SANVEL QR에 쓰이는 문자는 A-Z a-z 0-9 : - _ = 뿐이라 이 표로 전부 덮인다.

const CODE_MAP = {
  Semicolon: [';', ':'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  Slash: ['/', '?'],
  Period: ['.', '>'],
  Comma: [',', '<'],
};

/** 키 이벤트에서 스캔 문자 한 개를 복원한다. 해당 없으면 null. */
function keyToChar(e) {
  if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') return '\n';

  // IME가 꺼져 있으면 e.key가 이미 원래 문자다.
  if (e.key && e.key.length === 1 && e.key.charCodeAt(0) < 128) return e.key;

  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) {
    const ch = code.slice(3);
    return e.shiftKey ? ch : ch.toLowerCase();
  }
  if (/^Digit[0-9]$/.test(code) && !e.shiftKey) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);

  const pair = CODE_MAP[code];
  return pair ? pair[e.shiftKey ? 1 : 0] : null;
}

function createScanBuffer() {
  let buf = '';

  const matchesPrefix = s =>
    s.length < PREFIX.length ? PREFIX.startsWith(s) : s.startsWith(PREFIX);

  return {
    get text() { return buf; },
    clear() { buf = ''; },
    /** 문자 하나를 넣는다. 스캔 1건이 완성되면 원문을, 아니면 null을 반환. */
    add(ch) {
      if (ch === '\n' || ch === '\r') {
        const done = buf;
        buf = '';
        return done || null;
      }

      let s = buf + ch;
      // 어긋나면 앞에서 한 글자씩 떼어 내며 재동기화한다.
      // ("xSANVEL:..." 처럼 앞에 잡음이 붙어도 QR을 놓치지 않는다.)
      while (s && !matchesPrefix(s)) s = s.slice(1);
      buf = s;

      if (s.endsWith(SUFFIX)) {
        buf = '';
        return s;
      }
      if (s.length > 512) buf = '';  // 잘못된 입력이 무한히 쌓이는 것 방지
      return null;
    },
  };
}

// Node 테스트에서도 쓸 수 있게 내보낸다. 브라우저에서는 전역으로 남는다.
if (typeof module !== 'undefined') {
  module.exports = { PREFIX, SUFFIX, B64, buildQr, parseQr, createScanBuffer, keyToChar };
}
