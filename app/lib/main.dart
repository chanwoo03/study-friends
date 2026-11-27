// 공부 친구 앱: 웹사이트(공부 친구)를 그대로 감싸서 보여 주는 앱이에요.
// - 주소는 빌드할 때 바꿀 수 있어요:  flutter build apk --dart-define=APP_URL=http://내도메인/study_friend/
// - 파일 고르기, 파일 내려받기(저장·공유 창), 뒤로 가기, 인터넷 끊김 화면, 휴대폰 알림을 처리해요.
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:workmanager/workmanager.dart';

import 'notifications.dart';

const String appUrl = String.fromEnvironment('APP_URL', defaultValue: 'http://chanwlab.com/study_friend/');

// 앱 안에서 열어도 되는 곳: 내 사이트 + 카카오 로그인 화면. 나머지 링크는 휴대폰 브라우저로 열어요.
// (구글은 앱 안 웹 화면에서 로그인을 막아 두었어요. 앱에서는 아이디/비밀번호나 카카오로 로그인하세요)
bool _staysInApp(Uri u) {
  final home = Uri.parse(appUrl);
  if (u.scheme == 'about' || u.scheme == 'data' || u.scheme == 'blob') return true;
  if (u.host == home.host) return true;
  return u.host == 'kakao.com' || u.host.endsWith('.kakao.com');
}

// 알림을 누르면 열 화면 (예: /messages/3)
final ValueNotifier<String?> pendingLink = ValueNotifier<String?>(null);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await initNotifications(onTap: (link) { if (link != null && link.isNotEmpty) pendingLink.value = link; });
    pendingLink.value = await launchLink();
    if (Platform.isAndroid) await Workmanager().initialize(callbackDispatcher);
  } catch (_) {}
  runApp(const StudyFriendsApp());
}

class StudyFriendsApp extends StatelessWidget {
  const StudyFriendsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '공부 친구',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF3182F6), useMaterial3: true),
      darkTheme: ThemeData(colorSchemeSeed: const Color(0xFF3182F6), brightness: Brightness.dark, useMaterial3: true),
      home: const WebShell(),
    );
  }
}

class WebShell extends StatefulWidget {
  const WebShell({super.key});

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  late final WebViewController _web;
  int _progress = 0;
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF2F4F6))
      ..addJavaScriptChannel('SFApp', onMessageReceived: (m) => _onWebMessage(m.message))
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => setState(() => _progress = p),
        onPageStarted: (_) => setState(() => _offline = false),
        onPageFinished: (_) => _afterPageLoad(),
        onWebResourceError: (e) {
          if (e.isForMainFrame ?? false) setState(() => _offline = true);
        },
        onNavigationRequest: (req) {
          final u = Uri.tryParse(req.url);
          if (u == null || _staysInApp(u)) return NavigationDecision.navigate;
          launchUrl(u, mode: LaunchMode.externalApplication);
          return NavigationDecision.prevent;
        },
      ));
    _web.getUserAgent().then((ua) => _web.setUserAgent('${ua ?? ''} StudyFriendsApp/1.0'));

    final android = _web.platform;
    if (android is AndroidWebViewController) {
      android.setOnShowFileSelector(_pickFiles);
      android.setMediaPlaybackRequiresUserGesture(false);
    }
    final first = pendingLink.value;
    pendingLink.value = null;
    _web.loadRequest(Uri.parse(first == null ? appUrl : '$appUrl#$first'));
    pendingLink.addListener(_openPending);
  }

  @override
  void dispose() {
    pendingLink.removeListener(_openPending);
    super.dispose();
  }

  // 알림을 눌렀을 때 그 화면으로
  void _openPending() {
    final link = pendingLink.value;
    if (link == null) return;
    pendingLink.value = null;
    _web.runJavaScript('location.hash = ${jsonEncode('#$link')};');
  }

  // 이 기기가 아직 알림 등록이 안 됐으면 웹에게 다시 등록해 달라고 해요
  Future<void> _afterPageLoad() async {
    if (await hasDevice()) return;
    await _web.runJavaScript("try { localStorage.removeItem('sf-device'); } catch (e) {} if (window.sfRegisterDevice) window.sfRegisterDevice();");
  }

  // 안드로이드: 웹의 <input type=file> 을 누르면 휴대폰 파일 고르기 창을 띄워요 (아이폰은 저절로 돼요)
  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    final onlyImages = params.acceptTypes.isNotEmpty && params.acceptTypes.every((t) => t.startsWith('image/'));
    final type = onlyImages ? FileType.image : FileType.any;
    final List<PlatformFile> files;
    if (params.mode == FileSelectorMode.openMultiple) {
      files = await FilePicker.pickFiles(type: type);
    } else {
      final one = await FilePicker.pickFile(type: type);
      files = one == null ? const [] : [one];
    }
    return [
      for (final f in files)
        if (f.path != null) Uri.file(f.path!).toString(),
    ];
  }

  // 웹 → 앱 메시지. 지금은 {type:'download', name, data(base64)} 하나예요.
  Future<void> _onWebMessage(String raw) async {
    try {
      final msg = jsonDecode(raw) as Map<String, dynamic>;
      switch (msg['type']) {
        case 'notify':
          await showNotif(id: (msg['id'] as num).toInt(), kind: '${msg['kind']}', title: '${msg['title']}', body: '${msg['body'] ?? ''}', link: '${msg['link'] ?? ''}');
          return;
        case 'device':
          // 내 사이트가 보낸 등록만 받아요 (앱 안에서 열린 다른 페이지가 알림 주소를 바꾸지 못하게)
          if (Uri.tryParse('${msg['api']}')?.host != Uri.parse(appUrl).host) return;
          await saveDevice('${msg['token']}', '${msg['api']}', (msg['lastId'] as num? ?? 0).toInt());
          return;
        case 'logout':
          await clearDevice();
          return;
      }
      if (msg['type'] != 'download') return;
      final name = _safeName((msg['name'] as String?) ?? 'file');
      final bytes = base64Decode((msg['data'] as String?) ?? '');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$name');
      await file.writeAsBytes(bytes, flush: true);
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], fileNameOverrides: [name]));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('파일을 저장하지 못했어요')));
    }
  }

  String _safeName(String n) {
    final s = n.replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '_').trim();
    return s.isEmpty ? 'file' : (s.length > 120 ? s.substring(s.length - 120) : s);
  }

  Future<void> _retry() async {
    setState(() => _offline = false);
    await _web.reload();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _web.canGoBack()) {
          await _web.goBack();
        } else {
          await SystemNavigator.pop();
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(children: [
            WebViewWidget(controller: _web),
            if (_progress < 100) LinearProgressIndicator(value: _progress / 100, minHeight: 2),
            if (_offline) _OfflineView(onRetry: _retry),
          ]),
        ),
      ),
    );
  }
}

class _OfflineView extends StatelessWidget {
  const _OfflineView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return ColoredBox(
      color: cs.surface,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.wifi_off_rounded, size: 56, color: cs.primary),
            const SizedBox(height: 16),
            const Text('연결할 수 없어요', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('인터넷 연결을 확인하고 다시 시도해 주세요.', textAlign: TextAlign.center, style: TextStyle(color: cs.onSurfaceVariant)),
            const SizedBox(height: 24),
            FilledButton(onPressed: onRetry, child: const Text('다시 시도')),
          ]),
        ),
      ),
    );
  }
}
