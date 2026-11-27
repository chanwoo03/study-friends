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
/* 그림 조각 검사. 종류(t):
   pen        자유 그리기      p:[x,y,x,y,...]  c 색  w 굵기
   eraser     (예전 버전) 흰색 지우개 선
   line/arrow 선·화살표        p:[x1,y1,x2,y2]  c  w
   rect/ellipse/diamond 네모·동그라미·마름모  p:[x1,y1,x2,y2]  c  w
              f 채우기(0 없음, 1 옅게, 2 진하게)  s 안에 쓸 글자  z 글자 크기
   curve      곡선 연결선      p:[x1,y1,조절x,조절y,x2,y2]  c  w  a(끝에 화살촉)
              (도형은 r 모서리 둥글기 0~200, sh 그림자 도 쓸 수 있어요)
   text       글자             p:[x,y]  s 글자  z 크기  c
   note       포스트잇         p:[x,y,너비,높이]  s 글자  c 종이색 */
function clean_color($v, string $def): string {
    return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : $def;
}
function clean_points($p, int $min, int $max): array {
    if (!is_array($p) || count($p) < $min || count($p) > $max || count($p) % 2) fail(400, '그림 데이터가 잘못됐어요');
    $pts = [];
    foreach (array_values($p) as $i => $v) {
        if (!is_int($v) && !is_float($v)) fail(400, '그림 데이터가 잘못됐어요');
        $pts[] = max(-50, min(($i % 2 ? CANVAS_H : CANVAS_W) + 50, (int)round($v)));
    }
    return $pts;
}
function clean_text($v, int $max): string {
    $t = is_string($v) ? str_replace("\r\n", "\n", $v) : '';
    $t = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $t) ?? '';
    return mb_substr($t, 0, $max);
}
function clean_stroke($d): array {
    if (!is_array($d)) fail(400, '그림 데이터가 잘못됐어요');
    $t = (string)($d['t'] ?? 'pen');
    if (!in_array($t, ['pen', 'eraser', 'line', 'arrow', 'curve', 'rect', 'ellipse', 'diamond', 'text', 'note'], true)) $t = 'pen';
    $c = clean_color($d['c'] ?? null, '#191f28');
    switch ($t) {
        case 'pen':
        case 'eraser':
            return ['t' => $t, 'c' => $c, 'w' => max(1, min(60, (int)($d['w'] ?? 4))), 'p' => clean_points($d['p'] ?? null, 2, 8000)];
        case 'line':
        case 'arrow':
            return ['t' => $t, 'c' => $c, 'w' => max(1, min(20, (int)($d['w'] ?? 3))), 'p' => clean_points($d['p'] ?? null, 4, 4)];
        case 'curve':
            return ['t' => 'curve', 'c' => $c, 'w' => max(1, min(20, (int)($d['w'] ?? 3))), 'a' => !empty($d['a']), 'p' => clean_points($d['p'] ?? null, 6, 6)];
        case 'rect':
        case 'ellipse':
        case 'diamond':
            $f = $d['f'] ?? 0;
            $f = $f === true ? 1 : max(0, min(2, (int)$f));
            $o = ['t' => $t, 'c' => $c, 'w' => max(1, min(20, (int)($d['w'] ?? 3))), 'f' => $f, 'p' => clean_points($d['p'] ?? null, 4, 4)];
            if ($t === 'rect' && isset($d['r'])) $o['r'] = max(0, min(200, (int)$d['r']));
            if (!empty($d['sh'])) $o['sh'] = true;
            $label = trim(clean_text($d['s'] ?? '', 120));
            if ($label !== '') { $o['s'] = $label; $o['z'] = max(14, min(72, (int)($d['z'] ?? 28))); }
            return $o;
        case 'text':
            $s = trim(clean_text($d['s'] ?? '', 200));
            if ($s === '') fail(400, '글자를 입력해 주세요');
            return ['t' => 'text', 'c' => $c, 'z' => max(12, min(120, (int)($d['z'] ?? 32))), 's' => $s, 'p' => clean_points($d['p'] ?? null, 2, 2)];
        default: // note
            $p = clean_points($d['p'] ?? null, 4, 4);
            $p[2] = max(60, min(800, $p[2])); $p[3] = max(40, min(800, $p[3]));
            return ['t' => 'note', 'c' => clean_color($d['c'] ?? null, '#fff3bf'), 's' => clean_text($d['s'] ?? '', 300), 'p' => $p];
    }
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
    q('INSERT INTO strokes (canvas_id, user_id, data) VALUES (?, ?, ?)', [$c['id'], $me, json_encode($d, JSON_UNESCAPED_UNICODE)]);
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

/* 이미 그린 조각 고치기 (옮기기, 글자 바꾸기). 같이 쓰는 사람 누구나 */
route('canvas.edit', 'POST', function (int $me) {
    $c = load_visible('canvas', int_arg('id'), $me);
    $sid = int_arg('sid');
    if (!val('SELECT id FROM strokes WHERE id = ? AND canvas_id = ?', [$sid, $c['id']])) fail(404, '이미 지워진 그림이에요');
    $d = clean_stroke(arg('d'));
    q('UPDATE strokes SET data = ? WHERE id = ?', [json_encode($d, JSON_UNESCAPED_UNICODE), $sid]);
    q('UPDATE canvases SET version = version + 1, updated_at = NOW() WHERE id = ?', [$c['id']]);
    return ['version' => (int)val('SELECT version FROM canvases WHERE id = ?', [$c['id']]), 'd' => $d];
});

/* 조각 지우기 (지우개·선택 후 삭제). 같이 쓰는 사람 누구나 */
route('canvas.remove', 'POST', function (int $me) {
    $c = load_visible('canvas', int_arg('id'), $me);
    $sids = arg('sids', []);
    if (!is_array($sids) || !$sids) fail(400, '지울 그림을 골라 주세요');
    $sids = array_slice(array_values(array_unique(array_map('intval', $sids))), 0, 500);
    q('DELETE FROM strokes WHERE canvas_id = ? AND id IN (' . in_list($sids) . ')', array_merge([$c['id']], $sids));
    q('UPDATE canvases SET version = version + 1, updated_at = NOW() WHERE id = ?', [$c['id']]);
    return ['version' => (int)val('SELECT version FROM canvases WHERE id = ?', [$c['id']])];
});

/* 여러 조각을 한 번에 넣기 (템플릿용, 최대 120개) */
route('canvas.bulk', 'POST', function (int $me) {
    $c = load_visible('canvas', int_arg('id'), $me);
    $list = arg('list', []);
    if (!is_array($list) || !$list || count($list) > 120) fail(400, '넣을 그림이 잘못됐어요');
    $clean = array_map('clean_stroke', array_values($list));
    if ((int)val('SELECT COUNT(*) FROM strokes WHERE canvas_id = ?', [$c['id']]) + count($clean) > 20000) fail(400, '그림판이 가득 찼어요. 새 그림판을 만들어 주세요');
    db()->beginTransaction();
    $out = [];
    foreach ($clean as $d) {
        q('INSERT INTO strokes (canvas_id, user_id, data) VALUES (?, ?, ?)', [$c['id'], $me, json_encode($d, JSON_UNESCAPED_UNICODE)]);
        $out[] = ['id' => (int)db()->lastInsertId(), 'by' => $me, 'd' => $d];
    }
    q('UPDATE canvases SET updated_at = NOW() WHERE id = ?', [$c['id']]);
    db()->commit();
    return ['strokes' => $out];
});
