# 그림 이모티콘 묶음

메시지의 스티커 서랍에 탭으로 보여요. `packs.json`에 적힌 것만 보낼 수 있어요(서버가 확인해요).

```text
assets/stickers/
  packs.json
  bunny/            ← 묶음 하나 = 폴더 하나 (영어 소문자·숫자·-·_)
    hi.webp
    cheer.webp
```

```json
[
  { "key": "bunny", "name": "공부 토끼", "items": [
    { "key": "hi", "t": "안녕", "file": "hi.webp" },
    { "key": "cheer", "t": "화이팅", "file": "cheer.webp" }
  ]}
]
```

- 그림: 정사각형, 배경 투명 PNG 또는 WebP, 360×360px 정도, 한 장 150KB 이하 권장
- `t`는 화면에 안 보이는 이름이에요(목록 미리보기·화면 읽기용)
- 이미 보낸 이모티콘이 깨지지 않게, 한 번 넣은 `key`는 지우거나 바꾸지 마세요
