// 휴대폰 푸시 (Firebase 클라우드 메시징)
// 서버가 알림을 만들면 구글을 거쳐 몇 초 안에 휴대폰에 도착해요. 앱이 꺼져 있어도요.
// 서버는 '데이터 메시지'로 보내고, 앱이 받아서 직접 알림을 띄워요 → 같은 알림 번호는 한 번만 보여요.
import 'dart:convert';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;

import 'firebase_config.dart';
import 'notifications.dart';

Future<bool> initFirebase() async {
  if (!firebaseConfigured || !Platform.isAndroid) return false;
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(
      options: const FirebaseOptions(apiKey: fbApiKey, appId: fbAppId, messagingSenderId: fbSenderId, projectId: fbProjectId),
    );
  }
  return true;
}

Future<void> _showFromData(Map<String, dynamic> d) async {
  final id = int.tryParse('${d['id'] ?? ''}') ?? 0;
  if (id <= 0) return;
  await showNotif(id: id, kind: '${d['kind'] ?? ''}', title: '${d['title'] ?? '캘버디'}', body: '${d['body'] ?? ''}', link: '${d['link'] ?? ''}');
}

/// 앱이 꺼져 있거나 뒤에 있을 때 푸시가 오면 안드로이드가 부르는 곳
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage m) async {
  try {
    if (!await initFirebase()) return;
    await initNotifications();
    await _showFromData(m.data);
  } catch (_) {}
}

/// 앱 시작할 때 한 번
Future<void> setupPush() async {
  if (!await initFirebase()) return;
  FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
  FirebaseMessaging.onMessage.listen((m) => _showFromData(m.data));
  // 검증된 '등록 토큰' 방식을 써요 (새 방식은 서버 전송 쪽 지원이 확실해지면 바꿀게요)
  // ignore: deprecated_member_use
  FirebaseMessaging.instance.onTokenRefresh.listen((t) => syncFcmToken(t));
  await syncFcmToken();
}

/// 이 휴대폰의 푸시 주소를 서버에 알려요 (기기 등록이 된 뒤에만)
Future<void> syncFcmToken([String? fresh]) async {
  try {
    if (!await initFirebase()) return;
    final device = await deviceInfo();
    if (device == null) return;
    // ignore: deprecated_member_use
    final fcm = fresh ?? await FirebaseMessaging.instance.getToken();
    if (fcm == null || fcm.isEmpty) return;
    await http
        .post(Uri.parse(device.api).replace(queryParameters: {'a': 'notif.fcm'}),
            headers: {'Content-Type': 'application/json'}, body: jsonEncode({'token': device.token, 'fcm': fcm}))
        .timeout(const Duration(seconds: 20));
  } catch (_) {}
}
