# 공부 친구 앱 (Flutter)

웹사이트 **공부 친구**(http://chanwlab.com/study_friend/)를 그대로 감싸서 휴대폰 앱처럼 쓰게 해 주는 앱이에요.
사이트를 고치면 앱도 바로 바뀌어요. 앱을 다시 만들 필요가 없어요.

## 앱에서 되는 것

- 사이트 전체 (캘린더, 공부, 메시지, 보드, 그림판, 메모장 …)
- 메시지로 보낼 파일 고르기 (휴대폰 파일 고르기 창), 하루 기록·인증 사진 올리기
- 파일 **받기** → 휴대폰의 저장·공유 창이 떠요 (파일에 저장, 카톡으로 보내기 등)
- 휴대폰 뒤로 가기 버튼 = 앞 화면으로
- 인터넷이 끊기면 "다시 시도" 화면
- 바깥 링크는 휴대폰 브라우저로 열려요
- **휴대폰 알림**: 친구 일정, 공동 계획, 메시지, 같이 쓰는 메모·그림판, 보드 댓글·공지
  - 앱이 켜져 있으면 바로, 꺼져 있으면 안드로이드가 **15분마다** 확인해서 알려 줘요 (휴대폰 절전 상태에 따라 더 늦을 수 있어요)
  - 알림을 누르면 그 화면(대화, 그날 일정, 계획…)이 열려요
  - 처음 로그인하면 "알림 허용"을 물어봐요. 휴대폰 설정 → 앱 → 공부 친구 → 알림에서 종류별로 끌 수도 있어요
  - 로그아웃하면 그 휴대폰 알림도 멈춰요
  - 아이폰은 앱이 켜져 있을 때만 알림이 와요 (꺼져 있을 때 알림은 애플 개발자 계정과 푸시 서버가 필요해요)

> **구글 로그인은 앱에서 안 돼요.** 구글이 앱 안 웹 화면에서의 로그인을 막아 두었어요.
> 앱에서는 아이디/비밀번호나 카카오로 로그인하세요. (같은 계정에 연결해 두면 돼요)

## APK 받기 (친구들에게는 이 주소만 보내면 돼요)

항상 최신 APK: **https://github.com/chanwoo03/study-friends/releases/latest/download/study-friends.apk**

GitHub 로그인 없이 받을 수 있어요. 지난 버전은 저장소의 **Releases** 페이지에 있어요.

## APK 만들기 (가장 쉬운 방법: GitHub에서)

1. GitHub 저장소 → **Actions** 탭 → **안드로이드 앱 만들기** → **Run workflow**
2. 주소 칸은 그대로 두고 (또는 내 사이트 주소) 초록 버튼을 눌러요
3. 5~10분 뒤 **Releases**에 새 APK가 올라가요 (main에 `app/` 코드가 바뀌어 올라오면 저절로 만들어요)
4. 압축을 풀면 `app-release.apk` → 휴대폰으로 옮겨 설치 ("출처를 알 수 없는 앱" 허용 필요)

## 내 컴퓨터에서 만들기

[Flutter](https://docs.flutter.dev/get-started/install)와 Android Studio를 설치한 뒤:

```bash
cd app
flutter pub get
flutter build apk --release
```

다른 주소를 열게 하려면:

```bash
flutter build apk --release --dart-define=APP_URL=http://내도메인/study_friend/
```

아이폰 앱은 Mac + Xcode가 있어야 해요: `flutter build ios`

## 알아 둘 것

- 사이트가 아직 **http**라서 `android/app/src/main/res/xml/network_security_config.xml`과
  `ios/Runner/Info.plist`에 chanwlab.com만 http를 허용해 두었어요. 다른 도메인을 쓰면 두 곳을 바꾸세요.
- 지금 APK는 시험용 열쇠(debug key)로 서명돼요. 친구들끼리 설치해 쓰기엔 괜찮지만,
  Play 스토어에 올리려면 따로 서명 열쇠를 만들어야 해요.
