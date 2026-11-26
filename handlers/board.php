<?php
declare(strict_types=1);
/* 보드판: 나와 친구들의 글. 글은 글쓴이의 친구에게만 보여요 */

function post_visible(int $postId, int $me): array {
    $p = row('SELECT * FROM posts WHERE id = ?', [$postId]);
    if (!$p || ((int)$p['author_id'] !== $me && !is_friend($me, (int)$p['author_id']))) fail(404, '글을 찾을 수 없어요');
    return $p;
}

route('board.list', 'GET', function (int $me) {
    $before = int_arg('before', false);
    $after = int_arg('after', false);
    $where = '(p.author_id = ? OR p.author_id IN (SELECT friend_id FROM friendships WHERE user_id = ?))';
    $params = [$me, $me];
    if ($before) { $where .= ' AND p.id < ?'; $params[] = $before; }
    if ($after) { $where .= ' AND p.id > ?'; $params[] = $after; }
    $posts = rows("SELECT p.* FROM posts p WHERE {$where} ORDER BY p.id DESC LIMIT 20", $params);
    $ids = array_map(fn($p) => (int)$p['id'], $posts);
    // 친구 목록은 각자 비밀이에요: 나와 친구가 아닌 사람의 댓글은 보여 주지 않아요 (누가 누구 친구인지 드러나지 않게)
    $comments = $ids ? rows('SELECT * FROM comments WHERE post_id IN (' . in_list($ids) . ')
        AND (author_id = ? OR author_id IN (SELECT friend_id FROM friendships WHERE user_id = ?)) ORDER BY id', array_merge($ids, [$me, $me])) : [];
    $users = users_by_ids(array_merge(array_column($posts, 'author_id'), array_column($comments, 'author_id')));
    $byPost = [];
    foreach ($comments as $c) {
        $byPost[(int)$c['post_id']][] = ['id' => (int)$c['id'], 'author' => $users[(int)$c['author_id']] ?? null,
            'body' => $c['body'], 'at' => $c['created_at'], 'canDelete' => (int)$c['author_id'] === $me];
    }
    $out = array_map(function ($p) use ($me, $users, $byPost) {
        $mine = (int)$p['author_id'] === $me;
        $cs = $byPost[(int)$p['id']] ?? [];
        if ($mine) foreach ($cs as &$c) $c['canDelete'] = true;
        return ['id' => (int)$p['id'], 'author' => $users[(int)$p['author_id']] ?? null, 'mine' => $mine,
                'body' => $p['body'], 'at' => $p['created_at'], 'comments' => $cs];
    }, $posts);
    return ['posts' => $out, 'hasMore' => count($posts) === 20 && !$after];
});

route('board.post', 'POST', function (int $me) {
    $body = str_arg('body', 3000, true, '내용');
    if ((int)val('SELECT COUNT(*) FROM posts WHERE author_id = ? AND created_at > NOW() - INTERVAL 1 MINUTE', [$me]) >= 10) fail(429, '글을 너무 빨리 쓰고 있어요');
    q('INSERT INTO posts (author_id, body) VALUES (?, ?)', [$me, $body]);
    return ['id' => (int)db()->lastInsertId()];
});

route('board.delete', 'POST', function (int $me) {
    $p = post_visible(int_arg('id'), $me);
    if ((int)$p['author_id'] !== $me) fail(403, '내가 쓴 글만 지울 수 있어요');
    q('DELETE FROM posts WHERE id = ?', [$p['id']]);
    return [];
});

route('board.comment', 'POST', function (int $me) {
    $p = post_visible(int_arg('postId'), $me);
    $body = str_arg('body', 1000, true, '댓글');
    if ((int)val('SELECT COUNT(*) FROM comments WHERE author_id = ? AND created_at > NOW() - INTERVAL 1 MINUTE', [$me]) >= 30) fail(429, '댓글을 너무 빨리 쓰고 있어요');
    q('INSERT INTO comments (post_id, author_id, body) VALUES (?, ?, ?)', [$p['id'], $me, $body]);
    return ['id' => (int)db()->lastInsertId()];
});

route('board.uncomment', 'POST', function (int $me) {
    $c = row('SELECT c.*, p.author_id AS post_author FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?', [int_arg('id')]);
    if (!$c) fail(404, '댓글을 찾을 수 없어요');
    if ((int)$c['author_id'] !== $me && (int)$c['post_author'] !== $me) fail(403, '내 댓글이나 내 글의 댓글만 지울 수 있어요');
    q('DELETE FROM comments WHERE id = ?', [$c['id']]);
    return [];
});
