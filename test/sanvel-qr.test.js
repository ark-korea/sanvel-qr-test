'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildQr, parseQr, createScanBuffer, keyToChar } = require('../sanvel-qr.js');

const HONG = { name: '홍길동', gender: 'M', birth: '19960207', phone: '01012345678' };
const RAW = 'SANVEL:QRSTART:HONG:M:19960207:01032318937:QREND';

function feed(buf, input) {
  let done = null;
  for (const ch of input) done = done ?? buf.add(ch);
  return done;
}

test('개인정보 형식을 인코딩·디코딩해 원본을 복원한다', () => {
  for (const encoded of [true, false]) {
    assert.deepStrictEqual(parseQr(buildQr(HONG, encoded)), HONG);
  }
  // 인코딩 형식은 ASCII만 남아 HID 키보드로 타이핑할 수 있다.
  assert.ok([...buildQr(HONG, true)].every(c => c.charCodeAt(0) < 128));
  assert.ok(![...buildQr(HONG, false)].every(c => c.charCodeAt(0) < 128));
});

test('필드에 구분자가 들어가면 거부한다', () => {
  assert.throws(() => buildQr({ ...HONG, name: 'a:b' }, true));
});

test('QREND에서 스캔 1건을 확정한다', () => {
  assert.strictEqual(feed(createScanBuffer(), RAW), RAW);
});

test('SANVEL로 시작하지 않는 입력은 버퍼에 쌓이지 않는다', () => {
  const buf = createScanBuffer();

  assert.strictEqual(feed(buf, '01032318937'), null);
  assert.strictEqual(buf.text, '');

  assert.strictEqual(feed(buf, 'SANVELX'), null);
  assert.strictEqual(buf.text, '');

  feed(buf, 'SANVEL:QR');
  assert.strictEqual(buf.text, 'SANVEL:QR');
});

test('앞에 잡음이 붙어도 QR을 놓치지 않는다', () => {
  assert.strictEqual(feed(createScanBuffer(), `abc123${RAW}`), RAW);
});

test('잘못된 형식은 null', () => {
  assert.strictEqual(parseQr('SANVEL:QRSTART:HONG:M:19960207:QREND'), null);
  assert.strictEqual(parseQr('01012345678'), null);
  assert.strictEqual(parseQr('SANVEL:QRSTART:B64:!!!:QREND'), null);
});

// 한글 입력 상태에서 스캐너가 보낸 키 이벤트. e.key는 한글로 변환돼 있고
// e.code(물리 키 위치)만 원래 값을 유지한다.
const HANGUL_KEY = {
  S: 'ㄴ', A: '뭎', N: '띠', V: 'ㅠ', E: 'ㄷ', L: 'ㅣ',
  Q: 'ㅃ', R: 'ㄲ', T: 'ㅆ', B: 'ㅠ', ':': 'ㅊ',
};

function imeEvent(ch) {
  if (/[A-Z]/.test(ch)) {
    return { key: HANGUL_KEY[ch] ?? 'ㅁ', code: `Key${ch}`, shiftKey: true };
  }
  if (/[0-9]/.test(ch)) return { key: ch, code: `Digit${ch}`, shiftKey: false };
  if (ch === ':') return { key: HANGUL_KEY[':'], code: 'Semicolon', shiftKey: true };
  if (ch === '-') return { key: 'ㅡ', code: 'Minus', shiftKey: false };
  if (ch === '_') return { key: 'ㅡ', code: 'Minus', shiftKey: true };
  if (ch === '=') return { key: 'ㅋ', code: 'Equal', shiftKey: false };
  return { key: ch, code: 'Unknown', shiftKey: false };
}

test('한글 IME 상태의 키 이벤트에서 원래 문자를 복원한다', () => {
  const raw = buildQr(HONG, true);
  const buf = createScanBuffer();

  let done = null;
  for (const ch of raw) {
    const restored = keyToChar(imeEvent(ch));
    assert.strictEqual(restored, ch, `${ch} 복원 실패`);
    done = done ?? buf.add(restored);
  }
  assert.strictEqual(done, raw);
  assert.deepStrictEqual(parseQr(done), HONG);
});

test('IME가 꺼져 있으면 e.key를 그대로 쓴다', () => {
  assert.strictEqual(keyToChar({ key: 'S', code: 'KeyS', shiftKey: true }), 'S');
  assert.strictEqual(keyToChar({ key: ':', code: 'Semicolon', shiftKey: true }), ':');
  assert.strictEqual(keyToChar({ key: 'Enter', code: 'Enter' }), '\n');
  assert.strictEqual(keyToChar({ key: 'Shift', code: 'ShiftLeft' }), null);
});
