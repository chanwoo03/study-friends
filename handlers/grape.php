<?php
declare(strict_types=1);
/* 포도알 판: 혼자 또는 친구들과 목표를 이룰 때마다 포도알을 하나씩 칠하고, 다 칠하면 모두 배지를 받아요
   - 칠하는 법: study = 그날 공부 시간이 목표에 닿으면 저절로 / check = 직접 '오늘 칠하기'
   - 한 사람은 하루에 한 알 (같이 하는 판이라 공평하게)
   - 판은 만든 사람과 참여한 친구들만 볼 수 있어요 */

const GRAPE_TOTAL = [1 => 16, 2 => 13, 3 => 15];   // 판 그림마다 포도알 수

function grape_people(array $b): array {
    return array_values(array_unique(array_merge([(int)$b['owner_id']], array_map('intval', array_column(rows('SELECT user_id FROM grape_members WHERE board_id = ?', [$b['id']]), 'user_id')))));
}
function grape_load(int $id, int $me): array {
    $b = row('SELECT * FROM grape_boards WHERE id = ?', [$id]);
    if (!$b || !in_array($me, grape_people($b), true)) fail(404, '포도알 판을 찾을 수 없어요');
    return $b;
}
function grape_total(array $b): int { return GRAPE_TOTAL[(int)$b['style']] ?? 16; }
function grape_count(int $id): int { return (int)val('SELECT COUNT(*) FROM grape_marks WHERE board_id = ?', [$id]); }

function grape_out(array $b, int $me, bool $detail = false): array {
    $people = grape_people($b);
    $users = users_by_ids($people);
    $count = grape_count((int)$b['id']);
    $o = ['id' => (int)$b['id'], 'title' => $b['title'], 'style' => (int)$b['style'], 'mode' => $b['mode'], 'targetMin' => (int)$b['target_min'],
          'total' => grape_total($b), 'count' => min($count, grape_total($b)), 'completedAt' => $b['completed_at'], 'mine' => (int)$b['owner_id'] === $me,
          'owner' => $users[(int)$b['owner_id']] ?? null, 'people' => array_values(array_filter(array_map(fn($u) => $users[$u] ?? null, $people))),
          'doneToday' => (bool)val('SELECT 1 FROM grape_marks WHERE board_id = ? AND user_id = ? AND day = CURDATE()', [$b['id'], $me])];
    if ($detail) {
        $o['marks'] = array_map(fn($m) => ['user' => (int)$m['user_id'], 'day' => $m['day'], 'note' => $m['note'], 'at' => $m['created_at']],
            rows('SELECT * FROM grape_marks WHERE board_id = ? ORDER BY id LIMIT 100', [$b['id']]));
        $o['todayStudySec'] = study_seconds([$me], date('Y-m-d'), date('Y-m-d'))[$me] ?? 0;
    }
    return $o;
}

