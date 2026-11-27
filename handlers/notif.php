<?php
declare(strict_types=1);
/* 알림 목록·읽음·설정, 그리고 휴대폰 앱이 백그라운드에서 알림을 가져가는 길 */

function notif_out(array $n, array $users): array {
    return ['id' => (int)$n['id'], 'kind' => $n['kind'], 'title' => $n['title'], 'body' => $n['body'], 'link' => $n['link'],
            'cnt' => (int)$n['cnt'], 'at' => $n['created_at'], 'read' => $n['read_at'] !== null,
            'actor' => $n['actor_id'] ? ($users[(int)$n['actor_id']] ?? null) : null];
}
/* 친구가 아닌 사람(예: 공동 계획만 같이 하는 사람)의 프로필은 안 보여요 */
function notif_actors(array $list, int $me): array {
    $fr = array_flip(friend_ids($me));
    $ids = array_values(array_unique(array_filter(array_map(fn($n) => (int)$n['actor_id'], $list), fn($i) => isset($fr[$i]))));
    return $ids ? users_by_ids($ids) : [];
}
function notif_unread(int $me): int {
    return (int)val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [$me]);
}

route('notif.list', 'GET', function (int $me) {
    $list = rows('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60', [$me]);
    $users = notif_actors($list, $me);
    return ['items' => array_map(fn($n) => notif_out($n, $users), $list), 'unread' => notif_unread($me),
            'kinds' => NOTIF_KINDS, 'off' => array_values(array_filter(explode(',', (string)val('SELECT notif_off FROM users WHERE id = ?', [$me]))))];
});

route('notif.read', 'POST', function (int $me) {
    if (arg('all', false)) q('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [$me]);
    else q('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND id = ? AND read_at IS NULL', [$me, int_arg('id')]);
    return ['unread' => notif_unread($me)];
});

route('notif.clear', 'POST', function (int $me) {
    q('DELETE FROM notifications WHERE user_id = ? AND read_at IS NOT NULL', [$me]);
    return ['unread' => notif_unread($me)];
});

/* 종류별로 끄기: off = ['board', ...] */
route('notif.prefs', 'POST', function (int $me) {
    $off = arg('off', []);
    if (!is_array($off)) fail(400, '설정이 잘못됐어요');
    $off = array_values(array_intersect(array_keys(NOTIF_KINDS), array_map('strval', $off)));
    q('UPDATE users SET notif_off = ? WHERE id = ?', [implode(',', $off), $me]);
    return ['off' => $off];
});

/* 휴대폰 앱 등록: 앱만 아는 열쇠를 하나 만들어요 (서버에는 해시만 저장) */
route('notif.device', 'POST', function (int $me) {
    $token = bin2hex(random_bytes(24));
    $hash = hash('sha256', $token);
    q('INSERT INTO notif_devices (user_id, token_hash, last_seen) VALUES (?, ?, NOW())', [$me, $hash]);
    $_SESSION['notif_device'] = $hash;   // 로그아웃하면 이 기기 알림도 멈춰요
    $ids = array_map('intval', array_column(rows('SELECT id FROM notif_devices WHERE user_id = ? ORDER BY id DESC', [$me]), 'id'));
    foreach (array_slice($ids, 5) as $old) q('DELETE FROM notif_devices WHERE id = ?', [$old]);   // 기기는 5대까지
    return ['token' => $token, 'lastId' => (int)val('SELECT COALESCE(MAX(id), 0) FROM notifications WHERE user_id = ?', [$me])];
});

/* 기기 열쇠로 기기 찾기 */
function device_by_token(): array {
    $token = (string)($_GET['token'] ?? arg('token', ''));
    if (!preg_match('/^[0-9a-f]{48}$/', $token)) fail(401, '기기 열쇠가 잘못됐어요');
    $d = row('SELECT * FROM notif_devices WHERE token_hash = ?', [hash('sha256', $token)]);
    if (!$d) fail(401, '등록되지 않은 기기예요');
    return $d;
}

/* 앱이 휴대폰 푸시 주소(FCM 토큰)를 알려 주는 곳 */
route('notif.fcm', 'POST', function (?int $unused) {
    $d = device_by_token();
    $fcm = (string)arg('fcm', '');
    if ($fcm !== '' && !preg_match('/^[A-Za-z0-9_:\-]{20,255}$/', $fcm)) fail(400, '푸시 주소가 잘못됐어요');
    if ($fcm !== '') q('UPDATE notif_devices SET fcm_token = NULL WHERE fcm_token = ? AND id <> ?', [$fcm, $d['id']]);   // 같은 휴대폰의 옛 등록 정리
    q('UPDATE notif_devices SET fcm_token = ?, last_seen = NOW() WHERE id = ?', [$fcm === '' ? null : $fcm, $d['id']]);
    return ['push' => fcm_enabled()];
}, true, true);

/* 앱이 꺼져 있을 때 15분마다 부르는 곳 (로그인 대신 기기 열쇠) */
route('notif.pull', 'GET', function (?int $unused) {
    $d = device_by_token();
    q('UPDATE notif_devices SET last_seen = NOW() WHERE id = ?', [$d['id']]);
    $after = max(0, (int)($_GET['after'] ?? 0));
    $list = rows('SELECT id, kind, title, body, link FROM notifications WHERE user_id = ? AND id > ? AND read_at IS NULL AND created_at > NOW() - INTERVAL 3 DAY ORDER BY id ASC LIMIT 20',
                 [(int)$d['user_id'], $after]);
    return ['items' => array_map(fn($n) => ['id' => (int)$n['id'], 'kind' => $n['kind'], 'title' => $n['title'], 'body' => $n['body'], 'link' => $n['link']], $list),
            'unread' => notif_unread((int)$d['user_id'])];
}, true);
