<?php
declare(strict_types=1);
/* 하루 기록: 날짜마다 내 메모와 사진(최대 4장)
   공개 범위: private(나만) / friends(내 친구 모두)
   사진 파일은 uploads/journal 에 있지만 바깥에서 직접 열 수 없고, journal.photo 가 권한을 확인한 뒤 보내 줘요 */

const JOURNAL_MAX_PHOTOS = 4;

function journal_dir(): string { return dirname(__DIR__) . '/uploads/journal'; }
function journal_can_see(array $note, int $me): bool {
    if ((int)$note['user_id'] === $me) return true;
    return $note['visibility'] === 'friends' && is_friend($me, (int)$note['user_id']);
}
function journal_out(array $n, int $me, array $photos): array {
    $own = (int)$n['user_id'] === $me;
    return ['id' => (int)$n['id'], 'day' => $n['day'], 'memo' => $n['memo'], 'mine' => $own,
            'visibility' => $own ? $n['visibility'] : null, 'updatedAt' => $n['updated_at'],
            'photos' => array_map(fn($p) => ['id' => (int)$p['id'], 'w' => (int)$p['width'], 'h' => (int)$p['height']], $photos)];
}
function journal_photos(array $noteIds): array {
    $m = [];
    if (!$noteIds) return $m;
    foreach (rows('SELECT * FROM day_photos WHERE note_id IN (' . in_list($noteIds) . ') ORDER BY id', $noteIds) as $p) $m[(int)$p['note_id']][] = $p;
    return $m;
}
/* 내 기록(없으면 만들기) */
function journal_upsert(int $me, string $day, ?string $memo = null, ?string $vis = null): array {
    $n = row('SELECT * FROM day_notes WHERE user_id = ? AND day = ?', [$me, $day]);
    if (!$n) {
        q('INSERT INTO day_notes (user_id, day, memo, visibility) VALUES (?, ?, ?, ?)', [$me, $day, $memo ?? '', $vis ?? 'friends']);
        return row('SELECT * FROM day_notes WHERE id = ?', [(int)db()->lastInsertId()]);
    }
    if ($memo !== null || $vis !== null) {
        q('UPDATE day_notes SET memo = ?, visibility = ? WHERE id = ?', [$memo ?? $n['memo'], $vis ?? $n['visibility'], $n['id']]);
        $n = row('SELECT * FROM day_notes WHERE id = ?', [$n['id']]);
    }
    return $n;
}
/* 메모도 사진도 없으면 기록을 지워요 */
function journal_cleanup(int $noteId): void {
    $n = row('SELECT memo FROM day_notes WHERE id = ?', [$noteId]);
    if ($n && trim($n['memo']) === '' && !val('SELECT id FROM day_photos WHERE note_id = ? LIMIT 1', [$noteId])) q('DELETE FROM day_notes WHERE id = ?', [$noteId]);
}
function journal_delete_files(array $photo): void {
    foreach (['file', 'thumb'] as $k) {
        $f = journal_dir() . '/' . basename((string)$photo[$k]);
        if (preg_match('/^[A-Za-z0-9_]+\.jpg$/', basename((string)$photo[$k])) && is_file($f)) @unlink($f);
    }
}
/* 회원 탈퇴할 때 그 사람 사진 파일도 지우기 */
function journal_delete_user_files(int $uid): void {
    foreach (rows('SELECT p.* FROM day_photos p JOIN day_notes n ON n.id = p.note_id WHERE n.user_id = ?', [$uid]) as $p) journal_delete_files($p);
}
/* data:image/jpeg;base64,... 를 검사해서 [바이트, 너비, 높이] */
function decode_jpeg(string $data, int $maxBytes, int $maxSide): array {
    if (!preg_match('#^data:image/jpeg;base64,([A-Za-z0-9+/=]+)$#', $data, $m)) fail(400, '사진 형식이 잘못됐어요');
    $bin = base64_decode($m[1], true);
    if ($bin === false || strlen($bin) > $maxBytes) fail(400, '사진이 너무 커요');
    $info = @getimagesizefromstring($bin);
    if (!$info || ($info['mime'] ?? '') !== 'image/jpeg' || $info[0] < 16 || $info[1] < 16 || $info[0] > $maxSide || $info[1] > $maxSide) fail(400, '사진을 읽지 못했어요. 다른 사진으로 해 주세요');
    return [$bin, (int)$info[0], (int)$info[1]];
}

/* 그날 내 기록 + 친구들 기록 */
route('journal.get', 'GET', function (int $me) {
    $day = date_arg('date');
    $friends = friend_ids($me);
    $notes = rows("SELECT * FROM day_notes WHERE day = ? AND (user_id = ? OR (visibility = 'friends' AND user_id IN (SELECT friend_id FROM friendships WHERE user_id = ?)))", [$day, $me, $me]);
    $photos = journal_photos(array_map(fn($n) => (int)$n['id'], $notes));
    $users = users_by_ids(array_column($notes, 'user_id'));
    $mine = null; $others = [];
    foreach ($notes as $n) {
        $o = journal_out($n, $me, $photos[(int)$n['id']] ?? []);
        if ((int)$n['user_id'] === $me) $mine = $o; else $others[] = ['user' => $users[(int)$n['user_id']] ?? null, 'note' => $o];
    }
    return ['mine' => $mine, 'friends' => $others];
});

