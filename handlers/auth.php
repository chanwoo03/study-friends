<?php
declare(strict_types=1);
/* 가입, 로그인, 내 정보 */

function me_payload(int $id): array {
    $u = row('SELECT * FROM users WHERE id = ?', [$id]);
    $linked = array_column(rows('SELECT provider FROM oauth_accounts WHERE user_id = ?', [$id]), 'provider');
    return public_user($u) + [
        'username'    => $u['username'],
        'hasPassword' => $u['password_hash'] !== null,
        'inviteCode'  => $u['invite_code'],
        'linked'      => $linked,
    ];
}

route('config', 'GET', function (?int $me) {
    return [
        'csrf'          => csrf_token(),
        'providers'     => providers_enabled(),
        'allowRegister' => (bool)cfg('allow_register', true),
        'me'            => $me && val('SELECT id FROM users WHERE id = ?', [$me]) ? me_payload($me) : null,
        'today'         => date('Y-m-d'),
        'now'           => date('Y-m-d H:i:s'),
        'webPush'       => web_push_config(),
    ];
}, true);

/* 아이폰·컴퓨터 브라우저 푸시용 Firebase 웹 설정 (config.php 의 firebase_web). https 이고 서버 열쇠가 있을 때만 켜요 */
function web_push_config(): ?array {
    $w = cfg('firebase_web', null);
    if (!is_array($w) || empty($w['apiKey']) || empty($w['appId']) || empty($w['projectId']) || empty($w['messagingSenderId']) || empty($w['vapidKey'])) return null;
    if (!is_https() || !function_exists('fcm_enabled') || !fcm_enabled()) return null;
    return ['apiKey' => (string)$w['apiKey'], 'appId' => (string)$w['appId'], 'projectId' => (string)$w['projectId'],
            'messagingSenderId' => (string)$w['messagingSenderId'], 'vapidKey' => (string)$w['vapidKey']];
}

function check_rate_limit(string $username): void {
    $ip = client_ip();
    q('DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL 1 DAY');
    $byIp   = (int)val('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND created_at > NOW() - INTERVAL 15 MINUTE', [$ip]);
    $byUser = (int)val('SELECT COUNT(*) FROM login_attempts WHERE username = ? AND created_at > NOW() - INTERVAL 15 MINUTE', [$username]);
    if ($byIp >= 30 || $byUser >= 8) fail(429, '시도가 너무 많아요. 15분 뒤에 다시 해 주세요');
}
function username_arg(): string {
    $u = strtolower(str_arg('username', 20, true, '아이디'));
    if (!preg_match('/^[a-z0-9_]{4,20}$/', $u)) fail(400, '아이디는 영문 소문자·숫자·_ 로 4~20자예요');
    return $u;
}
function password_arg(string $k = 'password'): string {
    $p = arg($k, '');
    if (!is_string($p) || strlen($p) < 8) fail(400, '비밀번호는 8자 이상이어야 해요');
    if (strlen($p) > 200) fail(400, '비밀번호가 너무 길어요');
    return $p;
}

route('auth.register', 'POST', function (?int $me) {
    if (!cfg('allow_register', true)) fail(403, '지금은 새로 가입할 수 없어요');
    $username = username_arg();
    $password = password_arg();
    $name = str_arg('name', 20, true, '이름');
    check_rate_limit($username);
    q('INSERT INTO login_attempts (ip, username) VALUES (?, ?)', [client_ip(), '#register']);
    if ((int)val("SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND username = '#register' AND created_at > NOW() - INTERVAL 1 HOUR", [client_ip()]) > 10) {
        fail(429, '가입 시도가 너무 많아요. 잠시 후 다시 해 주세요');
    }
    if (val('SELECT id FROM users WHERE username = ?', [$username])) fail(409, '이미 쓰고 있는 아이디예요');
    $id = create_user($name, $username, password_hash($password, PASSWORD_DEFAULT));
    login_as($id);
    return ['me' => me_payload($id), 'csrf' => csrf_token()];
}, true);

route('auth.login', 'POST', function (?int $me) {
    $username = strtolower(str_arg('username', 20, true, '아이디'));
    $password = (string)arg('password', '');
    check_rate_limit($username);
    $u = row('SELECT id, password_hash FROM users WHERE username = ?', [$username]);
    if (!$u || !$u['password_hash'] || !password_verify($password, $u['password_hash'])) {
        q('INSERT INTO login_attempts (ip, username) VALUES (?, ?)', [client_ip(), $username]);
        fail(401, '아이디나 비밀번호가 맞지 않아요');
    }
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }
    q('DELETE FROM login_attempts WHERE username = ?', [$username]);
    login_as((int)$u['id']);
    return ['me' => me_payload((int)$u['id']), 'csrf' => csrf_token()];
}, true);

route('auth.logout', 'POST', function (?int $me) {
    foreach (['notif_device', 'web_device'] as $k) {   // 이 기기(앱·브라우저) 알림 멈추기
        if (!empty($_SESSION[$k])) q('DELETE FROM notif_devices WHERE token_hash = ?', [(string)$_SESSION[$k]]);
    }
    $_SESSION = [];
    session_regenerate_id(true);
    return ['csrf' => csrf_token()];
}, true);

