// Firebase 앱 정보 (google-services.json 에 있는 값)
// 이 값들은 비밀번호가 아니에요. APK 안에도 그대로 들어가는 공개 식별자라 저장소에 둬도 괜찮아요.
// (서버용 '서비스 계정 키'는 비밀이라 여기에 넣지 않고 카페24 서버에만 둬요)
// 비어 있으면 휴대폰 푸시는 꺼지고, 앱은 예전처럼 15분마다 알림을 확인해요.
const String fbApiKey = String.fromEnvironment('FB_API_KEY', defaultValue: '');
const String fbAppId = String.fromEnvironment('FB_APP_ID', defaultValue: '');
const String fbSenderId = String.fromEnvironment('FB_SENDER_ID', defaultValue: '');
const String fbProjectId = String.fromEnvironment('FB_PROJECT_ID', defaultValue: '');

bool get firebaseConfigured => fbApiKey.isNotEmpty && fbAppId.isNotEmpty && fbSenderId.isNotEmpty && fbProjectId.isNotEmpty;
