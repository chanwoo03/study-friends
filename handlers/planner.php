<?php
declare(strict_types=1);
/* 학습 플래너: 하루 한 장(타임테이블·할 일·목표·돌아보기), 주간 보기, 한 달 플래너 북, D-day
   - 타임테이블은 10분 칸 144개 (아침 6시 ~ 다음날 아침 6시). 공부 타이머 기록이 저절로 칠해지고, 손으로도 칠해요.
   - 공개 범위는 사람마다 하나: 나만 보기 / 친구 공개 (users.planner_vis) */

const PLAN_SLOTS = 144;          // 10분 × 144 = 24시간
const PLAN_START_HOUR = 6;       // 칸 0 = 오전 6:00

/* 누구의 플래너를 보는지: 나, 또는 플래너를 친구 공개한 내 친구 */
function planner_owner(int $me): int {
    $u = (int)($_GET['u'] ?? arg('u', 0));
    if (!$u || $u === $me) return $me;
    if (!is_friend($me, $u) || val('SELECT planner_vis FROM users WHERE id = ?', [$u]) !== 'friends') fail(404, '볼 수 없는 플래너예요');
    return $u;
}
function subject_ids(int $uid): array {
    return array_map('intval', array_column(rows('SELECT id FROM planner_subjects WHERE user_id = ?', [$uid]), 'id'));
}
function subjects_of(int $uid): array {
    return array_map(fn($s) => ['id' => (int)$s['id'], 'name' => $s['name'], 'color' => $s['color']],
        rows('SELECT * FROM planner_subjects WHERE user_id = ? ORDER BY sort, id', [$uid]));
}
function day_window(string $date): array {
    $ws = strtotime($date . ' ' . sprintf('%02d:00:00', PLAN_START_HOUR));
    return [$ws, $ws + 86400];
}
/* 공부 타이머 기록 → 칸 {칸번호: 과목id(없으면 0)} (그 칸의 절반 이상 공부했으면 칠해요) */
function session_slots(array $sessions, string $date): array {
    [$ws, $we] = day_window($date);
    $out = [];
    foreach ($sessions as $s) {
        $a = max($ws, strtotime((string)$s['started_at']));
        $b = min($we, $s['ended_at'] ? strtotime((string)$s['ended_at']) : time());
        if ($b <= $a) continue;
        for ($i = intdiv($a - $ws, 600); $i < PLAN_SLOTS && $ws + $i * 600 < $b; $i++) {
            $cs = $ws + $i * 600; $ce = $cs + 600;
            if (min($ce, $b) - max($cs, $a) >= 300) $out[$i] = (int)($s['subject_id'] ?? 0);
        }
    }
    return $out;
}
function sessions_between(int $uid, string $from, string $to): array {
    // 하루 창이 다음날 아침 6시까지라 하루 더 넉넉히
    return rows('SELECT started_at, ended_at, subject_id FROM study_sessions WHERE user_id = ? AND started_at < ? AND (ended_at IS NULL OR ended_at > ?) ORDER BY started_at',
                [$uid, date('Y-m-d', strtotime($to . ' +1 day')) . sprintf(' %02d:00:00', PLAN_START_HOUR), $from . sprintf(' %02d:00:00', PLAN_START_HOUR)]);
}
function decode_blocks(?string $j): array {
    $out = [];
    foreach ((json_decode((string)$j, true) ?: []) as $k => $v) {
        $k = (int)$k;
        if ($k >= 0 && $k < PLAN_SLOTS) $out[$k] = (int)$v;
    }
    return $out;
}
/* 하루 요약: 칠한 칸(손으로 칠한 것이 타이머 기록보다 우선) */
function day_summary(array $auto, array $manual): array {
    $merged = $auto;
    foreach ($manual as $k => $v) { if ($v < 0) unset($merged[$k]); else $merged[$k] = $v; }   // -1 = 지운 칸
    $by = [];
    foreach ($merged as $sid) $by[$sid] = ($by[$sid] ?? 0) + 10;
    return ['minutes' => count($merged) * 10, 'bySubject' => (object)$by, 'merged' => $merged];
}
function my_tasks_on(int $me, string $date): array {
    if (!function_exists('tasks_between')) return [];
    $out = [];
    foreach (tasks_between($me, $date, $date) as $t) {
        if (empty($t['mine'])) continue;
        if ($t['kind'] === 'group') $t['done'] = in_array($me, $t['checks'], true);
        unset($t['people']);
        $out[] = $t;
    }
    return $out;
}
function ddays_of(int $uid, string $from): array {
    return array_map(fn($d) => ['id' => (int)$d['id'], 'title' => $d['title'], 'day' => $d['day'], 'color' => $d['color']],
        rows('SELECT * FROM ddays WHERE user_id = ? AND day >= ? ORDER BY day, id LIMIT 20', [$uid, $from]));
}
/* 할 일 표시: 0 아직 · 1 ○ 다 함 · 2 △ 조금 함 · 3 × 못 함 */
function todos_out(array $rows): array {
    return array_map(fn($t) => ['id' => (int)$t['id'], 'text' => $t['text'], 'state' => (int)$t['done'], 'done' => (int)$t['done'] === 1, 'subjectId' => $t['subject_id'] ? (int)$t['subject_id'] : null], $rows);
}

