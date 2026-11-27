<?php
declare(strict_types=1);
/* 친구와 1:1 메시지 */

/* 앱 전용 공부 스티커 (화면의 STICKERS 와 같은 이름) */
const STICKERS = ['fighting', 'allnight', 'coffee', 'pass', 'good', 'focus', 'rest', 'wow', 'thanks', 'together', 'sleepy', 'done'];

/* 그림 이모티콘 묶음: assets/stickers/packs.json 에 적힌 것만 보낼 수 있어요. 보낼 때는 '묶음/이름' 으로 보내요 */
function sticker_ok(string $key): bool {
    if (in_array($key, STICKERS, true)) return true;
    if (!preg_match('~^([a-z0-9_-]{1,40})/([a-z0-9_-]{1,60})$~', $key, $m)) return false;
    static $packs = null;
    if ($packs === null) {
        $j = @file_get_contents(dirname(__DIR__) . '/assets/stickers/packs.json');
        $packs = [];
        foreach ((json_decode((string)$j, true) ?: []) as $p) {
            if (!is_array($p) || !isset($p['key'], $p['items']) || !is_array($p['items'])) continue;
            foreach ($p['items'] as $it) if (is_array($it) && isset($it['key'])) $packs[$p['key'] . '/' . $it['key']] = true;
        }
    }
    return isset($packs[$key]);
}
/* 메시지 반응으로 쓸 수 있는 이모지 */
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

function msg_out(array $m, int $me): array {
    $o = ['id' => (int)$m['id'], 'from' => (int)$m['sender_id'], 'mine' => (int)$m['sender_id'] === $me,
          'kind' => $m['kind'] ?? 'text', 'body' => $m['body'], 'at' => $m['created_at'], 'read' => $m['read_at'] !== null];
    if (in_array($o['kind'], ['image', 'file'], true)) {
        $o['file'] = ['name' => (string)$m['file_name'], 'size' => (int)$m['file_size'], 'mime' => (string)$m['file_mime'], 'gone' => !$m['file_path']];
    }
    return $o;
}
/* 대화에서 최근 메시지들의 반응 {메시지id: [{u: 사람id, e: 이모지}]} */
function thread_reactions(int $me, int $fid): array {
    $ids = array_map('intval', array_column(rows('SELECT id FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY id DESC LIMIT 200',
        [$me, $fid, $fid, $me]), 'id'));
    $out = [];
    if (!$ids) return $out;
    foreach (rows('SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (' . in_list($ids) . ')', $ids) as $r) {
        $out[(int)$r['message_id']][] = ['u' => (int)$r['user_id'], 'e' => $r['emoji']];
    }
    return $out;
}
function require_friend(int $me, int $fid): void {
    if (!is_friend($me, $fid)) fail(403, '친구에게만 메시지를 보낼 수 있어요');
}

