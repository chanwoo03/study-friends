<?php
declare(strict_types=1);
/* 공부 계획(할 일 체크)과 공부 타이머 */

function plan_out(array $p, int $me, array $users, array $counts): array {
    $own = (int)$p['owner_id'] === $me;
    $c = $counts[(int)$p['id']] ?? ['total' => 0, 'done' => 0, 'first' => null, 'last' => null];
    return [
        'id'         => (int)$p['id'],
        'owner'      => $users[(int)$p['owner_id']] ?? null,
        'mine'       => $own,
        'title'      => $p['title'],
        'color'      => $p['color'],
        'visibility' => $own ? $p['visibility'] : null,
        'shares'     => $own && $p['visibility'] === 'selected' ? shares_of('plan', (int)$p['id']) : [],
        'total'      => (int)$c['total'],
        'done'       => (int)$c['done'],
        'firstDate'  => $c['first'],
        'lastDate'   => $c['last'],
        'updatedAt'  => $p['updated_at'],
    ];
}
function task_out(array $t): array {
    return ['id' => (int)$t['id'], 'planId' => (int)$t['plan_id'], 'date' => $t['due_date'], 'subject' => $t['subject'],
            'content' => $t['content'], 'done' => (bool)$t['done']];
}
function plan_counts(array $ids): array {
    if (!$ids) return [];
    $out = [];
    foreach (rows('SELECT plan_id, COUNT(*) total, SUM(done) done, MIN(due_date) first, MAX(due_date) last FROM plan_tasks
                   WHERE plan_id IN (' . in_list($ids) . ') GROUP BY plan_id', $ids) as $r) $out[(int)$r['plan_id']] = $r;
    return $out;
}
function touch_plan(int $planId): void { q('UPDATE plans SET updated_at = NOW() WHERE id = ?', [$planId]); }

route('plans.list', 'GET', function (int $me) {
    [$vis, $p] = visible_sql('p', 'plan', $me);
    $list = rows("SELECT p.* FROM plans p WHERE {$vis} ORDER BY (p.owner_id = ?) DESC, p.updated_at DESC LIMIT 300", array_merge($p, [$me]));
    $users = users_by_ids(array_column($list, 'owner_id'));
    $counts = plan_counts(array_map('intval', array_column($list, 'id')));
    return ['plans' => array_map(fn($x) => plan_out($x, $me, $users, $counts), $list)];
});

route('plans.get', 'GET', function (int $me) {
    $p = load_visible('plan', int_arg('id'), $me);
    $tasks = rows('SELECT * FROM plan_tasks WHERE plan_id = ? ORDER BY due_date, id', [$p['id']]);
    return ['plan' => plan_out($p, $me, users_by_ids([$p['owner_id']]), plan_counts([(int)$p['id']])),
            'tasks' => array_map('task_out', $tasks)];
});

route('plans.save', 'POST', function (int $me) {
    $id = int_arg('id', false);
    $title = str_arg('title', 100, true, '계획 이름');
    $color = color_arg('color');
    $visibility = visibility_arg();
    db()->beginTransaction();
    if ($id) {
        load_owned('plan', $id, $me);
        q('UPDATE plans SET title=?, color=?, visibility=? WHERE id=?', [$title, $color, $visibility, $id]);
    } else {
        if ((int)val('SELECT COUNT(*) FROM plans WHERE owner_id = ?', [$me]) >= 100) fail(400, '계획은 100개까지 만들 수 있어요');
        q('INSERT INTO plans (owner_id, title, color, visibility) VALUES (?,?,?,?)', [$me, $title, $color, $visibility]);
        $id = (int)db()->lastInsertId();
    }
    save_shares('plan', $id, $me, $visibility);
    db()->commit();
    return ['id' => $id];
});

route('plans.delete', 'POST', function (int $me) {
    $id = int_arg('id');
    load_owned('plan', $id, $me);
    q('DELETE FROM plans WHERE id = ?', [$id]);
    delete_shares('plan', $id);
    return [];
});

function owned_task(int $taskId, int $me): array {
    $t = row('SELECT t.*, p.owner_id FROM plan_tasks t JOIN plans p ON p.id = t.plan_id WHERE t.id = ?', [$taskId]);
    if (!$t) fail(404, '할 일을 찾을 수 없어요');
    if ((int)$t['owner_id'] !== $me) fail(403, '계획을 만든 사람만 체크할 수 있어요');
    return $t;
}

route('tasks.save', 'POST', function (int $me) {
    $id = int_arg('id', false);
    $date = date_arg('date');
    $subject = str_arg('subject', 40);
    $content = str_arg('content', 200, true, '할 일');
    if ($id) {
        $t = owned_task($id, $me);
        q('UPDATE plan_tasks SET due_date=?, subject=?, content=? WHERE id=?', [$date, $subject, $content, $id]);
        $planId = (int)$t['plan_id'];
    } else {
        $planId = int_arg('planId');
        load_owned('plan', $planId, $me);
        if ((int)val('SELECT COUNT(*) FROM plan_tasks WHERE plan_id = ?', [$planId]) >= 1000) fail(400, '한 계획에 할 일은 1000개까지예요');
        q('INSERT INTO plan_tasks (plan_id, due_date, subject, content) VALUES (?,?,?,?)', [$planId, $date, $subject, $content]);
        $id = (int)db()->lastInsertId();
    }
    touch_plan($planId);
    return ['task' => task_out(row('SELECT * FROM plan_tasks WHERE id = ?', [$id]))];
});

/* 여러 줄 한꺼번에: "2026-12-01 | DB | 11주차 복습" 또는 "12/1 DB 11주차 복습" */
route('tasks.bulk', 'POST', function (int $me) {
    $planId = int_arg('planId');
    load_owned('plan', $planId, $me);
    $text = str_arg('text', 50000, true, '내용');
    $year = (int)date('Y');
    $added = 0; $bad = [];
    $have = (int)val('SELECT COUNT(*) FROM plan_tasks WHERE plan_id = ?', [$planId]);
    db()->beginTransaction();
    foreach (explode("\n", $text) as $n => $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (!preg_match('/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})\.?\s*[|\s]\s*(.+)$/u', $line, $m)
            && !preg_match('/^()(\d{1,2})[.\/](\d{1,2})\.?\s*[|\s]\s*(.+)$/u', $line, $m)) { $bad[] = $n + 1; continue; }
        $y = $m[1] !== '' ? (int)$m[1] : $year;
        if (!checkdate((int)$m[2], (int)$m[3], $y)) { $bad[] = $n + 1; continue; }
        $rest = trim($m[4]);
        if (str_contains($rest, '|')) { [$subject, $content] = array_map('trim', explode('|', $rest, 2)); }
        else { $parts = preg_split('/\s+/u', $rest, 2); $subject = $parts[0]; $content = $parts[1] ?? ''; }
        if ($content === '') { $content = $subject; $subject = ''; }
        if ($have + $added >= 1000) break;
        q('INSERT INTO plan_tasks (plan_id, due_date, subject, content) VALUES (?,?,?,?)',
          [$planId, sprintf('%04d-%02d-%02d', $y, $m[2], $m[3]), mb_substr($subject, 0, 40), mb_substr($content, 0, 200)]);
        $added++;
    }
    db()->commit();
    touch_plan($planId);
    return ['added' => $added, 'badLines' => $bad];
});

route('tasks.delete', 'POST', function (int $me) {
    $t = owned_task(int_arg('id'), $me);
    q('DELETE FROM plan_tasks WHERE id = ?', [$t['id']]);
    touch_plan((int)$t['plan_id']);
    return [];
});

route('tasks.toggle', 'POST', function (int $me) {
    $t = owned_task(int_arg('id'), $me);
    $done = (bool)arg('done', false);
    q('UPDATE plan_tasks SET done = ?, done_at = ? WHERE id = ?', [$done ? 1 : 0, $done ? now() : null, $t['id']]);
    touch_plan((int)$t['plan_id']);
    return ['done' => $done];
});

/* 기간 안의 할 일 (캘린더·오늘 화면용). 볼 수 있는 계획 것만 */
route('tasks.range', 'GET', function (int $me) {
    $from = date_arg('from');
    $to = date_arg('to');
    if ((strtotime($to) - strtotime($from)) > 120 * 86400) fail(400, '한 번에 120일까지만 불러올 수 있어요');
    [$vis, $p] = visible_sql('p', 'plan', $me);
    $list = rows("SELECT t.*, p.owner_id, p.title AS plan_title, p.color AS plan_color FROM plan_tasks t JOIN plans p ON p.id = t.plan_id
                  WHERE t.due_date BETWEEN ? AND ? AND {$vis} ORDER BY t.due_date, (p.owner_id = ?) DESC, p.id, t.id LIMIT 5000",
                 array_merge([$from, $to], $p, [$me]));
    $users = users_by_ids(array_column($list, 'owner_id'));
    return ['tasks' => array_map(fn($t) => task_out($t) + [
        'owner' => $users[(int)$t['owner_id']] ?? null, 'mine' => (int)$t['owner_id'] === $me,
        'planTitle' => $t['plan_title'], 'planColor' => $t['plan_color']], $list)];
});

/* ===== 공부 타이머 ===== */
route('study.start', 'POST', function (int $me) {
    close_stale_sessions();
    if (!val('SELECT id FROM study_sessions WHERE user_id = ? AND ended_at IS NULL', [$me])) {
        q('INSERT INTO study_sessions (user_id, started_at) VALUES (?, NOW())', [$me]);
    }
    return study_today([$me])[$me] + ['now' => now()];
});
route('study.stop', 'POST', function (int $me) {
    q('UPDATE study_sessions SET ended_at = NOW(), seconds = LEAST(TIMESTAMPDIFF(SECOND, started_at, NOW()), ?) WHERE user_id = ? AND ended_at IS NULL', [STUDY_CAP, $me]);
    return study_today([$me])[$me] + ['now' => now()];
});
route('study.status', 'GET', function (int $me) {
    return study_today([$me])[$me] + ['now' => now()];
});
/* 최근 7일, 나와 친구들의 하루 공부 시간 */
route('study.week', 'GET', function (int $me) {
    close_stale_sessions();
    $ids = array_merge([$me], friend_ids($me));
    $from = date('Y-m-d', strtotime('-6 days'));
    $r = rows('SELECT user_id, DATE(started_at) d, SUM(CASE WHEN ended_at IS NULL THEN LEAST(TIMESTAMPDIFF(SECOND, started_at, NOW()), ?) ELSE seconds END) s
               FROM study_sessions WHERE user_id IN (' . in_list($ids) . ') AND started_at >= ? GROUP BY user_id, DATE(started_at)',
              array_merge([STUDY_CAP], $ids, [$from . ' 00:00:00']));
    $days = [];
    for ($i = 6; $i >= 0; $i--) $days[] = date('Y-m-d', strtotime("-{$i} days"));
    $by = [];
    foreach ($r as $x) $by[(int)$x['user_id']][$x['d']] = (int)$x['s'];
    $users = users_by_ids($ids);
    $series = [];
    foreach ($ids as $u) {
        if (!isset($users[$u])) continue;
        $series[] = ['user' => $users[$u], 'mine' => $u === $me, 'seconds' => array_map(fn($d) => $by[$u][$d] ?? 0, $days)];
    }
    return ['days' => $days, 'series' => $series];
});