/* ===== 꾸미기 =====
   한 쪽 너비를 100 으로 보고 위치·크기를 저장해요 (휴대폰·컴퓨터·책에서 같은 자리에 보이게)
   k: st 그림 이모티콘 · em 이모지 · tp 마스킹테이프 · sp 도장 · ph 사진 */
const DECO_TAPES = ['mint-dot', 'lemon-stripe', 'pink-grid', 'lav-plain', 'kraft', 'sky-check', 'peach-flower', 'navy-star'];
const DECO_STAMPS = ['great', 'done', 'focus', 'perfect', 'fighting', 'rest'];
function clean_decos($in, int $uid, string $date): array {
    if (!is_array($in)) return [];
    $photos = array_flip(array_map('intval', array_column(rows('SELECT id FROM planner_photos WHERE user_id = ? AND day = ?', [$uid, $date]), 'id')));
    $out = [];
    foreach (array_slice($in, 0, 40) as $d) {
        if (!is_array($d)) continue;
        $k = (string)($d['k'] ?? ''); $v = $d['v'] ?? '';
        if ($k === 'st') { $v = (string)$v; if (!function_exists('sticker_ok') || !sticker_ok($v)) continue; }
        elseif ($k === 'em') { $v = mb_substr(trim((string)$v), 0, 8); if ($v === '' || preg_match('/[<>&"\'\x5c]/', $v) !== 0) continue; }
        elseif ($k === 'tp') { if (!in_array($v, DECO_TAPES, true)) continue; }
        elseif ($k === 'sp') { if (!in_array($v, DECO_STAMPS, true)) continue; }
        elseif ($k === 'ph') { $v = (int)$v; if (!isset($photos[$v])) continue; }
        else continue;
        $num = fn($key, $lo, $hi, $def) => max($lo, min($hi, round((float)($d[$key] ?? $def), 2)));
        $out[] = ['k' => $k, 'v' => $v, 'p' => (int)($d['p'] ?? 0) === 1 ? 1 : 0,
                  'x' => $num('x', -10, 105, 50), 'y' => $num('y', -10, 200, 50), 'w' => $num('w', 4, 90, 20), 'r' => $num('r', -180, 180, 0), 'z' => (int)$num('z', 0, 99, 1)];
    }
    return $out;
}
function decos_of(?string $j): array { $d = json_decode((string)$j, true); return is_array($d) ? $d : []; }
function planner_photos_of(int $uid, string $from, string $to): array {
    $out = [];
    foreach (rows('SELECT id, day, w, h FROM planner_photos WHERE user_id = ? AND day BETWEEN ? AND ?', [$uid, $from, $to]) as $p) $out[(int)$p['id']] = ['id' => (int)$p['id'], 'day' => $p['day'], 'w' => (int)$p['w'], 'h' => (int)$p['h']];
    return $out;
}
function planner_dir(): string { return dirname(__DIR__) . '/uploads/planner'; }
function planner_delete_photo_files(array $p): void {
    foreach (['file', 'thumb'] as $k) { $n = basename((string)$p[$k]); if (preg_match('/^[A-Za-z0-9_]+\.jpg$/', $n) && is_file(planner_dir() . "/$n")) @unlink(planner_dir() . "/$n"); }
}
function planner_delete_user_files(int $uid): void {
    foreach (rows('SELECT * FROM planner_photos WHERE user_id = ?', [$uid]) as $p) planner_delete_photo_files($p);
}

