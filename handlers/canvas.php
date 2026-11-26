<?php
declare(strict_types=1);
/* 같이 그리는 그림판. 획(stroke) 하나씩 저장하고, 다른 사람은 몇 초마다 새 획을 받아 가요 */

const CANVAS_W = 1600;
const CANVAS_H = 1000;

function canvas_out(array $c, int $me, array $users): array {
    $own = (int)$c['owner_id'] === $me;
    return ['id' => (int)$c['id'], 'owner' => $users[(int)$c['owner_id']] ?? null, 'mine' => $own, 'title' => $c['title'],
            'visibility' => $own ? $c['visibility'] : null,
            'shares' => $own && $c['visibility'] === 'selected' ? shares_of('canvas', (int)$c['id']) : [],
            'version' => (int)$c['version'], 'updatedAt' => $c['updated_at']];
}
function stroke_out(array $s): array {
    return ['id' => (int)$s['id'], 'by' => (int)$s['user_id'], 'd' => json_decode($s['data'], true)];
}
/* 획 모양 검사: {t:'pen'|'eraser', c:'#rrggbb', w:1~60, p:[x,y,x,y,...]} (정수 좌표) */
function clean_stroke($d): array {
    if (!is_array($d)) fail(400, '그림 데이터가 잘못됐어요');
    $t = ($d['t'] ?? 'pen') === 'eraser' ? 'eraser' : 'pen';
    $c = is_string($d['c'] ?? null) && preg_match('/^#[0-9a-fA-F]{6}$/', $d['c']) ? strtolower($d['c']) : '#191f28';
    $w = max(1, min(60, (int)($d['w'] ?? 4)));
    $p = $d['p'] ?? null;
    if (!is_array($p) || count($p) < 2 || count($p) > 8000 || count($p) % 2) fail(400, '그림 데이터가 잘못됐어요');
    $pts = [];
    foreach ($p as $i => $v) {
        if (!is_int($v) && !is_float($v)) fail(400, '그림 데이터가 잘못됐어요');
        $pts[] = max(-50, min(($i % 2 ? CANVAS_H : CANVAS_W) + 50, (int)round($v)));
    }
    return ['t' => $t, 'c' => $c, 'w' => $w, 'p' => $pts];
}

route('canvas.list', 'GET', function (int $me) {
    [$vis, $p] = visible_sql('c', 'canvas', $me);
    $list = rows("SELECT c.* FROM canvases c WHERE {$vis} ORDER BY c.updated_at DESC LIMIT 200", $p);
    $users = users_by_ids(array_column($list, 'owner_id'));
    return ['canvases' => array_map(fn($c) => canvas_out($c, $me, $users), $list)];
});

route('canvas.save', 'POST', function (int $me) {
    $id = int_arg('id', false);
    $title = str_arg('title', 60, true, '이름');
    $visibility = visibility_arg();
    db()->beginTransaction();
    if ($id) {
        load_owned('canvas', $id, $me);
        q('UPDATE canvases SET title = ?, visibility = ? WHERE id = ?', [$title, $visibility, $id]);
    } else {
        if ((int)val('SELECT COUNT(*) FROM canvases WHERE owner_id = ?', [$me]) >= 100) fail(400, '그림판은 100개까지 만들 수 있어요');
        q('INSERT INTO canvases (owner_id, title, visibility) VALUES (?, ?, ?)', [$me, $title, $visibility]);
        $id = (int)db()->lastInsertId();
    }
    save_shares('canvas', $id, $me, $visibility);
    db()->commit();
    return ['id' => $id];
});

route('canvas.delete', 'POST', function (int $me) {
    $id = int_arg('id');
    load_owned('canvas', $id, $me);
    q('DELETE FROM canvases WHERE id = ?', [$id]);
    delete_shares('canvas', $id);
    return [];
});

/* after 가 있으면 그 뒤 획만. version 이 바뀌었으면(되돌리기·지우기) 화면이 전체를 다시 받아요 */
route('canvas.get', 'GET', function (int $me) {
    $c = load_visible('canvas', int_arg('id'), $me);
    $after = int_arg('after', false);
    $strokes = rows('SELECT * FROM strokes WHERE canvas_id = ? AND id > ? ORDER BY id LIMIT 3000', [$c['id'], $after]);
    $userIds = $after ? [] : array_column(rows('SELECT DISTINCT user_id FROM strokes WHERE canvas_id = ?', [$c['id']]), 'user_id');
    return ['canvas' => canvas_out($c, $me, users_by_ids(array_merge([$c['owner_id']], $userIds))),
            'strokes' => array_map('stroke_out', $strokes), 'more' => count($strokes) === 3000,
            'size' => [CANVAS_W, CANVAS_H]];
});

route('canvas.stroke', 'POST', function (int $me) {
    $c = load_visible('canvas', int_arg('id'), $me);
    $d = clean_stroke(arg('d'));
    if ((int)val('SELECT COUNT(*) FROM strokes WHERE canvas_id = ?', [$c['id']]) >= 20000) fail(400, '그림판이 가득 찼어요. 새 그림판을 만들어 주세요');
    q('INSERT INTO strokes (canvas_id, user_id, data) VALUES (?, ?, ?)', [$c['id'], $me, json_encode($d)]);
    $sid = (int)db()->lastInsertId();
    q('UPDATE canvases SET updated_at = NOW() WHERE id = ?', [$c['id']]);
    return ['id' => $sid];
});

route('canvas.undo', 'POST', function (int $me) {
    $c = load_visible('canvas', int_arg('id'), $me);
    $sid = val('SELECT MAX(id) FROM strokes WHERE canvas_id = ? AND user_id = ?', [$c['id'], $me]);
    if (!$sid) fail(400, '되돌릴 내 그림이 없어요');
    q('DELETE FROM strokes WHERE id = ?', [$sid]);
    q('UPDATE canvases SET version = version + 1, updated_at = NOW() WHERE id = ?', [$c['id']]);
    return ['removed' => (int)$sid, 'version' => (int)val('SELECT version FROM canvases WHERE id = ?', [$c['id']])];
});

route('canvas.clear', 'POST', function (int $me) {
    $c = load_owned('canvas', int_arg('id'), $me);
    q('DELETE FROM strokes WHERE canvas_id = ?', [$c['id']]);
    q('UPDATE canvases SET version = version + 1, updated_at = NOW() WHERE id = ?', [$c['id']]);
    return ['version' => (int)val('SELECT version FROM canvases WHERE id = ?', [$c['id']])];
});
