<?php
declare(strict_types=1);
/* 공부 계획(할 일 체크)과 공부 타이머
   계획 종류: personal(혼자 계획, 만든 사람만 체크) / group(공동 계획, 참여자 모두 각자 체크) */

/* ===== 공동 계획 도우미 ===== */
function plan_member_ids(int $planId): array {
    return array_map('intval', array_column(rows('SELECT user_id FROM plan_members WHERE plan_id = ?', [$planId]), 'user_id'));
}
/* 계획에 참여하는 사람 전부 (만든 사람 + 참여자) */
function plan_people(array $plan): array {
    $ids = [(int)$plan['owner_id']];
    if (($plan['kind'] ?? 'personal') === 'group') $ids = array_values(array_unique(array_merge($ids, plan_member_ids((int)$plan['id']))));
    return $ids;
}
function is_group(array $plan): bool { return ($plan['kind'] ?? 'personal') === 'group'; }
/* 할 일을 추가·수정·체크할 수 있는지: 혼자 계획은 만든 사람, 공동 계획은 참여자 모두 */
function can_work_on(array $plan, int $me): bool {
    return is_group($plan) ? in_array($me, plan_people($plan), true) : (int)$plan['owner_id'] === $me;
}
function load_workable_plan(int $planId, int $me): array {
    $p = row('SELECT * FROM plans WHERE id = ?', [$planId]);
    if (!$p) fail(404, '계획을 찾을 수 없어요');
    if (!can_work_on($p, $me)) fail(403, is_group($p) ? '공동 계획 참여자만 할 수 있어요' : '계획을 만든 사람만 할 수 있어요');
    return $p;
}
/* 기간 동안 공부한 초 (시작한 날 기준, 지금 공부 중인 것도 포함) */
function study_seconds(array $ids, string $from, string $to): array {
    $out = array_fill_keys($ids, 0);
    if (!$ids) return $out;
    close_stale_sessions();
    $r = rows('SELECT user_id, SUM(CASE WHEN ended_at IS NULL THEN LEAST(TIMESTAMPDIFF(SECOND, started_at, NOW()), ?) ELSE seconds END) s
               FROM study_sessions WHERE user_id IN (' . in_list($ids) . ') AND started_at >= ? AND started_at < ? + INTERVAL 1 DAY GROUP BY user_id',
              array_merge([STUDY_CAP], $ids, [$from . ' 00:00:00', $to]));
    foreach ($r as $x) $out[(int)$x['user_id']] = (int)$x['s'];
    return $out;
}
/* 공동 계획 할 일별로 누가 체크했는지 {task_id: [user_id, ...]} */
function task_checks_map(array $taskIds): array {
    $m = [];
    if (!$taskIds) return $m;
    foreach (rows('SELECT task_id, user_id FROM task_checks WHERE task_id IN (' . in_list($taskIds) . ')', $taskIds) as $r) $m[(int)$r['task_id']][] = (int)$r['user_id'];
    return $m;
}