/* 하루 한 장 */
route('planner.get', 'GET', function (int $me) {
    $date = date_arg('date');
    $uid = planner_owner($me);
    $mine = $uid === $me;
    $d = row('SELECT * FROM planner_days WHERE user_id = ? AND day = ?', [$uid, $date]) ?: [];
    $manual = decode_blocks($d['blocks'] ?? null);
    $auto = session_slots(sessions_between($uid, $date, $date), $date);
    $sum = day_summary($auto, $manual);
    $live = $date === date('Y-m-d') ? (study_today([$uid])[$uid]['studyingSince'] ?? null) : null;
    $liveSubject = $live ? val('SELECT subject_id FROM study_sessions WHERE user_id = ? AND ended_at IS NULL', [$uid]) : null;
    $friendsSharing = [];
    if ($mine) {
        $fr = friend_ids($me);
        if ($fr) {
            $ids = array_map('intval', array_column(rows("SELECT id FROM users WHERE planner_vis = 'friends' AND id IN (" . in_list($fr) . ')', $fr), 'id'));
            $friendsSharing = array_values(users_by_ids($ids));
        }
    }
    return [
        'date' => $date, 'today' => date('Y-m-d'), 'mine' => $mine,
        'owner' => users_by_ids([$uid])[$uid] ?? null,
        'vis' => val('SELECT planner_vis FROM users WHERE id = ?', [$uid]),
        'goalMin' => isset($d['goal_min']) ? (int)$d['goal_min'] : null,
        'mood' => isset($d['mood']) ? (int)$d['mood'] : null,
        'rating' => isset($d['rating']) ? (int)$d['rating'] : null,
        'reflection' => $d['reflection'] ?? '',
        'decos' => decos_of($d['decos'] ?? null), 'photos' => array_values(planner_photos_of($uid, $date, $date)),
        'blocks' => (object)$manual, 'auto' => (object)$auto, 'minutes' => $sum['minutes'], 'bySubject' => $sum['bySubject'],
        'studySeconds' => study_seconds([$uid], $date, $date)[$uid] ?? 0,
        'studyingSince' => $live, 'studyingSubject' => $liveSubject !== null ? (int)$liveSubject : null,
        'todos' => todos_out(rows('SELECT * FROM planner_todos WHERE user_id = ? AND day = ? ORDER BY sort, id', [$uid, $date])),
        'tasks' => $mine ? my_tasks_on($me, $date) : [],
        'subjects' => subjects_of($uid),
        'ddays' => ddays_of($uid, $date),
        'friendsSharing' => $friendsSharing,
        'cover' => cover_of($uid, substr($date, 0, 7)),
    ];
});

/* 목표·기분·만족도·돌아보기 (보낸 것만 바꿔요) */
route('planner.save', 'POST', function (int $me) {
    $date = date_arg('date');
    q('INSERT IGNORE INTO planner_days (user_id, day) VALUES (?, ?)', [$me, $date]);
    $set = []; $p = [];
    if (arg('goalMin', '__') !== '__') { $g = arg('goalMin'); $set[] = 'goal_min = ?'; $p[] = $g === null || $g === '' ? null : max(0, min(1440, (int)$g)); }
    if (arg('mood', '__') !== '__') { $m = arg('mood'); $set[] = 'mood = ?'; $p[] = $m ? max(1, min(5, (int)$m)) : null; }
    if (arg('rating', '__') !== '__') { $r = arg('rating'); $set[] = 'rating = ?'; $p[] = $r ? max(1, min(5, (int)$r)) : null; }
    if (arg('reflection', '__') !== '__') { $set[] = 'reflection = ?'; $p[] = str_arg('reflection', 500); }
    if ($set) q('UPDATE planner_days SET ' . implode(', ', $set) . ' WHERE user_id = ? AND day = ?', array_merge($p, [$me, $date]));
    return ['ok' => true];
});

