<?php
declare(strict_types=1);
/* 카카오·구글 로그인 공통 흐름
   1) oauth/kakao.php?start=login  → 카카오 로그인 화면으로 보냄
   2) 카카오가 oauth/kakao.php?code=...&state=... 로 돌려보냄 → 계정 찾기/만들기 → 앱으로 이동 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';

function oauth_back(string $hash) {
    header('Location: ' . base_path() . '#' . $hash);
    exit;
}
function oauth_fail(string $msg) {
    oauth_back('/login?err=' . rawurlencode($msg));
}
function http_post_form(string $url, array $fields, array $headers = []): array {
    return http_call($url, 'POST', http_build_query($fields), array_merge(['Content-Type: application/x-www-form-urlencoded;charset=utf-8'], $headers));
}
function http_get_json(string $url, array $headers): array { return http_call($url, 'GET', null, $headers); }
function http_call(string $url, string $method, ?string $payload, array $headers): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_CUSTOMREQUEST  => $method,
    ]);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = is_string($res) ? json_decode($res, true) : null;
    if ($code < 200 || $code >= 300 || !is_array($json)) {
        error_log('[study-friends] oauth http ' . $code . ' ' . $url . ' ' . (is_string($res) ? substr($res, 0, 300) : ''));
        oauth_fail('로그인 서버와 통신하지 못했어요. 설정(키·Redirect URI)을 확인해 주세요');
    }
    return $json;
}

/* $p: ['name' => 'kakao', 'authorize' => fn(state, redirect) => url, 'profile' => fn(code, redirect) => ['uid' => .., 'name' => ..]] */
function oauth_run(array $p) {
    $name = $p['name'];
    if (!providers_enabled()[$name]) oauth_fail('이 로그인 방법은 아직 설정되지 않았어요');
    $redirect = app_url() . '/oauth/' . $name . '.php';

    if (isset($_GET['start'])) {
        $mode = $_GET['start'] === 'link' ? 'link' : 'login';
        if ($mode === 'link' && !uid()) oauth_fail('먼저 로그인해 주세요');
        $state = bin2hex(random_bytes(16));
        $_SESSION['oauth'] = ['state' => $state, 'provider' => $name, 'mode' => $mode, 'at' => time()];
        header('Location: ' . $p['authorize']($state, $redirect));
        exit;
    }

    $saved = $_SESSION['oauth'] ?? null;
    unset($_SESSION['oauth']);
    if (isset($_GET['error'])) oauth_back(uid() ? '/settings' : '/login');   // 사용자가 취소
    if (!$saved || $saved['provider'] !== $name || !hash_equals($saved['state'], (string)($_GET['state'] ?? '')) || time() - $saved['at'] > 600) {
        oauth_fail('로그인 확인 시간이 지났어요. 다시 시도해 주세요');
    }
    $code = (string)($_GET['code'] ?? '');
    if ($code === '') oauth_fail('로그인에 실패했어요');
    $prof = $p['profile']($code, $redirect);
    $puid = (string)$prof['uid'];
    if ($puid === '') oauth_fail('계정 정보를 받지 못했어요');

    $linkedUser = val('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_uid = ?', [$name, $puid]);

    if ($saved['mode'] === 'link') {
        $me = uid();
        if (!$me) oauth_fail('먼저 로그인해 주세요');
        if ($linkedUser && (int)$linkedUser !== $me) oauth_back('/settings?err=' . rawurlencode('이 계정은 이미 다른 사용자에게 연결돼 있어요'));
        if (!$linkedUser) {
            q('DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?', [$me, $name]);
            q('INSERT INTO oauth_accounts (user_id, provider, provider_uid) VALUES (?, ?, ?)', [$me, $name, $puid]);
        }
        oauth_back('/settings?ok=linked');
    }

    if ($linkedUser) {
        login_as((int)$linkedUser);
        oauth_back('/calendar');
    }
    if (!cfg('allow_register', true)) oauth_fail('지금은 새로 가입할 수 없어요');
    $id = create_user((string)($prof['name'] ?? '') ?: '친구');
    q('INSERT INTO oauth_accounts (user_id, provider, provider_uid) VALUES (?, ?, ?)', [$id, $name, $puid]);
    login_as($id);
    oauth_back('/friends?welcome=1');
}
