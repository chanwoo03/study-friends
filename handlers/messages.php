<?php
declare(strict_types=1);
/* 친구와 1:1 메시지 */

function msg_out(array $m, int $me): array {
    return ['id' => (int)$m['id'], 'from' => (int)$m['sender_id'], 'mine' => (int)$m['sender_id'] === $me,
            'body' => $m['body'], 'at' => $m['created_at'], 'read' => $m['read_at'] !== null];
}
function require_friend(int $me, int $fid): void {
    if (!is_friend($me, $fid)) fail(403, '친구에게만 메시지를 보낼 수 있어요');
}

route('messages.threads', 'GET', function (int $me) {
    $rows = rows('SELECT u.id, u.display_name, u.color, u.last_seen,
        (SELECT MAX(m.id) FROM messages m WHERE (m.sender_id = ? AND m.receiver_id = u.id) OR (m.sender_id = u.id AND m.receiver_id = ?)) AS last_id,
        (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.receiver_id = ? AND m.read_at IS NULL) AS unread
        FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?', [$me, $me, $me, $me]);
    $lastIds = array_values(array_filter(array_map(fn($r) => (int)$r['last_id'], $rows)));
    $last = [];
    if ($lastIds) foreach (rows('SELECT * FROM messages WHERE id IN (' . in_list($lastIds) . ')', $lastIds) as $m) $last[(int)$m['id']] = $m;
    $threads = array_map(fn($r) => [
        'friend' => public_user($r) + ['lastSeen' => $r['last_seen']],
        'unread' => (int)$r['unread'],
        'last'   => $r['last_id'] && isset($last[(int)$r['last_id']]) ? msg_out($last[(int)$r['last_id']], $me) : null,
    ], $rows);
    usort($threads, fn($a, $b) => (($b['last']['id'] ?? 0) <=> ($a['last']['id'] ?? 0)) ?: strcmp($a['friend']['name'], $b['friend']['name']));
    return ['threads' => $threads];
});

/* after: 그 뒤 새 메시지 / before: 그 앞 예전 메시지 / 둘 다 없으면 최근 50개 */
route('messages.list', 'GET', function (int $me) {
    $fid = int_arg('with');
    require_friend($me, $fid);
    $after = int_arg('after', false);
    $before = int_arg('before', false);
    $pair = '((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))';
    $pp = [$me, $fid, $fid, $me];
    if ($after) {
        $list = rows("SELECT * FROM messages WHERE {$pair} AND id > ? ORDER BY id LIMIT 200", array_merge($pp, [$after]));
    } else {
        $sql = "SELECT * FROM messages WHERE {$pair}" . ($before ? ' AND id < ?' : '') . ' ORDER BY id DESC LIMIT 50';
        $list = array_reverse(rows($sql, $before ? array_merge($pp, [$before]) : $pp));
    }
    q('UPDATE messages SET read_at = NOW() WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL', [$fid, $me]);
    // 상대가 내 메시지를 어디까지 읽었는지
    $readUpTo = (int)val('SELECT COALESCE(MAX(id), 0) FROM messages WHERE sender_id = ? AND receiver_id = ? AND read_at IS NOT NULL', [$me, $fid]);
    return ['messages' => array_map(fn($m) => msg_out($m, $me), $list), 'readUpTo' => $readUpTo,
            'hasMore' => !$after && count($list) === 50];
});

route('messages.send', 'POST', function (int $me) {
    $fid = int_arg('to');
    require_friend($me, $fid);
    $body = str_arg('body', 2000, true, '메시지');
    $recent = (int)val('SELECT COUNT(*) FROM messages WHERE sender_id = ? AND created_at > NOW() - INTERVAL 1 MINUTE', [$me]);
    if ($recent >= 60) fail(429, '메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요');
    q('INSERT INTO messages (sender_id, receiver_id, body) VALUES (?, ?, ?)', [$me, $fid, $body]);
    return ['message' => msg_out(row('SELECT * FROM messages WHERE id = ?', [(int)db()->lastInsertId()]), $me)];
});