/* 한 알 칠하기 (+ 다 차면 배지) */
function grape_add_mark(array $b, int $uid, string $note): bool {
    if ($b['completed_at'] || grape_count((int)$b['id']) >= grape_total($b)) return false;
    $st = q('INSERT IGNORE INTO grape_marks (board_id, user_id, day, note) VALUES (?, ?, CURDATE(), ?)', [$b['id'], $uid, mb_substr($note, 0, 60)]);
    if ($st->rowCount() === 0) return false;
    $count = grape_count((int)$b['id']); $total = grape_total($b);
    $people = grape_people($b);
    $title = (string)$b['title'];
    if ($count >= $total) {
        q('UPDATE grape_boards SET completed_at = NOW() WHERE id = ? AND completed_at IS NULL', [$b['id']]);
        foreach ($people as $p) q('INSERT IGNORE INTO badges (user_id, kind, ref_id, title, style) VALUES (?, ?, ?, ?, ?)', [$p, 'grape', $b['id'], $title, $b['style']]);
        if (function_exists('notify')) {   // 마지막 알을 칠한 사람은 화면에서 축하를 봐요
            notify($people, $uid, 'grape', 'grape-done:' . $b['id'], fn($n, $c) => ["포도알을 다 채웠어요! 🍇", "{$title} · 배지를 받았어요"], '/grapes/' . $b['id'], ['names' => true]);
        }
    } elseif (function_exists('notify')) {
        notify($people, $uid, 'grape', 'grape:' . $b['id'], fn($n, $c) => ["{$n}님이 포도알을 칠했어요", "{$title} · {$count}/{$total}"], '/grapes/' . $b['id'], ['names' => true]);
    }
    return true;
}
/* 공부 시간 판: 오늘 목표를 넘겼으면 저절로 한 알 (공부 끝낼 때·판을 열 때 불러요) */
function grape_auto(int $uid): void {
    $boards = rows("SELECT b.* FROM grape_boards b WHERE b.mode = 'study' AND b.completed_at IS NULL
                    AND (b.owner_id = ? OR EXISTS (SELECT 1 FROM grape_members m WHERE m.board_id = b.id AND m.user_id = ?))
                    AND NOT EXISTS (SELECT 1 FROM grape_marks k WHERE k.board_id = b.id AND k.user_id = ? AND k.day = CURDATE())", [$uid, $uid, $uid]);
    if (!$boards) return;
    $sec = study_seconds([$uid], date('Y-m-d'), date('Y-m-d'))[$uid] ?? 0;
    foreach ($boards as $b) {
        if ($sec >= (int)$b['target_min'] * 60) grape_add_mark($b, $uid, '공부 ' . intdiv($sec, 3600) . '시간 ' . intdiv($sec % 3600, 60) . '분');
    }
}

route('grape.list', 'GET', function (int $me) {
    grape_auto($me);
    $list = rows('SELECT b.* FROM grape_boards b WHERE b.owner_id = ? OR EXISTS (SELECT 1 FROM grape_members m WHERE m.board_id = b.id AND m.user_id = ?)
                  ORDER BY (b.completed_at IS NULL) DESC, b.id DESC LIMIT 60', [$me, $me]);
    return ['boards' => array_map(fn($b) => grape_out($b, $me), $list), 'badges' => badges_of($me)];
});
route('grape.get', 'GET', function (int $me) {
    grape_auto($me);
    $b = grape_load(int_arg('id'), $me);
    if (function_exists('notif_read_ref')) { notif_read_ref($me, 'grape:' . $b['id']); notif_read_ref($me, 'grape-done:' . $b['id']); }
    return ['board' => grape_out($b, $me, true)];
});
/* 만들기·고치기 (만든 사람만). 참여자는 내 친구만 */
route('grape.save', 'POST', function (int $me) {
    $id = int_arg('id', false);
    $title = str_arg('title', 40, true, '판 이름');
    $style = max(1, min(3, int_arg('style', false) ?: 1));
    $mode = arg('mode', 'study') === 'check' ? 'check' : 'study';
    $target = max(10, min(720, int_arg('targetMin', false) ?: 120));
    $want = arg('members', []);
    $fr = array_flip(friend_ids($me));
    $members = is_array($want) ? array_slice(array_values(array_unique(array_filter(array_map('intval', $want), fn($u) => isset($fr[$u])))), 0, 30) : [];
    if ($id) {
        $b = grape_load($id, $me);
        if ((int)$b['owner_id'] !== $me) fail(403, '만든 사람만 고칠 수 있어요');
        if ((int)$b['style'] !== $style && grape_count($id) > (GRAPE_TOTAL[$style] ?? 16)) fail(400, '이미 칠한 포도알이 새 판보다 많아요');
        q('UPDATE grape_boards SET title = ?, style = ?, mode = ?, target_min = ? WHERE id = ?', [$title, $style, $mode, $target, $id]);
        q('DELETE FROM grape_members WHERE board_id = ?', [$id]);
    } else {
        if ((int)val('SELECT COUNT(*) FROM grape_boards WHERE owner_id = ? AND completed_at IS NULL', [$me]) >= 20) fail(400, '진행 중인 판은 20개까지예요');
        q('INSERT INTO grape_boards (owner_id, title, style, mode, target_min) VALUES (?, ?, ?, ?, ?)', [$me, $title, $style, $mode, $target]);
        $id = (int)db()->lastInsertId();
        if (function_exists('notify') && $members) notify($members, $me, 'grape', 'grape-inv:' . $id, fn($n, $c) => ["{$n}님이 포도알 판에 초대했어요", $title], '/grapes/' . $id, ['names' => true]);
    }
    foreach ($members as $u) q('INSERT IGNORE INTO grape_members (board_id, user_id) VALUES (?, ?)', [$id, $u]);
    return ['board' => grape_out(row('SELECT * FROM grape_boards WHERE id = ?', [$id]), $me, true)];
});
/* 직접 칠하기 (오늘 한 알) */
route('grape.mark', 'POST', function (int $me) {
    $b = grape_load(int_arg('id'), $me);
    if ($b['completed_at']) fail(400, '이미 다 채운 판이에요');
    if ($b['mode'] !== 'check') {
        $sec = study_seconds([$me], date('Y-m-d'), date('Y-m-d'))[$me] ?? 0;
        if ($sec < (int)$b['target_min'] * 60) fail(400, '오늘 공부 시간이 목표에 닿으면 저절로 칠해져요');
    }
    if (!grape_add_mark($b, $me, str_arg('note', 60))) fail(400, '오늘은 이미 칠했어요. 내일 또 칠해요');
    return ['board' => grape_out(row('SELECT * FROM grape_boards WHERE id = ?', [$b['id']]), $me, true)];
});
/* 잘못 칠한 오늘 한 알 지우기 (다 채운 판은 그대로) */
route('grape.unmark', 'POST', function (int $me) {
    $b = grape_load(int_arg('id'), $me);
    if ($b['completed_at']) fail(400, '다 채운 판은 고칠 수 없어요');
    q('DELETE FROM grape_marks WHERE board_id = ? AND user_id = ? AND day = CURDATE()', [$b['id'], $me]);
    return ['board' => grape_out($b, $me, true)];
});
route('grape.leave', 'POST', function (int $me) {
    $b = grape_load(int_arg('id'), $me);
    if ((int)$b['owner_id'] === $me) { q('DELETE FROM grape_boards WHERE id = ?', [$b['id']]); return ['deleted' => true]; }
    q('DELETE FROM grape_members WHERE board_id = ? AND user_id = ?', [$b['id'], $me]);
    return ['deleted' => false];
});

/* 배지 */
function badges_of(int $uid): array {
    return array_map(fn($x) => ['id' => (int)$x['id'], 'kind' => $x['kind'], 'ref' => (int)$x['ref_id'], 'title' => $x['title'], 'style' => (int)$x['style'], 'at' => $x['earned_at']],
        rows('SELECT * FROM badges WHERE user_id = ? ORDER BY earned_at DESC, id DESC LIMIT 200', [$uid]));
}
route('badges.list', 'GET', fn(int $me) => ['badges' => badges_of($me)]);
