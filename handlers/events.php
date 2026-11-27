<?php
declare(strict_types=1);
/* 공유 캘린더 일정 */

function event_out(array $e, int $me, array $users): array {
    $own = (int)$e['owner_id'] === $me;
    return [
        'id'        => (int)$e['id'],
        'owner'     => $users[(int)$e['owner_id']] ?? null,
        'mine'      => $own,
        'title'     => $e['title'],
        'memo'      => $e['memo'] ?? '',
        'startDate' => $e['start_date'],
        'endDate'   => $e['end_date'],
        'startTime' => $e['start_time'] ? substr($e['start_time'], 0, 5) : null,
        'endTime'   => $e['end_time'] ? substr($e['end_time'], 0, 5) : null,
        'color'     => $e['color'],
        'visibility'=> $own ? $e['visibility'] : null,
        'shares'    => $own && $e['visibility'] === 'selected' ? shares_of('event', (int)$e['id']) : [],
    ];
}

route('events.list', 'GET', function (int $me) {
    $from = date_arg('from');
    $to = date_arg('to');
    if ((strtotime($to) - strtotime($from)) > 120 * 86400) fail(400, '한 번에 120일까지만 불러올 수 있어요');
    [$vis, $p] = visible_sql('e', 'event', $me);
    $list = rows("SELECT e.* FROM events e WHERE e.start_date <= ? AND e.end_date >= ? AND {$vis}
                  ORDER BY e.start_date, e.start_time IS NOT NULL, e.start_time, e.id LIMIT 2000", array_merge([$to, $from], $p));
    $users = users_by_ids(array_column($list, 'owner_id'));
    return ['events' => array_map(fn($e) => event_out($e, $me, $users), $list)];
});

route('events.save', 'POST', function (int $me) {
    $id = int_arg('id', false);
    $isNew = !$id;
    $title = str_arg('title', 100, true, '일정 이름');
    $memo = str_arg('memo', 2000);
    $start = date_arg('startDate');
    $end = date_arg('endDate', false) ?? $start;
    if ($end < $start) fail(400, '끝나는 날이 시작하는 날보다 빨라요');
    if ((strtotime($end) - strtotime($start)) > 366 * 86400) fail(400, '일정은 1년까지만 이어질 수 있어요');
    $st = time_arg('startTime');
    $et = time_arg('endTime');
    if (!$st) $et = null;
    if ($st && $et && $start === $end && $et < $st) fail(400, '끝나는 시간이 시작 시간보다 빨라요');
    $color = color_arg('color');
    $visibility = visibility_arg();
    db()->beginTransaction();
    if ($id) {
        load_owned('event', $id, $me);
        q('UPDATE events SET title=?, memo=?, start_date=?, end_date=?, start_time=?, end_time=?, color=?, visibility=? WHERE id=?',
          [$title, $memo, $start, $end, $st, $et, $color, $visibility, $id]);
    } else {
        if ((int)val('SELECT COUNT(*) FROM events WHERE owner_id = ?', [$me]) >= 5000) fail(400, '일정은 5000개까지 만들 수 있어요');
        q('INSERT INTO events (owner_id, title, memo, start_date, end_date, start_time, end_time, color, visibility) VALUES (?,?,?,?,?,?,?,?,?)',
          [$me, $title, $memo, $start, $end, $st, $et, $color, $visibility]);
        $id = (int)db()->lastInsertId();
    }
    save_shares('event', $id, $me, $visibility);
    db()->commit();
    $e = row('SELECT * FROM events WHERE id = ?', [$id]);
    notify_event($e, $me, $isNew);
    return ['event' => event_out($e, $me, users_by_ids([$me]))];
});

route('events.delete', 'POST', function (int $me) {
    $id = int_arg('id');
    load_owned('event', $id, $me);
    q('DELETE FROM events WHERE id = ?', [$id]);
    delete_shares('event', $id);
    return [];
});
