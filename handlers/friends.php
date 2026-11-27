<?php
declare(strict_types=1);
/* 친구: 초대 코드로 추가, 목록, 끊기 */

const STUDY_CAP = 16 * 3600; // 한 번에 최대 16시간까지만 인정

function close_stale_sessions(): void {
    q('UPDATE study_sessions SET ended_at = started_at + INTERVAL 16 HOUR, seconds = ? WHERE ended_at IS NULL AND started_at < NOW() - INTERVAL 16 HOUR', [STUDY_CAP]);
}
/* 오늘(시작 시각 기준) 공부한 초와 지금 공부 중인지 */
function study_today(array $ids): array {
    if (!$ids) return [];
    close_stale_sessions();
    $out = [];
    foreach ($ids as $i) $out[$i] = ['todaySeconds' => 0, 'studyingSince' => null];
    $r = rows('SELECT user_id, SUM(CASE WHEN ended_at IS NULL THEN LEAST(TIMESTAMPDIFF(SECOND, started_at, NOW()), ?) ELSE seconds END) s
               FROM study_sessions WHERE user_id IN (' . in_list($ids) . ') AND started_at >= CURDATE() GROUP BY user_id', array_merge([STUDY_CAP], $ids));
    foreach ($r as $x) $out[(int)$x['user_id']]['todaySeconds'] = (int)$x['s'];
    foreach (rows('SELECT user_id, started_at FROM study_sessions WHERE ended_at IS NULL AND user_id IN (' . in_list($ids) . ')', $ids) as $x) {
        $out[(int)$x['user_id']]['studyingSince'] = $x['started_at'];
    }
    return $out;
}

route('friends.list', 'GET', function (int $me) {
    $list = rows('SELECT u.id, u.display_name, u.color, u.avatar, u.last_seen, f.created_at AS since
                  FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.display_name', [$me]);
    $ids = array_map(fn($u) => (int)$u['id'], $list);
    $study = study_today($ids);
    $friends = array_map(fn($u) => public_user($u) + ['lastSeen' => $u['last_seen'], 'friendSince' => $u['since']] + $study[(int)$u['id']], $list);
    return ['friends' => $friends, 'inviteCode' => val('SELECT invite_code FROM users WHERE id = ?', [$me]), 'now' => now()];
});

route('friends.add', 'POST', function (int $me) {
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)arg('code', '')));
    if (strlen($code) !== 8) fail(400, '초대 코드는 8자리예요');
    // 코드 맞히기 시도 막기
    $tries = (int)val("SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND username = '#invite' AND created_at > NOW() - INTERVAL 15 MINUTE", [client_ip()]);
    if ($tries >= 20) fail(429, '시도가 너무 많아요. 잠시 후 다시 해 주세요');
    $u = row('SELECT id, display_name, color, avatar FROM users WHERE invite_code = ?', [$code]);
    if (!$u) {
        q("INSERT INTO login_attempts (ip, username) VALUES (?, '#invite')", [client_ip()]);
        fail(404, '이 코드를 가진 사람이 없어요. 코드를 다시 확인해 주세요');
    }
    $fid = (int)$u['id'];
    if ($fid === $me) fail(400, '내 초대 코드예요. 친구의 코드를 넣어 주세요');
    if (is_friend($me, $fid)) return ['friend' => public_user($u), 'already' => true];
    if (count(friend_ids($me)) >= 200) fail(400, '친구는 200명까지 추가할 수 있어요');
    q('INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)', [$me, $fid, $fid, $me]);
    return ['friend' => public_user($u), 'already' => false];
});

route('friends.remove', 'POST', function (int $me) {
    $fid = int_arg('id');
    db()->beginTransaction();
    q('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [$me, $fid, $fid, $me]);
    // 서로에게 골라서 공유했던 것도 정리
    foreach (KIND_TABLE as $kind => $t) {
        q("DELETE s FROM shares s JOIN {$t} x ON x.id = s.item_id WHERE s.kind = ? AND ((x.owner_id = ? AND s.user_id = ?) OR (x.owner_id = ? AND s.user_id = ?))",
          [$kind, $me, $fid, $fid, $me]);
    }
    db()->commit();
    return [];
});

route('friends.regen', 'POST', function (int $me) {
    $c = new_invite_code();
    q('UPDATE users SET invite_code = ? WHERE id = ?', [$c, $me]);
    return ['inviteCode' => $c];
});

/* 배지용 가벼운 확인: 안 읽은 메시지 수 */
route('sync', 'GET', function (int $me) {
    return [
        'unread' => (int)val('SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND read_at IS NULL', [$me]),
        'notifUnread' => notif_unread($me),
        // after 보다 새 알림 (화면이 작은 알림창·앱 알림으로 보여 줘요)
        'notifs' => isset($_GET['after']) ? array_map(fn($n) => ['id' => (int)$n['id'], 'kind' => $n['kind'], 'title' => $n['title'], 'body' => $n['body'], 'link' => $n['link']],
            rows('SELECT id, kind, title, body, link FROM notifications WHERE user_id = ? AND id > ? AND read_at IS NULL ORDER BY id ASC LIMIT 10', [$me, max(0, (int)$_GET['after'])])) : [],
        'notifLast' => (int)val('SELECT COALESCE(MAX(id), 0) FROM notifications WHERE user_id = ?', [$me]),
        'now'    => now(),
        'today'  => date('Y-m-d'),
    ];
});
