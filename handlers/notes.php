<?php
declare(strict_types=1);
/* 같이 쓰는 메모장. 공유받은 사람도 고칠 수 있고, 동시에 고치면 version 으로 충돌을 알려 줘요 */

/* 마지막으로 고친 사람. 나와 친구가 아니면 이름을 숨겨요 (친구 목록은 각자 비밀) */
function note_editor(array $n, int $me, array $users): ?array {
    if (!$n['updated_by']) return null;
    $u = (int)$n['updated_by'];
    if ($u === $me || is_friend($me, $u)) return $users[$u] ?? null;
    return ['id' => 0, 'name' => '다른 사람', 'color' => '#8b95a1', 'avatar' => null];
}
function note_out(array $n, int $me, array $users, bool $withBody): array {
    $own = (int)$n['owner_id'] === $me;
    $o = ['id' => (int)$n['id'], 'owner' => $users[(int)$n['owner_id']] ?? null, 'mine' => $own, 'title' => $n['title'],
          'visibility' => $own ? $n['visibility'] : null,
          'shares' => $own && $n['visibility'] === 'selected' ? shares_of('note', (int)$n['id']) : [],
          'version' => (int)$n['version'], 'updatedAt' => $n['updated_at'],
          'updatedBy' => note_editor($n, $me, $users)];
    if ($withBody) $o['body'] = $n['body'];
    else $o['preview'] = mb_substr(preg_replace('/\s+/u', ' ', $n['body']), 0, 80);
    return $o;
}

route('notes.list', 'GET', function (int $me) {
    [$vis, $p] = visible_sql('n', 'note', $me);
    $list = rows("SELECT n.id, n.owner_id, n.title, LEFT(n.body, 200) body, n.visibility, n.version, n.updated_by, n.updated_at
                  FROM notes n WHERE {$vis} ORDER BY n.updated_at DESC LIMIT 300", $p);
    $users = users_by_ids(array_merge(array_column($list, 'owner_id'), array_column($list, 'updated_by')));
    return ['notes' => array_map(fn($n) => note_out($n, $me, $users, false), $list)];
});

route('notes.get', 'GET', function (int $me) {
    $n = load_visible('note', int_arg('id'), $me);
    return ['note' => note_out($n, $me, users_by_ids([$n['owner_id'], $n['updated_by']]), true)];
});

route('notes.create', 'POST', function (int $me) {
    $title = str_arg('title', 100) ?: '새 메모';
    $visibility = visibility_arg('private');
    if ((int)val('SELECT COUNT(*) FROM notes WHERE owner_id = ?', [$me]) >= 500) fail(400, '메모는 500개까지 만들 수 있어요');
    db()->beginTransaction();
    q('INSERT INTO notes (owner_id, title, body, visibility, updated_by) VALUES (?, ?, ?, ?, ?)', [$me, $title, '', $visibility, $me]);
    $id = (int)db()->lastInsertId();
    save_shares('note', $id, $me, $visibility);
    db()->commit();
    return ['id' => $id];
});

route('notes.save', 'POST', function (int $me) {
    $n = load_visible('note', int_arg('id'), $me);
    $title = str_arg('title', 100) ?: '제목 없음';
    $bodyText = arg('body', '');
    if (!is_string($bodyText)) fail(400, '내용이 잘못됐어요');
    $bodyText = str_replace("\r\n", "\n", $bodyText);
    if (mb_strlen($bodyText) > 100000) fail(400, '메모는 10만 자까지 쓸 수 있어요');
    $version = int_arg('version');
    $st = q('UPDATE notes SET title = ?, body = ?, version = version + 1, updated_by = ?, updated_at = NOW() WHERE id = ? AND version = ?',
            [$title, $bodyText, $me, $n['id'], $version]);
    if ($st->rowCount() === 0) {
        $cur = row('SELECT * FROM notes WHERE id = ?', [$n['id']]);
        fail(409, '다른 사람이 먼저 고쳤어요', ['note' => note_out($cur, $me, users_by_ids([$cur['owner_id'], $cur['updated_by']]), true)]);
    }
    return ['version' => $version + 1];
});

route('notes.meta', 'POST', function (int $me) {
    $id = int_arg('id');
    load_owned('note', $id, $me);
    $visibility = visibility_arg('private');
    db()->beginTransaction();
    q('UPDATE notes SET visibility = ? WHERE id = ?', [$visibility, $id]);
    save_shares('note', $id, $me, $visibility);
    db()->commit();
    return [];
});

route('notes.delete', 'POST', function (int $me) {
    $id = int_arg('id');
    load_owned('note', $id, $me);
    q('DELETE FROM notes WHERE id = ?', [$id]);
    delete_shares('note', $id);
    return [];
});