/* 캘린더용: 기간 동안 날짜별 내 사진 한 장·메모 여부, 친구 기록 수 */
route('journal.month', 'GET', function (int $me) {
    $from = date_arg('from'); $to = date_arg('to');
    if ((strtotime($to) - strtotime($from)) > 62 * 86400) fail(400, '한 번에 62일까지만 불러올 수 있어요');
    $notes = rows("SELECT id, user_id, day, memo <> '' AS has_memo FROM day_notes WHERE day BETWEEN ? AND ?
                   AND (user_id = ? OR (visibility = 'friends' AND user_id IN (SELECT friend_id FROM friendships WHERE user_id = ?)))", [$from, $to, $me, $me]);
    $first = [];
    $ids = array_map(fn($n) => (int)$n['id'], $notes);
    if ($ids) foreach (rows('SELECT note_id, MIN(id) pid, COUNT(*) n FROM day_photos WHERE note_id IN (' . in_list($ids) . ') GROUP BY note_id', $ids) as $r) $first[(int)$r['note_id']] = [(int)$r['pid'], (int)$r['n']];
    $days = [];
    foreach ($notes as $n) {
        $d = $n['day'];
        if (!isset($days[$d])) $days[$d] = ['mine' => null, 'friends' => 0];
        if ((int)$n['user_id'] === $me) $days[$d]['mine'] = ['photo' => $first[(int)$n['id']][0] ?? null, 'photos' => $first[(int)$n['id']][1] ?? 0, 'memo' => (bool)$n['has_memo']];
        else $days[$d]['friends']++;
    }
    return ['days' => (object)$days];
});

route('journal.save', 'POST', function (int $me) {
    $day = date_arg('date');
    $memo = arg('memo', '');
    if (!is_string($memo)) fail(400, '메모가 잘못됐어요');
    $memo = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', str_replace("\r\n", "\n", $memo)) ?? '';
    if (mb_strlen($memo) > 3000) fail(400, '메모는 3000자까지 쓸 수 있어요');
    $vis = arg('visibility', 'friends') === 'private' ? 'private' : 'friends';
    $n = journal_upsert($me, $day, $memo, $vis);
    journal_cleanup((int)$n['id']);
    $n = row('SELECT * FROM day_notes WHERE id = ?', [$n['id']]);
    return ['note' => $n ? journal_out($n, $me, journal_photos([(int)$n['id']])[(int)$n['id']] ?? []) : null];
});

/* 사진 올리기: 화면에서 긴 변 1600px 큰 사진과 480px 작은 사진을 만들어 같이 보내요 */
route('journal.photo_add', 'POST', function (int $me) {
    $day = date_arg('date');
    [$big, $w, $hh] = decode_jpeg((string)arg('image', ''), 2 * 1024 * 1024, 2048);
    [$small] = decode_jpeg((string)arg('thumb', ''), 300 * 1024, 640);
    $n = journal_upsert($me, $day, null, arg('visibility', null) === 'private' ? 'private' : null);
    if ((int)val('SELECT COUNT(*) FROM day_photos WHERE note_id = ?', [$n['id']]) >= JOURNAL_MAX_PHOTOS) fail(400, '사진은 하루에 ' . JOURNAL_MAX_PHOTOS . '장까지 올릴 수 있어요');
    $dir = journal_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail(500, '사진을 저장할 폴더를 만들지 못했어요 (uploads 폴더 권한 확인)');
    $base = $me . '_' . bin2hex(random_bytes(8));
    if (@file_put_contents("$dir/$base.jpg", $big) === false || @file_put_contents("$dir/{$base}_t.jpg", $small) === false) {
        @unlink("$dir/$base.jpg");
        fail(500, '사진을 저장하지 못했어요 (uploads 폴더 권한 확인)');
    }
    q('INSERT INTO day_photos (note_id, file, thumb, width, height) VALUES (?, ?, ?, ?, ?)', [$n['id'], "$base.jpg", "{$base}_t.jpg", $w, $hh]);
    $n = row('SELECT * FROM day_notes WHERE id = ?', [$n['id']]);
    return ['note' => journal_out($n, $me, journal_photos([(int)$n['id']])[(int)$n['id']] ?? [])];
});

route('journal.photo_remove', 'POST', function (int $me) {
    $p = row('SELECT p.*, n.user_id FROM day_photos p JOIN day_notes n ON n.id = p.note_id WHERE p.id = ?', [int_arg('id')]);
    if (!$p || (int)$p['user_id'] !== $me) fail(404, '사진을 찾을 수 없어요');
    q('DELETE FROM day_photos WHERE id = ?', [$p['id']]);
    journal_delete_files($p);
    $noteId = (int)$p['note_id'];
    journal_cleanup($noteId);
    $n = row('SELECT * FROM day_notes WHERE id = ?', [$noteId]);
    return ['note' => $n ? journal_out($n, $me, journal_photos([$noteId])[$noteId] ?? []) : null];
});

/* 사진 보내기: 볼 권한이 있을 때만 (주소를 알아도 남은 못 봐요) */
route('journal.photo', 'GET', function (int $me) {
    $p = row('SELECT p.*, n.user_id, n.visibility FROM day_photos p JOIN day_notes n ON n.id = p.note_id WHERE p.id = ?', [int_arg('id')]);
    if (!$p || !journal_can_see($p, $me)) fail(404, '사진을 찾을 수 없어요');
    $name = basename((string)(($_GET['size'] ?? '') === 'full' ? $p['file'] : $p['thumb']));
    $f = journal_dir() . '/' . $name;
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
