# SANVEL QR 테스트

의료기기 검진 시작 전 개인정보 입력 화면에서, 상벨 앱이 표시하는 QR을 읽어 바로 검진을 시작하는 흐름을 검증하는 테스트 페이지다.
제조사에 전달할 참고 구현이며, HTML/CSS/JS 파일만으로 동작한다.

## 실행

```bash
open index.html
```

빌드도 서버도 없다. 브라우저로 파일을 열면 된다.
전달할 파일은 `index.html`, `sanvel-qr.js` 두 개다.
QR 생성에만 CDN(`qrcodejs`)을 쓰고, 검진 시작 화면은 네트워크 없이 동작한다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `index.html` | 화면 전부(마크업·스타일·조립) |
| `sanvel-qr.js` | QR 인코딩·디코딩, HID 스캔 버퍼, IME 키 복원 |
| `test/sanvel-qr.test.js` | `sanvel-qr.js` 테스트 |

## QR 형식

```
SANVEL:QRSTART:{이름}:{성별}:{생년월일}:{휴대폰번호}:QREND
SANVEL:QRSTART:B64:{base64url("이름:성별:생년월일:휴대폰번호")}:QREND
```

예시

```
SANVEL:QRSTART:HONG:M:19990101:01012345678:QREND
SANVEL:QRSTART:B64:7ZmN6ri464-ZOk06MTk5OTAxMDE6MDEwMTIzNDU2Nzg=:QREND
```

성별은 `M` / `F`, 생년월일은 `yyyyMMdd`, 휴대폰번호는 숫자 11자리다.

한글 이름은 HID 키보드가 US 키맵 밖 문자를 타이핑하지 못해 평문 형식으로는 전달되지 않는다.
`B64:` 형식은 개인정보 구간을 base64url로 감싸 ASCII만 남긴다. **한글 이름을 담으려면 이 형식을 써야 한다.**

## 화면

### QR 생성

이름·성별·생년월일·휴대폰번호를 입력하면 QR과 원문 문자열을 함께 보여 준다.
인코딩 체크박스를 끄면 평문 형식으로 바뀌고, 이름에 한글이 있으면 경고를 띄운다.

### 검진 시작

기존 개인정보 입력 화면이다. 수동 입력은 그대로 두고 QR 스캔을 함께 받는다.

1. "QR 인증해주세요" 배너가 항상 떠 있다.
2. `SANVEL:QRSTART:`로 시작하는 입력이 들어올 때만 배너가 "QR 수신 중…"으로 바뀐다.
3. `:QREND`에서 한 건으로 확정하면 이름·성별·생년월일·휴대폰번호가 각 입력란에 채워진다.
4. **5초 카운트다운** 뒤 검진 시작 화면으로 넘어간다. 채워진 값을 눈으로 확인할 시간을 주기 위한 것이다.
   "바로 시작"으로 건너뛰거나 "취소"로 되돌릴 수 있다.

휴대폰번호 11자리를 직접 입력하고 "확인"을 눌러도 같은 화면으로 간다.

## 구현

### 1. HID 키 입력 수신

스캐너(DS9308)는 **USB Keyboard HID**로 둔다. Zebra SDK는 필요 없다.
문자를 버퍼에 모으다가 `:QREND`가 보이면 스캔 1건으로 확정한다.

```js
const buf = createScanBuffer();

document.addEventListener('keydown', e => {
  const ch = keyToChar(e);
  if (ch === null) return;

  const raw = buf.add(ch);
  if (raw) processQr(parseQr(raw));
});
```

자체 소프트 키패드 UI를 그리는 화면은 터치 이벤트만 듣는 구현이 많아, 스캐너를 연결해도 값이 들어오지 않는다.
**키 이벤트 수신 경로를 한 겹 추가하는 것이 이번 요청의 핵심이다.**

### 2. prefix 게이팅

`SANVEL:QRSTART:`와 어긋나는 입력은 버퍼에 쌓지도, 삼키지도 않는다.
수동 입력과 다른 키 입력이 QR 수신 상태로 잘못 잡히지 않는다.
어긋나면 앞에서 한 글자씩 떼어 내며 재동기화하므로, `abc123SANVEL:QRSTART:...` 처럼 앞에 잡음이 붙어도 QR을 놓치지 않는다.

### 3. 한글 입력 상태(IME) 복원

스캐너는 HID 키보드라 OS 입력기를 그대로 통과한다. 한글 입력 상태에서 스캔하면 키가 한글로 변환된다.

```
SANVEL:QRSTART:B64:...:QREND
ㄴ뭎띠:ㅃㄲㄴㅆㅁㄲㅆ:ㅠ64:...:ㅃㄲ뚱
```

문자값(`e.key`)이 아니라 **물리 키 위치(`e.code`)로 원래 문자를 복원**한다(`keyToChar`).
SANVEL QR에 쓰이는 문자는 `A-Z a-z 0-9 : - _ =` 뿐이라 작은 표 하나로 전부 덮인다.
IME가 꺼져 있으면 `e.key`를 그대로 쓴다.

입력란에 포커스가 있어도 `keydown`에서 받는다. IME가 켜져 있으면 입력란 값만으로는 QR을 복원할 수 없기 때문이다.

## 다른 언어로 옮길 때

구조는 동일하다. 키 이벤트에서 문자를 받아 버퍼에 쌓고, 종료 신호에서 확정한다.

```cpp
std::string qrBuffer;

void onKeyInput(char ch)
{
    qrBuffer += ch;

    if (qrBuffer.find(":QREND") != std::string::npos)
    {
        if (qrBuffer.rfind("SANVEL:QRSTART:", 0) == 0)
        {
            processQr(qrBuffer);
        }
        qrBuffer.clear();
    }
}

// Windows Native
case WM_CHAR:
{
    onKeyInput(static_cast<char>(wParam));
    break;
}
```

**`WM_CHAR`는 IME를 거친 문자가 온다.** 위의 3번과 같은 문제가 생기므로,
`WM_KEYDOWN`의 가상 키 코드(`VK_*`)로 처리하거나 QR 입력 화면에서 IME를 끄는 처리가 필요하다.

## 테스트용 문자열

QR 생성 탭에서 직접 만들어도 되고, 아래 문자열을 QR로 인코딩해 써도 된다.

| 문자열 | 값 |
| --- | --- |
| `SANVEL:QRSTART:B64:7ZmN6ri464-ZOk06MTk5OTAxMDE6MDEwMTIzNDU2Nzg=:QREND` | 홍길동 / M / 19990101 / 01012345678 |
| `SANVEL:QRSTART:B64:6rmA7JiB7Z2sOkY6MTk4ODAzMTU6MDEwOTg3NjU0MzI=:QREND` | 김영희 / F / 19880315 / 01098765432 |
| `SANVEL:QRSTART:HONG:M:19990101:01012345678:QREND` | HONG / M / 19990101 / 01012345678 (평문 형식) |

## 테스트

```bash
node --test test/sanvel-qr.test.js
```

인코딩·디코딩 왕복, prefix 게이팅, 잡음 재동기화, 한글 IME 키 복원을 확인한다.