route('messages.threads', 'GET', function (int $me) {
    $rows = rows('SELECT u.id, u.display_name, u.color, u.avatar, u.last_seen,
        (SELECT MAX(m.id) FROM messages m WHERE (m.sender_id = ? AND m.receiver_id = u.id) OR (m.sender_id = u.id AND m.receiver_id = ?)) AS last_id,
        (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.receiver_id = ? AND m.read_at IS NULL) AS unread
        FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?', [$me, $me, $me, $me]);
    $lastIds = array_values(array_filter(array_map(fn($r) => (int)$r['last_id'], $rows)));
    $last = [];
    if ($lastIds) foreach (rows('SELECT * FROM messages WHERE id IN (' . in_list($lastIds) . ')', $lastIds) as $m) $last[(int)$m['id']] = $m;
    $threads = array_map(fn($r) => [
        'friend' => public_user($r) + ['lastSeen' => $r['last_seen']],
        'unread' => (int)$r['unread'],
        'last'   => $r['last_id'] && isset($last[(int)$r['last_id']]) ? msg_out($last[(int)$r['last_id']], $me) : null,
    ], $rows);
    usort($threads, fn($a, $b) => (($b['last']['id'] ?? 0) <=> ($a['last']['id'] ?? 0)) ?: strcmp($a['friend']['name'], $b['friend']['name']));
    return ['threads' => $threads];
});

/* after: 그 뒤 새 메시지 / before: 그 앞 예전 메시지 / 둘 다 없으면 최근 50개 */
route('messages.list', 'GET', function (int $me) {
    $fid = int_arg('with');
    require_friend($me, $fid);
    $after = int_arg('after', false);
    $before = int_arg('before', false);
    $pair = '((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))';
    $pp = [$me, $fid, $fid, $me];
    if ($after) {
        $list = rows("SELECT * FROM messages WHERE {$pair} AND id > ? ORDER BY id LIMIT 200", array_merge($pp, [$after]));
    } else {
        $sql = "SELECT * FROM messages WHERE {$pair}" . ($before ? ' AND id < ?' : '') . ' ORDER BY id DESC LIMIT 50';
        $list = array_reverse(rows($sql, $before ? array_merge($pp, [$before]) : $pp));
    }
    q('UPDATE messages SET read_at = NOW() WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL', [$fid, $me]);
    // 상대가 내 메시지를 어디까지 읽었는지
    $readUpTo = (int)val('SELECT COALESCE(MAX(id), 0) FROM messages WHERE sender_id = ? AND receiver_id = ? AND read_at IS NOT NULL', [$me, $fid]);
    return ['messages' => array_map(fn($m) => msg_out($m, $me), $list), 'readUpTo' => $readUpTo,
            'hasMore' => !$after && count($list) === 50, 'reactions' => (object)thread_reactions($me, $fid)];
});

route('messages.send', 'POST', function (int $me) {
    $fid = int_arg('to');
    require_friend($me, $fid);
    $kind = arg('kind', 'text') === 'sticker' ? 'sticker' : 'text';
    $body = str_arg('body', 2000, true, '메시지');
    if ($kind === 'sticker' && !sticker_ok($body)) fail(400, '없는 이모티콘이에요');
    $recent = (int)val('SELECT COUNT(*) FROM messages WHERE sender_id = ? AND created_at > NOW() - INTERVAL 1 MINUTE', [$me]);
    if ($recent >= 60) fail(429, '메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요');
    q('INSERT INTO messages (sender_id, receiver_id, kind, body) VALUES (?, ?, ?, ?)', [$me, $fid, $kind, $body]);
    return ['message' => msg_out(row('SELECT * FROM messages WHERE id = ?', [(int)db()->lastInsertId()]), $me)];
});

/* 메시지에 반응 달기 (같은 걸 다시 누르면 취소, emoji 가 비면 지우기) */
route('messages.react', 'POST', function (int $me) {
    $m = row('SELECT * FROM messages WHERE id = ?', [int_arg('id')]);
    if (!$m || ((int)$m['sender_id'] !== $me && (int)$m['receiver_id'] !== $me)) fail(404, '메시지를 찾을 수 없어요');
    $other = (int)$m['sender_id'] === $me ? (int)$m['receiver_id'] : (int)$m['sender_id'];
    require_friend($me, $other);
    $e = (string)arg('emoji', '');
    $cur = val('SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?', [$m['id'], $me]);
    if ($e === '' || $e === $cur) q('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?', [$m['id'], $me]);
    else {
        if (!in_array($e, REACTIONS, true)) fail(400, '쓸 수 없는 반응이에요');
        q('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE emoji = VALUES(emoji), created_at = NOW()', [$m['id'], $me, $e]);
    }
    return ['reactions' => (object)thread_reactions($me, $other)];
});


/* ===== 파일 보내기 (사진·동영상은 보내지 않아요. 예전에 보낸 사진은 그대로 볼 수 있어요) =====
   파일은 uploads/messages 에 아무 의미 없는 이름(.bin)으로 저장하고, 주고받은 두 사람만 messages.file 로 받을 수 있어요 */
const MSG_FILE_MAX = 20 * 1024 * 1024;   // 20MB (호스팅 업로드 한도가 더 작으면 그 한도까지)
const MSG_FILE_EXT = ['pdf', 'hwp', 'hwpx', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'md', 'zip',
                      'mp3', 'm4a', 'wav', 'key', 'pages', 'numbers'];
/* 막는 사진·동영상 확장자 (안내 문구용) */
const MSG_MEDIA_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg', 'avif',
                       'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v', '3gp', 'flv'];

function msg_dir(): string { return dirname(__DIR__) . '/uploads/messages'; }
function ini_bytes(string $v): int {
    $v = trim($v); if ($v === '') return 0;
    $n = (int)$v; $u = strtolower(substr($v, -1));
    return $u === 'g' ? $n * 1073741824 : ($u === 'm' ? $n * 1048576 : ($u === 'k' ? $n * 1024 : $n));
}
function upload_limit(): int {
    $l = MSG_FILE_MAX;
    foreach (['upload_max_filesize', 'post_max_size'] as $k) { $b = ini_bytes((string)ini_get($k)); if ($b > 0) $l = min($l, $b); }
    return $l;
}
function human_size(int $b): string { return $b >= 1048576 ? round($b / 1048576, 1) . 'MB' : max(1, (int)round($b / 1024)) . 'KB'; }
function msg_delete_files(array $m): void {
    foreach (['file_path', 'file_thumb'] as $k) {
        $n = basename((string)($m[$k] ?? ''));
        if ($n !== '' && preg_match('/^[A-Za-z0-9_]+\.(bin|jpg)$/', $n) && is_file(msg_dir() . '/' . $n)) @unlink(msg_dir() . '/' . $n);
    }
}
/* 회원 탈퇴: 그 사람이 주고받은 메시지 파일도 지워요 (메시지 줄은 DB 가 같이 지워요) */
function msg_delete_user_files(int $uid): void {
    foreach (rows('SELECT file_path, file_thumb FROM messages WHERE (sender_id = ? OR receiver_id = ?) AND file_path IS NOT NULL', [$uid, $uid]) as $m) msg_delete_files($m);
}

