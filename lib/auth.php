<?php
declare(strict_types=1);

/* 로그인 상태, CSRF, 사용자 정보 */

function uid(): ?int { return isset($_SESSION['uid']) ? (int)$_SESSION['uid'] : null; }
function me(): int {
    $id = uid();
    if (!$id) fail(401, '로그인이 필요해요');
    static $checked = false;
    if (!$checked) {
        $checked = true;
        if (!val('SELECT id FROM users WHERE id = ?', [$id])) { session_destroy(); fail(401, '로그인이 필요해요'); }
        q('UPDATE users SET last_seen = NOW() WHERE id = ? AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL 30 SECOND)', [$id]);
    }
    return $id;
}
function login_as(int $id): void {
    session_regenerate_id(true);
    $_SESSION['uid'] = $id;
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    q('UPDATE users SET last_seen = NOW() WHERE id = ?', [$id]);
}
function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}
function check_csrf(): void {
    $sent = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (empty($_SESSION['csrf'])) {
        // 세션이 비어 있음 = 브라우저가 로그인 쿠키를 저장하지 못했거나 서버가 세션을 못 씀
        fail(403, '보안 확인에 실패했어요. 로그인 정보를 저장하지 못했어요. https:// 주소로 열었는지 확인하고, 계속되면 check.php 로 점검해 주세요', ['code' => 'csrf', 'reason' => 'no-session']);
    }
    if ($sent === '' || !hash_equals($_SESSION['csrf'], $sent)) {
        fail(403, '보안 확인에 실패했어요. 페이지를 새로고침해 주세요', ['code' => 'csrf']);
    }
}

function new_invite_code(): string {
    $alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for ($try = 0; $try < 20; $try++) {
        $c = '';
        for ($i = 0; $i < 8; $i++) $c .= $alpha[random_int(0, strlen($alpha) - 1)];
        if (!val('SELECT id FROM users WHERE invite_code = ?', [$c])) return $c;
    }
    fail(500, '초대 코드를 만들지 못했어요. 다시 시도해 주세요');
}
const USER_COLORS = ['#3182f6', '#f2638a', '#20c997', '#ff9f43', '#845ef7', '#0ca5b0', '#e8590c', '#5c7cfa'];
function create_user(string $name, ?string $username = null, ?string $hash = null): int {
    $name = mb_substr(trim($name), 0, 20) ?: '친구';
    q('INSERT INTO users (username, password_hash, display_name, color, invite_code) VALUES (?, ?, ?, ?, ?)',
      [$username, $hash, $name, USER_COLORS[random_int(0, count(USER_COLORS) - 1)], new_invite_code()]);
    return (int)db()->lastInsertId();
}

function public_user(array $u): array {
    return ['id' => (int)$u['id'], 'name' => $u['display_name'], 'color' => $u['color']];
}
function users_by_ids(array $ids): array {
    $ids = array_values(array_unique(array_map('intval', array_filter($ids))));
    if (!$ids) return [];
    $out = [];
    foreach (rows('SELECT id, display_name, color FROM users WHERE id IN (' . in_list($ids) . ')', $ids) as $u) $out[(int)$u['id']] = public_user($u);
    return $out;
}
function providers_enabled(): array {
    return [
        'kakao'  => (string)cfg('kakao.rest_api_key', '') !== '',
        'google' => (string)cfg('google.client_id', '') !== '' && (string)cfg('google.client_secret', '') !== '',
    ];
}