function plan_out(array $p, int $me, array $users, array $counts, array $extra = []): array {
    $own = (int)$p['owner_id'] === $me;
    $c = $counts[(int)$p['id']] ?? ['total' => 0, 'done' => 0, 'first' => null, 'last' => null];
    $group = is_group($p);
    return [
        'id'         => (int)$p['id'],
        'kind'       => $group ? 'group' : 'personal',
        'owner'      => $users[(int)$p['owner_id']] ?? null,
        'mine'       => $own,
        'title'      => $p['title'],
        'color'      => $p['color'],
        'visibility' => $own && !$group ? $p['visibility'] : null,
        'shares'     => $own && !$group && $p['visibility'] === 'selected' ? shares_of('plan', (int)$p['id']) : [],
        'total'      => (int)$c['total'],
        'done'       => (int)$c['done'],          // 혼자 계획: 끝낸 수 / 공동 계획: 내가 끝낸 수
        'firstDate'  => $c['first'],
        'lastDate'   => $c['last'],
        'goal'       => $p['goal_hours'] ? ['hours' => (int)$p['goal_hours'], 'from' => $p['goal_from'], 'to' => $p['goal_to']] : null,
        'updatedAt'  => $p['updated_at'],
    ] + $extra;
}
function task_out(array $t, ?array $checks = null, int $me = 0): array {
    $o = ['id' => (int)$t['id'], 'planId' => (int)$t['plan_id'], 'date' => $t['due_date'], 'subject' => $t['subject'],
          'content' => $t['content'], 'done' => (bool)$t['done']];
    if ($checks !== null) { $o['checks'] = $checks; $o['done'] = in_array($me, $checks, true); }
    return $o;
}
/* 계획별 할 일 수와 끝낸 수 (공동 계획은 '내가' 끝낸 수) */
function plan_counts(array $plans, int $me): array {
    $ids = array_map(fn($p) => (int)$p['id'], $plans);
    if (!$ids) return [];
    $out = [];
    foreach (rows('SELECT plan_id, COUNT(*) total, SUM(done) done, MIN(due_date) first, MAX(due_date) last FROM plan_tasks
                   WHERE plan_id IN (' . in_list($ids) . ') GROUP BY plan_id', $ids) as $r) $out[(int)$r['plan_id']] = $r;
    $groupIds = array_values(array_map(fn($p) => (int)$p['id'], array_filter($plans, 'is_group')));
    if ($groupIds) {
        foreach ($groupIds as $g) if (isset($out[$g])) $out[$g]['done'] = 0;
        foreach (rows('SELECT t.plan_id, COUNT(*) n FROM task_checks c JOIN plan_tasks t ON t.id = c.task_id
                       WHERE c.user_id = ? AND t.plan_id IN (' . in_list($groupIds) . ') GROUP BY t.plan_id', array_merge([$me], $groupIds)) as $r) {
            $out[(int)$r['plan_id']]['done'] = (int)$r['n'];
        }
    }
    return $out;
}
function touch_plan(int $planId, string $what = '할 일을 고쳤어요'): void {
    q('UPDATE plans SET updated_at = NOW() WHERE id = ?', [$planId]);
    notify_plan($planId, uid(), $what);   // 공동 계획이면 다른 참여자에게 알려요
}

route('plans.list', 'GET', function (int $me) {
    [$vis, $p] = visible_sql('p', 'plan', $me);
    $list = rows("SELECT p.* FROM plans p WHERE {$vis} ORDER BY (p.kind = 'group') DESC, (p.owner_id = ?) DESC, p.updated_at DESC LIMIT 300", array_merge($p, [$me]));
    $people = [];
    foreach ($list as $x) if (is_group($x)) $people[(int)$x['id']] = plan_people($x);
    $users = users_by_ids(array_merge(array_column($list, 'owner_id'), ...array_values($people ?: [[]])));
    $counts = plan_counts($list, $me);
    return ['plans' => array_map(function ($x) use ($me, $users, $counts, $people) {
        $extra = [];
        if (is_group($x)) $extra['members'] = array_values(array_filter(array_map(fn($u) => $users[$u] ?? null, $people[(int)$x['id']])));
        return plan_out($x, $me, $users, $counts, $extra);
    }, $list)];
});

route('plans.get', 'GET', function (int $me) {
    notif_read_ref($me, 'plan:' . int_arg('id'));
    $p = load_visible('plan', int_arg('id'), $me);
    $tasks = rows('SELECT * FROM plan_tasks WHERE plan_id = ? ORDER BY due_date, id', [$p['id']]);
    $extra = ['canWork' => can_work_on($p, $me)];
    if (is_group($p)) {
        $people = plan_people($p);
        $users = users_by_ids($people);
        $checks = task_checks_map(array_map(fn($t) => (int)$t['id'], $tasks));
        $outTasks = array_map(fn($t) => task_out($t, $checks[(int)$t['id']] ?? [], $me), $tasks);
        // 사람별 진도와 공동 목표 기간 동안 공부 시간
        $doneBy = array_fill_keys($people, 0);
        foreach ($checks as $who) foreach ($who as $u) if (isset($doneBy[$u])) $doneBy[$u]++;
        $goalSecs = $p['goal_hours'] ? study_seconds($people, $p['goal_from'] ?: date('Y-m-d'), $p['goal_to'] ?: date('Y-m-d')) : [];
        $extra['members'] = array_values(array_filter(array_map(fn($u) => isset($users[$u]) ? $users[$u] + [
            'done' => $doneBy[$u], 'goalSeconds' => $goalSecs[$u] ?? 0, 'isOwner' => $u === (int)$p['owner_id']] : null, $people)));
        if ($p['goal_hours']) $extra['goalSeconds'] = array_sum($goalSecs);
        $extra['memberIds'] = plan_member_ids((int)$p['id']);
    } else {
        $users = users_by_ids([$p['owner_id']]);
        $outTasks = array_map('task_out', $tasks);
        if ($p['goal_hours']) $extra['goalSeconds'] = study_seconds([(int)$p['owner_id']], $p['goal_from'] ?: date('Y-m-d'), $p['goal_to'] ?: date('Y-m-d'))[(int)$p['owner_id']] ?? 0;
    }
    return ['plan' => plan_out($p, $me, $users, plan_counts([$p], $me), $extra), 'tasks' => $outTasks];
});

function goal_args(): array {
    $h = arg('goalHours', null);
    if ($h === null || $h === '' || (int)$h <= 0) return [null, null, null];
    $h = min(10000, (int)$h);
    $from = date_arg('goalFrom', false) ?? date('Y-m-d');
    $to = date_arg('goalTo', false) ?? date('Y-m-d', strtotime($from . ' +6 days'));
    if ($to < $from) fail(400, '목표 끝나는 날이 시작하는 날보다 빨라요');
    if ((strtotime($to) - strtotime($from)) > 366 * 86400) fail(400, '목표 기간은 1년까지예요');
    return [$h, $from, $to];
}
/* 공동 계획 참여자 저장 (만든 사람의 친구만) */
function save_members(int $planId, int $owner): void {
    $want = arg('members', []);
    if (!is_array($want)) $want = [];
    $friends = array_flip(friend_ids($owner));
    $keep = array_slice(array_values(array_unique(array_filter(array_map('intval', $want), fn($i) => isset($friends[$i])))), 0, 50);
    $cur = plan_member_ids($planId);
    // 화면에서 체크를 해제한 참여자는 빼고, 그 사람의 체크 기록도 지워요
    $removed = array_diff($cur, $keep);
    foreach ($removed as $u) {
        q('DELETE FROM plan_members WHERE plan_id = ? AND user_id = ?', [$planId, $u]);
        q('DELETE c FROM task_checks c JOIN plan_tasks t ON t.id = c.task_id WHERE t.plan_id = ? AND c.user_id = ?', [$planId, $u]);
    }
    foreach (array_diff($keep, $cur) as $u) q('INSERT IGNORE INTO plan_members (plan_id, user_id) VALUES (?, ?)', [$planId, $u]);
}

/* 혼자 계획 ↔ 공동 계획 바꾸기 (만든 사람만, 저장 중 한 묶음으로)
   혼자 → 공동: 지금까지 끝낸 할 일은 만든 사람의 체크로 옮겨요
   공동 → 혼자: 만든 사람의 체크만 할 일 완료로 남기고, 참여자와 다른 사람 체크는 지워요 */
function convert_plan(array $plan, string $to): void {
    $id = (int)$plan['id']; $owner = (int)$plan['owner_id'];
    if ($to === 'group') {
        q('INSERT IGNORE INTO task_checks (task_id, user_id, done_at) SELECT id, ?, COALESCE(done_at, NOW()) FROM plan_tasks WHERE plan_id = ? AND done = 1', [$owner, $id]);
        q('UPDATE plan_tasks SET done = 0, done_at = NULL WHERE plan_id = ?', [$id]);
        q("UPDATE plans SET kind = 'group', visibility = 'private' WHERE id = ?", [$id]);
        delete_shares('plan', $id);
    } else {
        q('UPDATE plan_tasks t LEFT JOIN task_checks c ON c.task_id = t.id AND c.user_id = ?
           SET t.done = (c.task_id IS NOT NULL), t.done_at = c.done_at WHERE t.plan_id = ?', [$owner, $id]);
        q('DELETE c FROM task_checks c JOIN plan_tasks t ON t.id = c.task_id WHERE t.plan_id = ?', [$id]);
        q('DELETE FROM plan_members WHERE plan_id = ?', [$id]);
        q("UPDATE plans SET kind = 'personal' WHERE id = ?", [$id]);
    }
}

route('plans.save', 'POST', function (int $me) {
    $id = int_arg('id', false);
    $title = str_arg('title', 100, true, '계획 이름');
    $color = color_arg('color');
    [$gh, $gf, $gt] = goal_args();
    db()->beginTransaction();
    if ($id) {
        $plan = load_owned('plan', $id, $me);
        $want = arg('kind', null);
        if (($want === 'group' || $want === 'personal') && $want !== ($plan['kind'] ?? 'personal')) {
            convert_plan($plan, $want);
            $plan['kind'] = $want;
        }
        if (is_group($plan)) {
            q('UPDATE plans SET title=?, color=?, goal_hours=?, goal_from=?, goal_to=? WHERE id=?', [$title, $color, $gh, $gf, $gt, $id]);
            save_members($id, $me);
        } else {
            $visibility = visibility_arg();
            q('UPDATE plans SET title=?, color=?, visibility=?, goal_hours=?, goal_from=?, goal_to=? WHERE id=?', [$title, $color, $visibility, $gh, $gf, $gt, $id]);
            save_shares('plan', $id, $me, $visibility);
        }
    } else {
        if ((int)val('SELECT COUNT(*) FROM plans WHERE owner_id = ?', [$me]) >= 100) fail(400, '계획은 100개까지 만들 수 있어요');
        $group = arg('kind', 'personal') === 'group';
        $visibility = $group ? 'private' : visibility_arg();
        q('INSERT INTO plans (owner_id, kind, title, color, visibility, goal_hours, goal_from, goal_to) VALUES (?,?,?,?,?,?,?,?)',
          [$me, $group ? 'group' : 'personal', $title, $color, $visibility, $gh, $gf, $gt]);
        $id = (int)db()->lastInsertId();
        if ($group) save_members($id, $me); else save_shares('plan', $id, $me, $visibility);
        $created = true;
    }
    db()->commit();
    notify_plan($id, $me, !empty($created) ? '공동 계획에 초대했어요' : '공동 계획을 고쳤어요', empty($created));
    return ['id' => $id];
});

route('plans.delete', 'POST', function (int $me) {
    $id = int_arg('id');
    load_owned('plan', $id, $me);
    q('DELETE FROM plans WHERE id = ?', [$id]);
    delete_shares('plan', $id);
    return [];
});

/* 공동 계획에서 나가기 (참여자만) */
route('plans.leave', 'POST', function (int $me) {
    $id = int_arg('id');
    $p = row('SELECT * FROM plans WHERE id = ?', [$id]);
    if (!$p || !is_group($p) || !in_array($me, plan_member_ids($id), true)) fail(404, '참여 중인 공동 계획이 아니에요');
    q('DELETE FROM plan_members WHERE plan_id = ? AND user_id = ?', [$id, $me]);
    q('DELETE c FROM task_checks c JOIN plan_tasks t ON t.id = c.task_id WHERE t.plan_id = ? AND c.user_id = ?', [$id, $me]);
    return [];
});

function workable_task(int $taskId, int $me): array {
    $t = row('SELECT * FROM plan_tasks WHERE id = ?', [$taskId]);
    if (!$t) fail(404, '할 일을 찾을 수 없어요');
    $plan = load_workable_plan((int)$t['plan_id'], $me);
    return [$t, $plan];
}

route('tasks.save', 'POST', function (int $me) {
    $id = int_arg('id', false);
    $date = date_arg('date');
    $subject = str_arg('subject', 40);
    $content = str_arg('content', 200, true, '할 일');
    $wasEdit = (bool)$id;
    if ($id) {
        [$t] = workable_task($id, $me);
        q('UPDATE plan_tasks SET due_date=?, subject=?, content=? WHERE id=?', [$date, $subject, $content, $id]);
        $planId = (int)$t['plan_id'];
    } else {
        $planId = int_arg('planId');
        load_workable_plan($planId, $me);
        if ((int)val('SELECT COUNT(*) FROM plan_tasks WHERE plan_id = ?', [$planId]) >= 1000) fail(400, '한 계획에 할 일은 1000개까지예요');
        q('INSERT INTO plan_tasks (plan_id, due_date, subject, content) VALUES (?,?,?,?)', [$planId, $date, $subject, $content]);
        $id = (int)db()->lastInsertId();
    }
    touch_plan($planId, $wasEdit ? "할 일을 고쳤어요: {$content}" : "할 일을 넣었어요: {$content}");
    $plan = row('SELECT * FROM plans WHERE id = ?', [$planId]);
    $t = row('SELECT * FROM plan_tasks WHERE id = ?', [$id]);
    return ['task' => is_group($plan) ? task_out($t, task_checks_map([$id])[$id] ?? [], $me) : task_out($t)];
});

/* 여러 줄 한꺼번에: "2026-12-01 | DB | 11주차 복습" 또는 "12/1 DB 11주차 복습" */
route('tasks.bulk', 'POST', function (int $me) {
    $planId = int_arg('planId');
    load_workable_plan($planId, $me);
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
    if ($added) touch_plan($planId, "할 일 {$added}개를 넣었어요");
    return ['added' => $added, 'badLines' => $bad];
});

route('tasks.delete', 'POST', function (int $me) {
    [$t] = workable_task(int_arg('id'), $me);
    q('DELETE FROM plan_tasks WHERE id = ?', [$t['id']]);
    touch_plan((int)$t['plan_id'], "할 일을 지웠어요: {$t['content']}");
    return [];
});

/* 체크: 혼자 계획은 할 일 자체를, 공동 계획은 '내' 체크만 바꿔요 */
route('tasks.toggle', 'POST', function (int $me) {
    [$t, $plan] = workable_task(int_arg('id'), $me);
    $done = (bool)arg('done', false);
    if (is_group($plan)) {
        if ($done) q('INSERT IGNORE INTO task_checks (task_id, user_id) VALUES (?, ?)', [$t['id'], $me]);
        else q('DELETE FROM task_checks WHERE task_id = ? AND user_id = ?', [$t['id'], $me]);
    } else {
        q('UPDATE plan_tasks SET done = ?, done_at = ? WHERE id = ?', [$done ? 1 : 0, $done ? now() : null, $t['id']]);
    }
    if (is_group($plan)) touch_plan((int)$t['plan_id'], $done ? "할 일을 끝냈어요: {$t['content']}" : '할 일 체크를 풀었어요');
    else touch_plan((int)$t['plan_id']);
    return ['done' => $done];
});

/* 볼 수 있는 계획의 할 일을 기간으로 (캘린더·오늘·날짜 화면용)
   mine: 내가 체크할 수 있는 할 일인지 (내 혼자 계획 또는 내가 참여한 공동 계획) */
function tasks_between(int $me, string $from, string $to): array {
    [$vis, $p] = visible_sql('p', 'plan', $me);
    $list = rows("SELECT t.*, p.owner_id, p.kind, p.title AS plan_title, p.color AS plan_color FROM plan_tasks t JOIN plans p ON p.id = t.plan_id
                  WHERE t.due_date BETWEEN ? AND ? AND {$vis} ORDER BY t.due_date, (p.owner_id = ?) DESC, p.id, t.id LIMIT 5000",
                 array_merge([$from, $to], $p, [$me]));
    $groupTaskIds = [];
    $people = [];
    foreach ($list as $t) if ($t['kind'] === 'group') {
        $groupTaskIds[] = (int)$t['id'];
        if (!isset($people[(int)$t['plan_id']])) $people[(int)$t['plan_id']] = plan_people(['id' => $t['plan_id'], 'owner_id' => $t['owner_id'], 'kind' => 'group']);
    }
    $checks = task_checks_map($groupTaskIds);
    $users = users_by_ids(array_column($list, 'owner_id'));
    return array_map(function ($t) use ($me, $users, $checks, $people) {
        $group = $t['kind'] === 'group';
        $o = $group ? task_out($t, $checks[(int)$t['id']] ?? [], $me) : task_out($t);
        return $o + [
            'owner' => $users[(int)$t['owner_id']] ?? null,
            'kind' => $group ? 'group' : 'personal',
            'people' => $group ? $people[(int)$t['plan_id']] : [(int)$t['owner_id']],
            'mine' => $group ? in_array($me, $people[(int)$t['plan_id']], true) : (int)$t['owner_id'] === $me,
            'planTitle' => $t['plan_title'], 'planColor' => $t['plan_color']];
    }, $list);
}

route('tasks.range', 'GET', function (int $me) {
    $from = date_arg('from');
    $to = date_arg('to');
    if ((strtotime($to) - strtotime($from)) > 120 * 86400) fail(400, '한 번에 120일까지만 불러올 수 있어요');
    return ['tasks' => tasks_between($me, $from, $to)];
});

/* 날짜 화면: 그날 나의 할 일·공부 시간, 일정, 친구별 할 일·공부 시간 */
route('day.get', 'GET', function (int $me) {
    $date = date_arg('date');
    $tasks = tasks_between($me, $date, $date);
    $friends = friend_ids($me);
    $secs = study_seconds(array_merge([$me], $friends), $date, $date);
    $isToday = $date === date('Y-m-d');
    $live = $isToday ? study_today(array_merge([$me], $friends)) : [];
    $users = users_by_ids(array_merge([$me], $friends));
    $sessions = sessions_on($me, array_merge([$me], $friends), $date);

    $person = function (int $u) use ($tasks, $secs, $live, $users, $me, $sessions) {
        // 이 사람의 할 일: 그 사람의 혼자 계획 + 그 사람이 참여한 (내가 볼 수 있는) 공동 계획
        $list = [];
        foreach ($tasks as $t) {
            if (!in_array($u, $t['people'], true)) continue;
            $x = $t;
            if ($t['kind'] === 'group') $x['done'] = in_array($u, $t['checks'], true);
            unset($x['people']);
            $list[] = $x;
        }
        return ['user' => $users[$u] ?? null, 'studySeconds' => $secs[$u] ?? 0,
                'studyingSince' => $live[$u]['studyingSince'] ?? null, 'tasks' => $list, 'sessions' => $sessions[$u] ?? []];
    };
    $friendRows = array_values(array_filter(array_map($person, $friends), fn($r) => $r['user'] !== null));
    usort($friendRows, fn($a, $b) => ($b['studySeconds'] <=> $a['studySeconds']) ?: strcmp($a['user']['name'], $b['user']['name']));

    [$vis, $p] = visible_sql('e', 'event', $me);
    $events = rows("SELECT e.* FROM events e WHERE e.start_date <= ? AND e.end_date >= ? AND {$vis} ORDER BY e.start_time IS NOT NULL, e.start_time, e.id",
                   array_merge([$date, $date], $p));
    $eu = users_by_ids(array_column($events, 'owner_id'));
    return [
        'date' => $date, 'today' => date('Y-m-d'), 'now' => now(),
        'me' => $person($me),
        'friends' => $friendRows,
        'events' => array_map(fn($e) => event_out($e, $me, $eu), $events),
    ];
});

/* ===== 공부 타이머 ===== */
route('study.start', 'POST', function (int $me) {
    close_stale_sessions();
    // 과목(플래너 타임테이블 색)은 고르지 않아도 돼요
    $sid = int_arg('subject', false);
    if ($sid && !val('SELECT id FROM planner_subjects WHERE id = ? AND user_id = ?', [$sid, $me])) $sid = null;
    $open = val('SELECT id FROM study_sessions WHERE user_id = ? AND ended_at IS NULL', [$me]);
    if (!$open) {
        q('INSERT INTO study_sessions (user_id, started_at, subject_id) VALUES (?, NOW(), ?)', [$me, $sid ?: null]);
    } elseif ($sid) {
        q('UPDATE study_sessions SET subject_id = ? WHERE id = ?', [$sid, $open]);   // 공부 중에 과목 바꾸기
    }
    return study_today([$me])[$me] + ['now' => now()];
});
route('study.stop', 'POST', function (int $me) {
    $sid = val('SELECT id FROM study_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1', [$me]);
    q('UPDATE study_sessions SET ended_at = NOW(), seconds = LEAST(TIMESTAMPDIFF(SECOND, started_at, NOW()), ?) WHERE user_id = ? AND ended_at IS NULL', [STUDY_CAP, $me]);
    $sec = $sid ? (int)val('SELECT seconds FROM study_sessions WHERE id = ?', [$sid]) : 0;
    if (function_exists('grape_auto')) grape_auto($me);   // 공부 시간 포도알 판: 목표 넘겼으면 한 알
    return study_today([$me])[$me] + ['now' => now(), 'sessionId' => $sid ? (int)$sid : null, 'sessionSeconds' => $sec];
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


/* ===== 공부 인증 (선택) =====
   끝낸 공부 기록에 사진 한 장과 한 줄 메모를 붙여요. 기본은 친구 공개.
   사진은 uploads/proofs 에 있고 바깥에서 직접 못 열어요. study.proof 가 권한을 확인한 뒤 보내 줘요 */
function proof_dir(): string { return dirname(__DIR__) . '/uploads/proofs'; }
function proof_delete_files(array $sess): void {
    foreach (['proof_file', 'proof_thumb'] as $k) {
        $n = basename((string)($sess[$k] ?? ''));
        if ($n !== '' && preg_match('/^[A-Za-z0-9_]+\.jpg$/', $n) && is_file(proof_dir() . '/' . $n)) @unlink(proof_dir() . '/' . $n);
    }
}
function proof_delete_user_files(int $uid): void {
    foreach (rows('SELECT proof_file, proof_thumb FROM study_sessions WHERE user_id = ? AND proof_file IS NOT NULL', [$uid]) as $s) proof_delete_files($s);
}
function proof_out(array $s, int $me): ?array {
    if (!$s['proof_at']) return null;
    $own = (int)$s['user_id'] === $me;
    return ['photo' => $s['proof_file'] !== null, 'note' => (string)$s['proof_note'], 'at' => $s['proof_at'], 'visibility' => $own ? $s['proof_vis'] : null];
}
function session_out(array $s, int $me): array {
    $live = $s['ended_at'] === null;
    return ['id' => (int)$s['id'], 'start' => $s['started_at'], 'end' => $s['ended_at'], 'live' => $live,
            'seconds' => $live ? min(STUDY_CAP, max(0, time() - strtotime($s['started_at']))) : (int)$s['seconds'], 'proof' => proof_out($s, $me)];
}
/* 그날의 공부 기록: 나는 전부, 친구는 친구 공개 인증이 붙은 것만 */
function sessions_on(int $me, array $ids, string $date): array {
    $out = array_fill_keys($ids, []);
    if (!$ids) return $out;
    $r = rows('SELECT * FROM study_sessions WHERE user_id IN (' . in_list($ids) . ') AND started_at >= ? AND started_at < ? + INTERVAL 1 DAY ORDER BY started_at',
              array_merge($ids, [$date . ' 00:00:00', $date]));
    foreach ($r as $s) {
        $u = (int)$s['user_id'];
        if ($u !== $me && !($s['proof_at'] && $s['proof_vis'] === 'friends')) continue;
        $out[$u][] = session_out($s, $me);
    }
    return $out;
}

route('study.sessions', 'GET', function (int $me) {
    $date = date_arg('date');
    return ['sessions' => sessions_on($me, [$me], $date)[$me]];
});

route('study.verify', 'POST', function (int $me) {
    $s = row('SELECT * FROM study_sessions WHERE id = ? AND user_id = ?', [int_arg('id'), $me]);
    if (!$s) fail(404, '공부 기록을 찾을 수 없어요');
    if ($s['ended_at'] === null) fail(400, '공부를 끝낸 뒤에 인증할 수 있어요');
    $note = str_arg('note', 200);
    $vis = arg('visibility', 'friends') === 'private' ? 'private' : 'friends';
    $img = (string)arg('image', '');
    $file = $s['proof_file']; $thumb = $s['proof_thumb'];
    if ($img !== '') {
        if (!function_exists('decode_jpeg')) fail(500, '사진 처리 기능을 불러오지 못했어요');
        [$big] = decode_jpeg($img, 2 * 1024 * 1024, 2048);
        [$small] = decode_jpeg((string)arg('thumb', ''), 300 * 1024, 640);
        $dir = proof_dir();
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail(500, '사진을 저장할 폴더를 만들지 못했어요 (uploads 폴더 권한 확인)');
        $base = $me . '_' . bin2hex(random_bytes(8));
        if (@file_put_contents("$dir/$base.jpg", $big) === false || @file_put_contents("$dir/{$base}_t.jpg", $small) === false) fail(500, '사진을 저장하지 못했어요 (uploads 폴더 권한 확인)');
        proof_delete_files($s);
        $file = "$base.jpg"; $thumb = "{$base}_t.jpg";
    }
    if ($file === null && $note === '') fail(400, '사진이나 한 줄 메모 중 하나는 남겨 주세요');
    q('UPDATE study_sessions SET proof_file = ?, proof_thumb = ?, proof_note = ?, proof_vis = ?, proof_at = COALESCE(proof_at, NOW()) WHERE id = ?',
      [$file, $thumb, $note, $vis, $s['id']]);
    return ['session' => session_out(row('SELECT * FROM study_sessions WHERE id = ?', [$s['id']]), $me)];
});

route('study.unverify', 'POST', function (int $me) {
    $s = row('SELECT * FROM study_sessions WHERE id = ? AND user_id = ?', [int_arg('id'), $me]);
    if (!$s) fail(404, '공부 기록을 찾을 수 없어요');
    proof_delete_files($s);
    q('UPDATE study_sessions SET proof_file = NULL, proof_thumb = NULL, proof_note = NULL, proof_vis = NULL, proof_at = NULL WHERE id = ?', [$s['id']]);
    return [];
});

route('study.proof', 'GET', function (int $me) {
    $s = row('SELECT * FROM study_sessions WHERE id = ?', [int_arg('id')]);
    $ok = $s && $s['proof_file'] && ((int)$s['user_id'] === $me || ($s['proof_vis'] === 'friends' && is_friend($me, (int)$s['user_id'])));
    if (!$ok) fail(404, '사진을 찾을 수 없어요');
    $name = basename((string)(($_GET['size'] ?? '') === 'full' ? $s['proof_file'] : $s['proof_thumb']));
    $f = proof_dir() . '/' . $name;
    if (!preg_match('/^[A-Za-z0-9_]+\.jpg$/', $name) || !is_file($f)) fail(404, '사진 파일이 없어요');
    $etag = '"' . md5($name . filemtime($f)) . '"';
    header('Content-Type: image/jpeg');
    header('Cache-Control: private, max-age=604800');
    header('ETag: ' . $etag);
    header('X-Content-Type-Options: nosniff');
    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
    header('Content-Length: ' . filesize($f));
    readfile($f);
    exit;
});

/* ===== 친구 등수: 나와 내 친구들끼리만 ===== */
function period_range(string $period): array {
    $today = date('Y-m-d');
    if ($period === 'today') return [$today, $today];
    if ($period === 'month') return [date('Y-m-01'), $today];
    return [date('Y-m-d', strtotime('monday this week')), $today];   // 이번 주: 월요일부터
}
route('rank.get', 'GET', function (int $me) {
    $period = in_array(arg('period'), ['today', 'week', 'month'], true) ? arg('period') : 'week';
    [$from, $to] = period_range($period);
    $ids = array_merge([$me], friend_ids($me));
    $secs = study_seconds($ids, $from, $to);
    $live = study_today($ids);
    $in = in_list($ids);
    // 인증한 공부 시간
    $proof = array_fill_keys($ids, 0);
    foreach (rows("SELECT user_id, SUM(seconds) s FROM study_sessions WHERE user_id IN ($in) AND proof_at IS NOT NULL AND started_at >= ? AND started_at < ? + INTERVAL 1 DAY GROUP BY user_id",
                  array_merge($ids, [$from . ' 00:00:00', $to])) as $r) $proof[(int)$r['user_id']] = (int)$r['s'];
    // 끝낸 할 일 (혼자 계획 + 공동 계획에서 내가 체크한 것)
    $tasks = array_fill_keys($ids, 0);
    foreach (rows("SELECT p.owner_id u, COUNT(*) n FROM plan_tasks t JOIN plans p ON p.id = t.plan_id
                   WHERE p.kind <> 'group' AND t.done = 1 AND p.owner_id IN ($in) AND t.done_at >= ? AND t.done_at < ? + INTERVAL 1 DAY GROUP BY p.owner_id",
                  array_merge($ids, [$from . ' 00:00:00', $to])) as $r) $tasks[(int)$r['u']] += (int)$r['n'];
    foreach (rows("SELECT user_id u, COUNT(*) n FROM task_checks WHERE user_id IN ($in) AND done_at >= ? AND done_at < ? + INTERVAL 1 DAY GROUP BY user_id",
                  array_merge($ids, [$from . ' 00:00:00', $to])) as $r) $tasks[(int)$r['u']] += (int)$r['n'];
    // 연속 공부한 날 (하루 10분 이상, 오늘 아직 안 했으면 어제까지 이어진 것도 인정)
    $days = [];
    foreach (rows("SELECT user_id, DATE(started_at) d, SUM(CASE WHEN ended_at IS NULL THEN LEAST(TIMESTAMPDIFF(SECOND, started_at, NOW()), ?) ELSE seconds END) s
                   FROM study_sessions WHERE user_id IN ($in) AND started_at >= CURDATE() - INTERVAL 120 DAY GROUP BY user_id, DATE(started_at)",
                  array_merge([STUDY_CAP], $ids)) as $r) if ((int)$r['s'] >= 600) $days[(int)$r['user_id']][$r['d']] = true;
    $streak = [];
    foreach ($ids as $u) {
        $n = 0; $d = strtotime(date('Y-m-d'));
        if (empty($days[$u][date('Y-m-d', $d)])) $d -= 86400;
        while (!empty($days[$u][date('Y-m-d', $d)])) { $n++; $d -= 86400; }
        $streak[$u] = $n;
    }
    $users = users_by_ids($ids);
    $rows = [];
    foreach ($ids as $u) if (isset($users[$u])) $rows[] = ['user' => $users[$u], 'mine' => $u === $me, 'seconds' => $secs[$u] ?? 0,
        'proofSeconds' => $proof[$u], 'tasks' => $tasks[$u], 'streak' => $streak[$u], 'studying' => !empty($live[$u]['studyingSince'])];
    return ['period' => $period, 'from' => $from, 'to' => $to, 'rows' => $rows];
});