route('messages.limits', 'GET', fn(int $me) => ['maxBytes' => upload_limit(), 'maxLabel' => human_size(upload_limit()), 'ext' => MSG_FILE_EXT]);

/* multipart/form-data: to, file */
route('messages.upload', 'POST', function (int $me) {
    if (empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) fail(413, '파일이 너무 커요. ' . human_size(upload_limit()) . ' 이하로 보내 주세요');
    $fid = (int)($_POST['to'] ?? 0);
    require_friend($me, $fid);
    if (($_POST['kind'] ?? 'file') !== 'file') fail(400, '사진·동영상은 보낼 수 없어요. 대신 이모티콘을 써 보세요');
    $kind = 'file';
    $f = $_FILES['file'] ?? null;
    if (!$f || !is_array($f) || is_array($f['error'])) fail(400, '보낼 파일을 골라 주세요');
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) fail(413, '파일이 너무 커요. ' . human_size(upload_limit()) . ' 이하로 보내 주세요');
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fail(400, '파일을 받지 못했어요. 다시 보내 주세요');
    $size = (int)$f['size'];
    if ($size <= 0) fail(400, '빈 파일은 보낼 수 없어요');
    if ($size > MSG_FILE_MAX) fail(413, '파일은 ' . human_size(MSG_FILE_MAX) . '까지 보낼 수 있어요');
    $name = mb_substr(trim(str_replace(["\0", '/', '\\'], '', (string)$f['name'])), 0, 200) ?: 'file';
    $recent = (int)val("SELECT COUNT(*) FROM messages WHERE sender_id = ? AND kind IN ('image','file') AND created_at > NOW() - INTERVAL 1 MINUTE", [$me]);
    if ($recent >= 20) fail(429, '파일을 너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요');
    $dir = msg_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail(500, '파일을 저장할 폴더를 만들지 못했어요 (uploads 폴더 권한 확인)');
    $base = $me . '_' . bin2hex(random_bytes(10));
    $mime = 'application/octet-stream';
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (in_array($ext, MSG_MEDIA_EXT, true)) fail(400, '사진·동영상은 보낼 수 없어요. 대신 이모티콘을 써 보세요');
    if (!in_array($ext, MSG_FILE_EXT, true)) fail(400, '이 종류의 파일은 보낼 수 없어요 (' . ($ext ?: '확장자 없음') . ')');
    if (!move_uploaded_file($f['tmp_name'], "$dir/$base.bin")) fail(500, '파일을 저장하지 못했어요 (uploads 폴더 권한 확인)');
    q('INSERT INTO messages (sender_id, receiver_id, kind, body, file_name, file_path, file_thumb, file_size, file_mime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [$me, $fid, $kind, $name, $name, "$base.bin", null, $size, $mime]);
    return ['message' => msg_out(row('SELECT * FROM messages WHERE id = ?', [(int)db()->lastInsertId()]), $me)];
});

/* 받기: 주고받은 두 사람만. thumb=1 작은 사진, dl=1 내려받기 */
route('messages.file', 'GET', function (int $me) {
    $m = row('SELECT * FROM messages WHERE id = ?', [int_arg('id')]);
    if (!$m || !in_array($m['kind'], ['image', 'file'], true) || ((int)$m['sender_id'] !== $me && (int)$m['receiver_id'] !== $me)) fail(404, '파일을 찾을 수 없어요');
    $useThumb = !empty($_GET['thumb']) && $m['file_thumb'];
    $n = basename((string)($useThumb ? $m['file_thumb'] : $m['file_path']));
    $f = msg_dir() . '/' . $n;
    if ($n === '' || !preg_match('/^[A-Za-z0-9_]+\.(bin|jpg)$/', $n) || !is_file($f)) fail(404, '파일이 없어요');
    $isImg = $m['kind'] === 'image';
    header('Content-Type: ' . ($isImg ? 'image/jpeg' : 'application/octet-stream'));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=604800');
    if (!$isImg || !empty($_GET['dl'])) {
        /* 내려받기: attachment + octet-stream + nosniff 라 브라우저가 열지 않아요.
           (sandbox CSP를 붙이면 크롬이 파일 이름을 'download'로 바꿔 버려요) */
        $fn = (string)$m['file_name'];
        $ascii = preg_replace('/[^A-Za-z0-9._-]+/u', '_', $fn) ?: 'file';
        header('Content-Type: application/octet-stream');
        header("Content-Disposition: attachment; filename=\"$ascii\"; filename*=UTF-8''" . rawurlencode($fn));
    }
    else header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Content-Length: ' . filesize($f));
    readfile($f);
    exit;
});