/* 타임테이블 손으로 칠하기: blocks = {칸: 과목id(0=과목 없음, -1=지움)} 전체를 보내요 */
route('planner.blocks', 'POST', function (int $me) {
    $date = date_arg('date');
    $in = arg('blocks', []);
    if (!is_array($in)) fail(400, '타임테이블이 잘못됐어요');
    $ok = array_flip(subject_ids($me));
    $out = [];
    foreach ($in as $k => $v) {
        $k = (int)$k; $v = (int)$v;
        if ($k < 0 || $k >= PLAN_SLOTS) continue;
        if ($v > 0 && !isset($ok[$v])) continue;
        $out[$k] = max(-1, $v);
    }
    ksort($out);
    q('INSERT INTO planner_days (user_id, day, blocks) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE blocks = VALUES(blocks)', [$me, $date, $out ? json_encode($out) : null]);
    return ['ok' => true];
});

/* 플래너 할 일 (계획에 없는 간단한 할 일) */
route('planner.todo_add', 'POST', function (int $me) {
    $date = date_arg('date');
    $text = str_arg('text', 120, true, '할 일');
    $sid = int_arg('subjectId', false);
    if ($sid && !in_array($sid, subject_ids($me), true)) $sid = null;
    if ((int)val('SELECT COUNT(*) FROM planner_todos WHERE user_id = ? AND day = ?', [$me, $date]) >= 50) fail(400, '하루 할 일은 50개까지예요');
    $sort = (int)val('SELECT COALESCE(MAX(sort), 0) + 1 FROM planner_todos WHERE user_id = ? AND day = ?', [$me, $date]);
    q('INSERT INTO planner_todos (user_id, day, text, subject_id, sort) VALUES (?, ?, ?, ?, ?)', [$me, $date, $text, $sid ?: null, $sort]);
    return ['todo' => todos_out([row('SELECT * FROM planner_todos WHERE id = ?', [(int)db()->lastInsertId()])])[0]];
});
route('planner.todo_toggle', 'POST', function (int $me) {
    $state = arg('state', null);
    $state = $state === null ? (arg('done', false) ? 1 : 0) : max(0, min(3, (int)$state));
    q('UPDATE planner_todos SET done = ? WHERE id = ? AND user_id = ?', [$state, int_arg('id'), $me]);
    return ['ok' => true];
});
route('planner.todo_edit', 'POST', function (int $me) {
    $sid = int_arg('subjectId', false);
    if ($sid && !in_array($sid, subject_ids($me), true)) $sid = null;
    q('UPDATE planner_todos SET text = ?, subject_id = ? WHERE id = ? AND user_id = ?', [str_arg('text', 120, true, '할 일'), $sid ?: null, int_arg('id'), $me]);
    return ['ok' => true];
});
route('planner.todo_del', 'POST', function (int $me) {
    q('DELETE FROM planner_todos WHERE id = ? AND user_id = ?', [int_arg('id'), $me]);
    return ['ok' => true];
});
/* 못 끝낸 할 일을 다른 날로 옮기기 */
route('planner.todo_move', 'POST', function (int $me) {
    q('UPDATE planner_todos SET day = ?, done = 0 WHERE id = ? AND user_id = ?', [date_arg('to'), int_arg('id'), $me]);
    return ['ok' => true];
});

/* 과목 (타임테이블 색) */
route('planner.subject_save', 'POST', function (int $me) {
    $id = int_arg('id', false);
    $name = str_arg('name', 20, true, '과목 이름');
    $color = color_arg('color');
    if ($id) {
        q('UPDATE planner_subjects SET name = ?, color = ? WHERE id = ? AND user_id = ?', [$name, $color, $id, $me]);
    } else {
        if ((int)val('SELECT COUNT(*) FROM planner_subjects WHERE user_id = ?', [$me]) >= 20) fail(400, '과목은 20개까지예요');
        $sort = (int)val('SELECT COALESCE(MAX(sort), 0) + 1 FROM planner_subjects WHERE user_id = ?', [$me]);
        q('INSERT INTO planner_subjects (user_id, name, color, sort) VALUES (?, ?, ?, ?)', [$me, $name, $color, $sort]);
        $id = (int)db()->lastInsertId();
    }
    return ['subjects' => subjects_of($me), 'id' => $id];
});
route('planner.subject_del', 'POST', function (int $me) {
    $id = int_arg('id');
    q('DELETE FROM planner_subjects WHERE id = ? AND user_id = ?', [$id, $me]);
    q('UPDATE study_sessions SET subject_id = NULL WHERE user_id = ? AND subject_id = ?', [$me, $id]);
    return ['subjects' => subjects_of($me)];
});

