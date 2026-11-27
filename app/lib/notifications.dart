// 휴대폰 알림
// - 앱이 켜져 있을 때: 웹 화면이 새 알림을 SFApp 으로 넘겨주면 바로 띄워요.
// - 앱이 꺼져 있을 때(안드로이드): 15분마다 서버(notif.pull)에 새 알림이 있는지 물어봐요.
//   같은 알림을 두 번 띄우지 않게 마지막으로 띄운 알림 번호를 기억해요.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' show Color;

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

const _kToken = 'notif_token', _kApi = 'notif_api', _kLast = 'notif_last';
const pullTask = 'sf-notif-pull';

final FlutterLocalNotificationsPlugin notifPlugin = FlutterLocalNotificationsPlugin();
final SharedPreferencesAsync _prefs = SharedPreferencesAsync();

// 종류별 알림 채널 (휴대폰 설정에서 종류별로 끌 수도 있어요)
const Map<String, (String, String)> _channels = {
  'message': ('sf_message', '메시지'),
  'event': ('sf_event', '친구 일정'),
  'plan': ('sf_plan', '공동 계획'),
  'share': ('sf_share', '같이 쓰는 메모·그림판'),
  'board': ('sf_board', '보드 댓글·공지'),
};

Future<void> initNotifications({void Function(String? link)? onTap}) async {
  await notifPlugin.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('ic_notif'),
      iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
    ),
    onDidReceiveNotificationResponse: (r) => onTap?.call(r.payload),
  );
}

/// 앱을 알림으로 열었으면 그 알림의 화면 주소
Future<String?> launchLink() async {
  final d = await notifPlugin.getNotificationAppLaunchDetails();
  return (d?.didNotificationLaunchApp ?? false) ? d?.notificationResponse?.payload : null;
}

Future<void> requestPermission() async {
  await notifPlugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission();
  await notifPlugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()?.requestPermissions(alert: true, badge: true, sound: true);
}

/// 처음 보는 알림이면 true (번호를 기억해 둬요)
Future<bool> _markShown(int id) async {
  final last = await _prefs.getInt(_kLast) ?? 0;
  if (id <= last) return false;
  await _prefs.setInt(_kLast, id);
  return true;
}

Future<void> showNotif({required int id, required String kind, required String title, String body = '', String link = ''}) async {
  if (!await _markShown(id)) return;
  final ch = _channels[kind] ?? ('sf_etc', '알림');
  // 같은 대화·같은 계획 알림은 새 것으로 바꿔 끼워요 (알림이 줄줄이 쌓이지 않게)
  final slot = (kind + link).hashCode & 0x7fffffff;
  await notifPlugin.show(
    id: slot,
    title: title,
    body: body,
    notificationDetails: NotificationDetails(
      android: AndroidNotificationDetails(ch.$1, ch.$2,
          importance: Importance.high, priority: Priority.high, color: const Color(0xFF3182F6), styleInformation: BigTextStyleInformation(body)),
      iOS: const DarwinNotificationDetails(),
    ),
    payload: link,
  );
}

/// 웹에서 받은 기기 열쇠 저장 + 15분마다 확인 시작
Future<void> saveDevice(String token, String api, int lastId) async {
  await _prefs.setString(_kToken, token);
  await _prefs.setString(_kApi, api);
  final last = await _prefs.getInt(_kLast) ?? 0;
  if (lastId > last) await _prefs.setInt(_kLast, lastId);   // 등록 전 알림은 다시 안 띄워요
  await requestPermission();
  if (Platform.isAndroid) {
    await Workmanager().registerPeriodicTask(pullTask, pullTask,
        frequency: const Duration(minutes: 15),
        constraints: Constraints(networkType: NetworkType.connected),
        existingWorkPolicy: ExistingPeriodicWorkPolicy.keep);
  }
}

Future<bool> hasDevice() async => (await _prefs.getString(_kToken)) != null;

Future<void> clearDevice() async {
  await _prefs.remove(_kToken);
  if (Platform.isAndroid) await Workmanager().cancelByUniqueName(pullTask);
}

/// 서버에 새 알림 물어보기 (백그라운드에서 불러요)
Future<void> pullNotifications() async {
  final token = await _prefs.getString(_kToken);
  final api = await _prefs.getString(_kApi);
  if (token == null || api == null) return;
  final last = await _prefs.getInt(_kLast) ?? 0;
  final uri = Uri.parse(api).replace(queryParameters: {'a': 'notif.pull', 'token': token, 'after': '$last'});
  final res = await http.get(uri).timeout(const Duration(seconds: 20));
  if (res.statusCode == 401) {   // 로그아웃했거나 기기 등록이 지워졌어요
    await clearDevice();
    return;
  }
  if (res.statusCode != 200) return;
  final data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  for (final n in (data['items'] as List? ?? const [])) {
    final m = n as Map<String, dynamic>;
    await showNotif(id: m['id'] as int, kind: '${m['kind']}', title: '${m['title']}', body: '${m['body'] ?? ''}', link: '${m['link'] ?? ''}');
  }
}

/// 앱이 꺼져 있을 때 안드로이드가 깨워서 부르는 곳
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, input) async {
    try {
      await initNotifications();
      await pullNotifications();
    } catch (_) {}
    return true;
  });
}
