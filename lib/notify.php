<?php
declare(strict_types=1);
/* 알림
   - 받는 사람마다 한 줄씩 notifications 에 쌓고, 화면(종 아이콘)과 앱(휴대폰 알림)이 가져가요.
   - 같은 대상(ref_key)의 안 읽은 알림이 있으면 새로 쌓지 않고 하나로 합쳐요 (예: "민지님의 메시지 3개").
   - 같이 고치는 메모·그림판·공동 계획은, 방금(3분 안에) 알림을 읽었거나 그 화면을 보고 있으면 또 보내지 않아요. 같이 작업하는 중이니까요.
   - 친구가 아닌 사람의 이름은 보여 주지 않아요 ('다른 사람'). */

const NOTIF_KINDS = [
    'message' => '메시지',
    'event'   => '친구 일정',
    'plan'    => '공동 계획',
    'share'   => '같이 쓰는 메모·그림판',
    'board'   => '보드 댓글·공지',
    'grape'   => '포도알',
];

/* $to: 받을 사람들, $make(이름, 합친 개수) => [제목, 내용]
   $opt: quiet(3분 안에 읽었거나 보고 있으면 건너뛰기), names(친구가 아니어도 이름 보이기: 공동 계획 참여자끼리) */
function notify(array $to, int $actor, string $kind, string $ref, callable $make, string $link, array $opt = []): void {
    $to = array_values(array_unique(array_filter(array_map('intval', $to), fn($u) => $u > 0 && $u !== $actor)));
    if (!$to || !isset(NOTIF_KINDS[$kind])) return;
    try {
        $offs = [];
        foreach (rows('SELECT id, notif_off FROM users WHERE id IN (' . in_list($to) . ')', $to) as $r) $offs[(int)$r['id']] = array_filter(explode(',', (string)$r['notif_off']));
        $actorName = (string)val('SELECT display_name FROM users WHERE id = ?', [$actor]);
        $friends = array_flip(friend_ids($actor));
        foreach ($to as $u) {
            if (!isset($offs[$u]) || in_array($kind, $offs[$u], true)) continue;   // 없는 사람이거나 이 종류를 껐어요
            $last = row('SELECT id, cnt, read_at, GREATEST(created_at, COALESCE(read_at, created_at)) > NOW() - INTERVAL 3 MINUTE AS recent FROM notifications WHERE user_id = ? AND ref_key = ? ORDER BY id DESC LIMIT 1', [$u, $ref]);
            $cnt = 1;
            if ($last && $last['read_at'] === null) {
                $cnt = (int)$last['cnt'] + 1;
                q('DELETE FROM notifications WHERE id = ?', [$last['id']]);   // 지우고 새로 넣어야 앱이 새 알림으로 알아요
            } elseif ($last && !empty($opt['quiet']) && (int)$last['recent'] === 1) {
                continue;
            }
            $name = (!empty($opt['names']) || isset($friends[$u])) ? $actorName : '다른 사람';
            [$title, $body] = $make($name, $cnt);
            q('INSERT INTO notifications (user_id, actor_id, kind, title, body, link, ref_key, cnt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [$u, $actor, $kind, mb_substr($title, 0, 120), mb_substr($body, 0, 300), mb_substr($link, 0, 120), mb_substr($ref, 0, 60), $cnt]);
            if (function_exists('fcm_queue')) fcm_queue($u, (int)db()->lastInsertId(), $kind, mb_substr($title, 0, 120), mb_substr($body, 0, 300), mb_substr($link, 0, 120));
        }
        if (random_int(1, 50) === 1) q('DELETE FROM notifications WHERE created_at < NOW() - INTERVAL 30 DAY');
    } catch (Throwable $e) {
        error_log('[study-friends] notify: ' . $e->getMessage());   // 알림이 실패해도 원래 일은 끝나야 해요
    }
}
/* 그 화면을 보고 있으면 읽음으로. 계속 보고 있는 동안(1분마다) 읽은 시각을 새로 해서, 같이 작업하는 중엔 알림이 또 안 가요 */
function notif_read_ref(int $me, string $ref): void {
    q('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND ref_key = ? AND (read_at IS NULL OR (read_at < NOW() - INTERVAL 1 MINUTE AND created_at > NOW() - INTERVAL 1 DAY))', [$me, $ref]);
}

/* 공개 범위로 보는 사람들 (만든 사람 포함) */
function audience_of(string $kind, array $item): array {
    $owner = (int)$item['owner_id'];
    if ($kind === 'plan' && ($item['kind'] ?? '') === 'group') return array_merge([$owner], plan_member_ids((int)$item['id']));
    $v = $item['visibility'] ?? 'private';
    if ($v === 'friends') return array_merge([$owner], friend_ids($owner));
    if ($v === 'selected') return array_merge([$owner], array_values(array_intersect(shares_of($kind, (int)$item['id']), friend_ids($owner))));
    return [$owner];
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
function ko_date(string $ymd): string {
    $t = strtotime($ymd);
    return date('n', $t) . '월 ' . date('j', $t) . '일(' . WEEKDAYS_KO[(int)date('w', $t)] . ')';
}
function one_line(string $s, int $max = 80): string {
    $s = trim(preg_replace('/\s+/u', ' ', $s));
    return mb_strlen($s) > $max ? mb_substr($s, 0, $max - 1) . '…' : $s;
}

/* ===== 기능별 알림 ===== */

function notify_event(array $e, int $me, bool $isNew): void {
    if (($e['visibility'] ?? 'private') === 'private') return;
    $when = ko_date($e['start_date']) . ($e['end_date'] && $e['end_date'] !== $e['start_date'] ? ' ~ ' . ko_date($e['end_date']) : '')
          . ($e['start_time'] ? ' ' . substr((string)$e['start_time'], 0, 5) : '');
    $title = (string)$e['title'];
    notify(audience_of('event', $e), $me, 'event', 'event:' . $e['id'],
        fn($n, $c) => [$isNew && $c === 1 ? "{$n}님이 일정을 등록했어요" : "{$n}님이 일정을 바꿨어요", one_line("$when · $title")],
        '/day/' . $e['start_date']);
}

function notify_plan(int $planId, int $me, string $what, bool $quiet = true): void {
    $p = row('SELECT * FROM plans WHERE id = ?', [$planId]);
    if (!$p || ($p['kind'] ?? '') !== 'group') return;   // 혼자 계획은 알리지 않아요
    $title = (string)$p['title'];
    notify(audience_of('plan', $p), $me, 'plan', 'plan:' . $planId,
        fn($n, $c) => ["공동 계획 · {$title}" . ($c > 1 ? " (새 소식 {$c}개)" : ''), "{$n}님이 {$what}"],
        '/study/plan/' . $planId, ['quiet' => $quiet, 'names' => true]);
}

function notify_message(int $me, int $to, string $kind, string $body): void {
    $text = $kind === 'sticker' ? '이모티콘을 보냈어요' : ($kind === 'file' ? '파일: ' . $body : ($kind === 'image' ? '사진을 보냈어요' : one_line($body, 100)));
    notify([$to], $me, 'message', 'msg:' . $me,
        fn($n, $c) => [$c > 1 ? "{$n}님의 메시지 {$c}개" : "{$n}님의 메시지", $text], '/messages/' . $me);
}

/* 같이 쓰는 메모: 다른 사람이 고쳤을 때만 (만든 사람 + 직전에 고친 사람에게) */
function notify_note(array $before, int $me, string $newTitle): void {
    $to = [];
    if ((int)$before['owner_id'] !== $me) $to[] = (int)$before['owner_id'];
    if (!empty($before['updated_by']) && (int)$before['updated_by'] !== $me) $to[] = (int)$before['updated_by'];
    if (!$to) return;
    $seen = array_flip(audience_of('note', $before));   // 지금도 볼 수 있는 사람만
    $to = array_values(array_filter($to, fn($u) => isset($seen[$u])));
    notify($to, $me, 'share', 'note:' . $before['id'], fn($n, $c) => ["메모 · {$newTitle}", "{$n}님이 메모를 고쳤어요"], '/notes/' . $before['id'], ['quiet' => true]);
}

/* 같이 그리는 그림판: 만든 사람 + 최근에 같이 그린 사람에게 */
function notify_canvas(array $c, int $me): void {
    $to = [(int)$c['owner_id']];
    foreach (rows('SELECT DISTINCT user_id FROM (SELECT user_id FROM strokes WHERE canvas_id = ? ORDER BY id DESC LIMIT 200) t', [$c['id']]) as $r) $to[] = (int)$r['user_id'];
    $seen = array_flip(audience_of('canvas', $c));
    $to = array_values(array_filter(array_unique($to), fn($u) => $u !== $me && isset($seen[$u])));
    if (!$to) return;
    $title = (string)$c['title'];
    notify($to, $me, 'share', 'canvas:' . $c['id'], fn($n, $cnt) => ["그림판 · {$title}", "{$n}님이 그림을 고쳤어요"], '/draw/' . $c['id'], ['quiet' => true]);
}