/* 꾸미기 저장: 그날 붙인 것 전체를 보내요 */
route('planner.decos', 'POST', function (int $me) {
    $date = date_arg('date');
    $decos = clean_decos(arg('decos', []), $me, $date);
    q('INSERT INTO planner_days (user_id, day, decos) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE decos = VALUES(decos)', [$me, $date, $decos ? json_encode($decos, JSON_UNESCAPED_UNICODE) : null]);
    return ['decos' => $decos];
});
/* 꾸미기 사진 올리기: 화면에서 JPEG 로 줄여서 큰 것·작은 것 두 장 */
route('planner.photo_add', 'POST', function (int $me) {
    $date = date_arg('date');
    if ((int)val('SELECT COUNT(*) FROM planner_photos WHERE user_id = ? AND day = ?', [$me, $date]) >= 8) fail(400, '하루에 사진은 8장까지 붙일 수 있어요');
    [$big, $w, $hh] = decode_jpeg((string)arg('image', ''), 900 * 1024, 1600);
    [$small] = decode_jpeg((string)arg('thumb', ''), 200 * 1024, 640);
    $dir = planner_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail(500, '사진을 저장할 폴더를 만들지 못했어요 (uploads 폴더 권한 확인)');
    $base = $me . '_' . bin2hex(random_bytes(8));
    if (@file_put_contents("$dir/$base.jpg", $big) === false || @file_put_contents("$dir/{$base}_t.jpg", $small) === false) fail(500, '사진을 저장하지 못했어요 (uploads 폴더 권한 확인)');
    q('INSERT INTO planner_photos (user_id, day, file, thumb, w, h) VALUES (?, ?, ?, ?, ?, ?)', [$me, $date, "$base.jpg", "{$base}_t.jpg", $w, $hh]);
    $id = (int)db()->lastInsertId();
    return ['photo' => ['id' => $id, 'day' => $date, 'w' => $w, 'h' => $hh]];
});
route('planner.photo_del', 'POST', function (int $me) {
    $p = row('SELECT * FROM planner_photos WHERE id = ? AND user_id = ?', [int_arg('id'), $me]);
    if (!$p) fail(404, '사진을 찾을 수 없어요');
    planner_delete_photo_files($p);
    q('DELETE FROM planner_photos WHERE id = ?', [$p['id']]);
    // 붙여 둔 자리도 떼어 내요
    $d = row('SELECT decos FROM planner_days WHERE user_id = ? AND day = ?', [$me, $p['day']]);
    if ($d) {
        $left = array_values(array_filter(decos_of($d['decos']), fn($x) => !($x['k'] === 'ph' && (int)$x['v'] === (int)$p['id'])));
        q('UPDATE planner_days SET decos = ? WHERE user_id = ? AND day = ?', [$left ? json_encode($left, JSON_UNESCAPED_UNICODE) : null, $me, $p['day']]);
    }
    return ['ok' => true];
});
/* 사진 보기: 내 것, 또는 플래너를 친구 공개한 친구 것 */
route('planner.photo', 'GET', function (int $me) {
    $p = row('SELECT p.*, u.planner_vis FROM planner_photos p JOIN users u ON u.id = p.user_id WHERE p.id = ?', [int_arg('id')]);
    if (!$p || ((int)$p['user_id'] !== $me && !($p['planner_vis'] === 'friends' && is_friend($me, (int)$p['user_id'])))) fail(404, '사진을 찾을 수 없어요');
    $name = basename((string)(($_GET['size'] ?? '') === 'full' ? $p['file'] : $p['thumb']));
    $f = planner_dir() . '/' . $name;
    if (!preg_match('/^[A-Za-z0-9_]+\.jpg$/', $name) || !is_file($f)) fail(404, '사진 파일이 없어요');
    header('Content-Type: image/jpeg');
    header('Cache-Control: private, max-age=604800');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($f));
    readfile($f);
    exit;
});

/* 플래너 북 표지: 디자인 8종 중 하나 + 좌우명 (달마다) */
const COVER_STYLES = ['lavender', 'strawberry', 'mint', 'lemon', 'night', 'oat', 'matcha', 'mono',
    'cute', 'classic-ivory', 'classic-green', 'classic-wine', 'classic-plaid', 'modern', 'fem-ribbon', 'fem-tulip'];   // 뒤 8종은 그림 표지 + 같은 분위기 속지