route('me.get', 'GET', fn(int $me) => ['me' => me_payload($me)]);

route('me.update', 'POST', function (int $me) {
    $name = str_arg('name', 20, true, '이름');
    $color = color_arg('color', (string)val('SELECT color FROM users WHERE id = ?', [$me]));
    q('UPDATE users SET display_name = ?, color = ? WHERE id = ?', [$name, $color, $me]);
    return ['me' => me_payload($me)];
});

/* 비밀번호 바꾸기. 소셜로만 가입한 사람은 여기서 아이디·비밀번호를 새로 만들 수 있어요 */
route('me.password', 'POST', function (int $me) {
    $u = row('SELECT username, password_hash FROM users WHERE id = ?', [$me]);
    if ($u['password_hash']) {
        if (!password_verify((string)arg('current', ''), $u['password_hash'])) fail(400, '지금 비밀번호가 맞지 않아요');
    }
    $new = password_arg('password');
    if (!$u['username']) {
        $username = username_arg();
        if (val('SELECT id FROM users WHERE username = ?', [$username])) fail(409, '이미 쓰고 있는 아이디예요');
        q('UPDATE users SET username = ? WHERE id = ?', [$username, $me]);
    }
    q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $me]);
    return ['me' => me_payload($me)];
});

route('me.unlink', 'POST', function (int $me) {
    $p = (string)arg('provider', '');
    $u = row('SELECT password_hash FROM users WHERE id = ?', [$me]);
    $count = (int)val('SELECT COUNT(*) FROM oauth_accounts WHERE user_id = ?', [$me]);
    if (!$u['password_hash'] && $count <= 1) fail(400, '로그인할 방법이 하나는 남아 있어야 해요. 먼저 아이디·비밀번호를 만들어 주세요');
    q('DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?', [$me, $p]);
    return ['me' => me_payload($me)];
});

route('me.delete', 'POST', function (int $me) {
    if ((string)arg('confirm', '') !== '탈퇴') fail(400, '확인 칸에 ‘탈퇴’라고 적어 주세요');
    // 로그인 상태를 누가 훔쳐도 계정을 지울 수 없게, 비밀번호가 있는 계정은 한 번 더 확인해요
    $hash = val('SELECT password_hash FROM users WHERE id = ?', [$me]);
    if ($hash && !password_verify((string)arg('password', ''), (string)$hash)) fail(400, '비밀번호가 맞지 않아요');
    $av = val('SELECT avatar FROM users WHERE id = ?', [$me]);
    if (function_exists('journal_delete_user_files')) journal_delete_user_files($me);
    if (function_exists('planner_delete_user_files')) planner_delete_user_files($me);
    if (function_exists('proof_delete_user_files')) proof_delete_user_files($me);
    if (function_exists('msg_delete_user_files')) msg_delete_user_files($me);
    q('DELETE FROM users WHERE id = ?', [$me]);
    if (function_exists('remove_avatar_file')) remove_avatar_file($av);
    $_SESSION = [];
    session_regenerate_id(true);
    return ['csrf' => csrf_token()];
});

/* ===== 프로필 사진 =====
   화면(브라우저)에서 256px 정사각형으로 줄인 뒤 data URL 로 보내요. 서버는 진짜 그림인지 확인하고 uploads/avatars 에 저장해요 */
function avatar_dir(): string { return dirname(__DIR__) . '/uploads/avatars'; }
function remove_avatar_file(?string $rel): void {
    if (!$rel || !preg_match('#^uploads/avatars/[A-Za-z0-9_]+\.(jpg|png|webp)$#', $rel)) return;
    $f = dirname(__DIR__) . '/' . $rel;
    if (is_file($f)) @unlink($f);
}
route('me.avatar', 'POST', function (int $me) {
    $data = (string)arg('image', '');
    if (!preg_match('#^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$#', $data, $m)) fail(400, '사진 형식이 잘못됐어요 (JPG·PNG·WEBP)');
    $bin = base64_decode($m[2], true);
    if ($bin === false || strlen($bin) > 400 * 1024) fail(400, '사진이 너무 커요');
    $info = @getimagesizefromstring($bin);
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$info['mime'] ?? ''] ?? null;
    if (!$info || !$ext || $info[0] < 16 || $info[1] < 16 || $info[0] > 1024 || $info[1] > 1024) fail(400, '사진을 읽지 못했어요. 다른 사진으로 해 주세요');
    $dir = avatar_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail(500, '사진을 저장할 폴더를 만들지 못했어요 (uploads 폴더 권한 확인)');
    $name = $me . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
    if (@file_put_contents($dir . '/' . $name, $bin) === false) fail(500, '사진을 저장하지 못했어요 (uploads 폴더 권한 확인)');
    $old = val('SELECT avatar FROM users WHERE id = ?', [$me]);
    q('UPDATE users SET avatar = ? WHERE id = ?', ['uploads/avatars/' . $name, $me]);
    remove_avatar_file($old);
    return ['me' => me_payload($me)];
});
route('me.avatar_remove', 'POST', function (int $me) {
    remove_avatar_file(val('SELECT avatar FROM users WHERE id = ?', [$me]));
    q('UPDATE users SET avatar = NULL WHERE id = ?', [$me]);
    return ['me' => me_payload($me)];
});
