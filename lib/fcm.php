<?php
declare(strict_types=1);
/* 휴대폰 푸시 (Firebase 클라우드 메시징, FCM)
   - 앱이 꺼져 있어도 카톡처럼 바로 알림이 가요.
   - 서버 열쇠(서비스 계정 키 JSON)는 웹에서 안 보이는 곳에 두고, 절대 GitHub 에 올리지 않아요.
     기본 위치: 웹 폴더(www) 바깥의 fcm-key.json  (config.php 의 'fcm_key' 로 바꿀 수 있어요)
   - 열쇠가 없으면 푸시만 꺼지고, 앱은 예전처럼 15분마다 확인해요. */

function fcm_key_path(): ?string {
    $cands = [];
    if ($p = (string)cfg('fcm_key', '')) $cands[] = $p;
    $cands[] = dirname(__DIR__, 3) . '/fcm-key.json';   // 예: /home/계정/fcm-key.json (www/study_friend 의 두 단계 위)
    foreach ($cands as $c) if (is_file($c) && is_readable($c)) return $c;
    return null;
}
function fcm_key(): ?array {
    static $k = false;
    if ($k !== false) return $k;
    $k = null;
    $p = fcm_key_path();
    if (!$p) return null;
    $j = json_decode((string)file_get_contents($p), true);
    if (is_array($j) && !empty($j['client_email']) && !empty($j['private_key']) && !empty($j['project_id'])) $k = $j;
    return $k;
}
function fcm_enabled(): bool { return fcm_key() !== null && function_exists('openssl_sign') && function_exists('curl_init'); }

function b64url(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }

/* 구글에서 1시간짜리 출입증(access token)을 받아 sessions 폴더에 잠깐 보관해요 */
function fcm_access_token(): ?string {
    $key = fcm_key();
    if (!$key) return null;
    $cache = (string)cfg('session_path', '') ?: dirname(__DIR__) . '/sessions';
    $cacheFile = rtrim($cache, '/') . '/.fcm_token.json';
    $c = @json_decode((string)@file_get_contents($cacheFile), true);
    if (is_array($c) && ($c['exp'] ?? 0) > time() + 60 && !empty($c['token'])) return (string)$c['token'];

    $now = time();
    $head = b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $claim = b64url(json_encode(['iss' => $key['client_email'], 'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
                                 'aud' => 'https://oauth2.googleapis.com/token', 'iat' => $now, 'exp' => $now + 3600]));
    $sig = '';
    if (!openssl_sign("$head.$claim", $sig, $key['private_key'], 'sha256WithRSAEncryption')) { error_log('[study-friends] fcm: sign failed'); return null; }
    $jwt = "$head.$claim." . b64url($sig);
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt])]);
    $res = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $j = is_string($res) ? json_decode($res, true) : null;
    if ($code !== 200 || empty($j['access_token'])) { error_log('[study-friends] fcm: token http ' . $code . ' ' . substr((string)$res, 0, 200)); return null; }
    @file_put_contents($cacheFile, json_encode(['token' => $j['access_token'], 'exp' => $now + (int)($j['expires_in'] ?? 3600)]), LOCK_EX);
    @chmod($cacheFile, 0600);
    return (string)$j['access_token'];
}

/* 보낼 푸시를 모아 두었다가, 응답을 먼저 보낸 뒤에 한꺼번에 보내요 (화면이 느려지지 않게) */
$GLOBALS['FCM_QUEUE'] = [];
function fcm_queue(int $userId, int $notifId, string $kind, string $title, string $body, string $link): void {
    if (!fcm_enabled()) return;
    if (!$GLOBALS['FCM_QUEUE']) register_shutdown_function('fcm_flush');
    $GLOBALS['FCM_QUEUE'][] = [$userId, $notifId, $kind, $title, $body, $link];
}
function fcm_flush(): void {
    $q = $GLOBALS['FCM_QUEUE']; $GLOBALS['FCM_QUEUE'] = [];
    if (!$q) return;
    if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
    try {
        $token = fcm_access_token();
        if (!$token) return;
        $project = fcm_key()['project_id'];
        foreach ($q as [$uid, $nid, $kind, $title, $body, $link]) {
            foreach (rows('SELECT id, fcm_token FROM notif_devices WHERE user_id = ? AND fcm_token IS NOT NULL', [$uid]) as $d) {
                fcm_send_one($token, $project, (int)$d['id'], (string)$d['fcm_token'], $nid, $kind, $title, $body, $link);
            }
        }
    } catch (Throwable $e) {
        error_log('[study-friends] fcm: ' . $e->getMessage());
    }
}
/* 데이터 메시지로 보내요: 앱이 받아서 직접 알림을 띄우고, 같은 알림을 두 번 띄우지 않게 번호로 걸러요 */
function fcm_send_one(string $token, string $project, int $deviceId, string $fcmToken, int $nid, string $kind, string $title, string $body, string $link): void {
    $msg = ['message' => [
        'token' => $fcmToken,
        'data' => ['id' => (string)$nid, 'kind' => $kind, 'title' => $title, 'body' => $body, 'link' => $link],
        'android' => ['priority' => 'HIGH', 'ttl' => '86400s', 'collapse_key' => substr($kind . $link, 0, 60)],
        'webpush' => ['headers' => ['Urgency' => 'high', 'TTL' => '86400']],   // 아이폰 홈 화면 웹앱·브라우저
    ]];
    $ch = curl_init("https://fcm.googleapis.com/v1/projects/{$project}/messages:send");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json; charset=utf-8'],
        CURLOPT_POSTFIELDS => json_encode($msg, JSON_UNESCAPED_UNICODE)]);
    $res = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($code === 404 || ($code === 400 && is_string($res) && strpos($res, 'INVALID_ARGUMENT') !== false && strpos($res, 'token') !== false)) {
        q('UPDATE notif_devices SET fcm_token = NULL WHERE id = ?', [$deviceId]);   // 앱을 지웠거나 토큰이 바뀌었어요
    } elseif ($code !== 200) {
        error_log('[study-friends] fcm: send http ' . $code . ' ' . substr((string)$res, 0, 200));
    }
}