function cover_of(int $uid, string $ym): array {
    $c = row('SELECT style, motto FROM planner_covers WHERE user_id = ? AND ym = ?', [$uid, $ym]);
    // 고르지 않은 달은 그림 다이어리 8종을 차례로
    return $c ? ['style' => $c['style'], 'motto' => $c['motto']] : ['style' => COVER_STYLES[8 + ((int)substr($ym, 5, 2) - 1) % 8], 'motto' => ''];
}
route('planner.cover_save', 'POST', function (int $me) {
    $ym = (string)arg('ym', '');
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) fail(400, '달이 잘못됐어요');
    $style = (string)arg('style', '');
    if (!in_array($style, COVER_STYLES, true)) fail(400, '없는 표지예요');
    $motto = str_arg('motto', 40);
    q('INSERT INTO planner_covers (user_id, ym, style, motto) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE style = VALUES(style), motto = VALUES(motto)', [$me, $ym, $style, $motto]);
    return ['cover' => cover_of($me, $ym)];
});

/* 플래너 공개 범위 */
route('planner.vis', 'POST', function (int $me) {
    $v = arg('vis', 'private') === 'friends' ? 'friends' : 'private';
    q('UPDATE users SET planner_vis = ? WHERE id = ?', [$v, $me]);
    return ['vis' => $v];
});

/* D-day */
route('dday.save', 'POST', function (int $me) {
    $id = int_arg('id', false);
    $title = str_arg('title', 40, true, 'D-day 이름');
    $day = date_arg('day');
    $color = color_arg('color', '#f04452');
    if ($id) q('UPDATE ddays SET title = ?, day = ?, color = ? WHERE id = ? AND user_id = ?', [$title, $day, $color, $id, $me]);
    else {
        if ((int)val('SELECT COUNT(*) FROM ddays WHERE user_id = ?', [$me]) >= 50) fail(400, 'D-day는 50개까지예요');
        q('INSERT INTO ddays (user_id, title, day, color) VALUES (?, ?, ?, ?)', [$me, $title, $day, $color]);
    }
    return ['ddays' => ddays_of($me, date('Y-m-d'))];
});
route('dday.del', 'POST', function (int $me) {
    q('DELETE FROM ddays WHERE id = ? AND user_id = ?', [int_arg('id'), $me]);
    return ['ddays' => ddays_of($me, date('Y-m-d'))];
});

/* 여러 날 요약 (주간 보기·플래너 북) */
function planner_range(int $uid, int $me, string $from, string $to, bool $detail): array {
    $days = [];
    foreach (rows('SELECT * FROM planner_days WHERE user_id = ? AND day BETWEEN ? AND ?', [$uid, $from, $to]) as $d) $days[$d['day']] = $d;
    $todos = [];
    foreach (rows('SELECT * FROM planner_todos WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY sort, id', [$uid, $from, $to]) as $t) $todos[$t['day']][] = $t;
    $sessions = sessions_between($uid, $from, $to);
    $secs = [];
    foreach (rows('SELECT DATE(started_at) d, SUM(seconds) s FROM study_sessions WHERE user_id = ? AND started_at >= ? AND started_at < ? + INTERVAL 1 DAY GROUP BY DATE(started_at)', [$uid, $from, $to]) as $r) $secs[$r['d']] = (int)$r['s'];
    $tasks = [];
    if ($uid === $me && function_exists('tasks_between')) {
        foreach (tasks_between($me, $from, $to) as $t) {
            if (empty($t['mine'])) continue;
            if ($t['kind'] === 'group') $t['done'] = in_array($me, $t['checks'], true);
            unset($t['people']);
            $tasks[$t['date'] ?? $t['dueDate'] ?? ''][] = $t;
        }
    }
    $out = [];
    for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
        $date = date('Y-m-d', $t);
        $d = $days[$date] ?? [];
        $sum = day_summary(session_slots($sessions, $date), decode_blocks($d['blocks'] ?? null));
        $td = $todos[$date] ?? [];
        $tk = $tasks[$date] ?? [];
        $row = ['date' => $date, 'minutes' => $sum['minutes'], 'bySubject' => $sum['bySubject'], 'studySeconds' => $secs[$date] ?? 0,
                'goalMin' => isset($d['goal_min']) ? (int)$d['goal_min'] : null, 'mood' => isset($d['mood']) ? (int)$d['mood'] : null,
                'rating' => isset($d['rating']) ? (int)$d['rating'] : null,
                'todoDone' => count(array_filter($td, fn($x) => (int)$x['done'] === 1)) + count(array_filter($tk, fn($x) => !empty($x['done']))),
                'decoCount' => count(decos_of($d['decos'] ?? null)),
                'todoTotal' => count($td) + count($tk)];
        if ($detail) $row += ['reflection' => $d['reflection'] ?? '', 'slots' => (object)$sum['merged'], 'todos' => todos_out($td), 'decos' => decos_of($d['decos'] ?? null),
                              'tasks' => array_map(fn($x) => ['content' => $x['content'], 'subject' => $x['subject'] ?? '', 'done' => !empty($x['done']), 'planColor' => $x['planColor'] ?? null], $tk)];
        $out[] = $row;
    }
    return $out;
}
route('planner.week', 'GET', function (int $me) {
    $uid = planner_owner($me);
    $start = date_arg('start');
    $start = date('Y-m-d', strtotime($start . ' -' . ((int)date('N', strtotime($start)) - 1) . ' days'));   // 그 주 월요일
    return ['start' => $start, 'days' => planner_range($uid, $me, $start, date('Y-m-d', strtotime($start . ' +6 days')), false),
            'subjects' => subjects_of($uid), 'owner' => users_by_ids([$uid])[$uid] ?? null, 'mine' => $uid === $me];
});
route('planner.month', 'GET', function (int $me) {
    $uid = planner_owner($me);
    $ym = (string)arg('ym', date('Y-m'));
    if (!preg_match('/^(\d{4})-(\d{2})$/', $ym, $m) || !checkdate((int)$m[2], 1, (int)$m[1])) fail(400, '달이 잘못됐어요');
    $from = "$ym-01"; $to = date('Y-m-t', strtotime($from));
    return ['ym' => $ym, 'days' => planner_range($uid, $me, $from, $to, true), 'subjects' => subjects_of($uid), 'photos' => (object)planner_photos_of($uid, $from, $to),
            'owner' => users_by_ids([$uid])[$uid] ?? null, 'mine' => $uid === $me, 'today' => date('Y-m-d'), 'cover' => cover_of($uid, $ym),
            'ddays' => array_values(array_filter(ddays_of($uid, $from), fn($x) => $x['day'] <= $to))];
});
/* 책장: 기록이 있는 달들 */
route('planner.months', 'GET', function (int $me) {
    $uid = planner_owner($me);
    $rows = rows("SELECT ym, SUM(n) n FROM (
        SELECT DATE_FORMAT(day, '%Y-%m') ym, COUNT(*) n FROM planner_days WHERE user_id = ? GROUP BY ym
        UNION ALL SELECT DATE_FORMAT(day, '%Y-%m'), COUNT(*) FROM planner_todos WHERE user_id = ? GROUP BY DATE_FORMAT(day, '%Y-%m')
        UNION ALL SELECT DATE_FORMAT(started_at, '%Y-%m'), COUNT(*) FROM study_sessions WHERE user_id = ? GROUP BY DATE_FORMAT(started_at, '%Y-%m')
      ) t GROUP BY ym ORDER BY ym DESC LIMIT 60", [$uid, $uid, $uid]);
    $mins = [];
    foreach (rows("SELECT DATE_FORMAT(started_at, '%Y-%m') ym, SUM(seconds) s FROM study_sessions WHERE user_id = ? GROUP BY ym", [$uid]) as $r) $mins[$r['ym']] = intdiv((int)$r['s'], 60);
    $cur = date('Y-m');
    $list = array_map(fn($r) => ['ym' => $r['ym'], 'entries' => (int)$r['n'], 'studyMinutes' => $mins[$r['ym']] ?? 0, 'current' => $r['ym'] === $cur], $rows);
    if (!array_filter($list, fn($x) => $x['current'])) array_unshift($list, ['ym' => $cur, 'entries' => 0, 'studyMinutes' => 0, 'current' => true]);
    foreach ($list as &$m) $m['cover'] = cover_of($uid, $m['ym']);
    unset($m);
    return ['months' => $list, 'owner' => users_by_ids([$uid])[$uid] ?? null, 'mine' => $uid === $me];
});
