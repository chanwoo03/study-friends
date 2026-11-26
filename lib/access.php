<?php
declare(strict_types=1);

/* 누가 무엇을 볼 수 있는지: 내 것 + (친구 전체 공개인 친구 것) + (나를 골라 공유한 친구 것) */

function friend_ids(int $me): array {
    return array_map('intval', array_column(rows('SELECT friend_id FROM friendships WHERE user_id = ?', [$me]), 'friend_id'));
}
function is_friend(int $a, int $b): bool {
    return (bool)val('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?', [$a, $b]);
}

/* SQL 조건과 매개변수. $alias 테이블에 id, owner_id, visibility 가 있어야 해요. */
function visible_sql(string $alias, string $kind, int $me): array {
    $sql = "({$alias}.owner_id = ?
      OR ({$alias}.visibility = 'friends' AND EXISTS (SELECT 1 FROM friendships fv WHERE fv.user_id = ? AND fv.friend_id = {$alias}.owner_id))
      OR ({$alias}.visibility = 'selected'
          AND EXISTS (SELECT 1 FROM friendships fv2 WHERE fv2.user_id = ? AND fv2.friend_id = {$alias}.owner_id)
          AND EXISTS (SELECT 1 FROM shares sv WHERE sv.kind = '{$kind}' AND sv.item_id = {$alias}.id AND sv.user_id = ?)))";
    return [$sql, [$me, $me, $me, $me]];
}

const KIND_TABLE = ['event' => 'events', 'plan' => 'plans', 'canvas' => 'canvases', 'note' => 'notes'];

/* 볼 수 있는 항목 한 개를 불러오고, 없거나 못 보면 404 */
function load_visible(string $kind, int $id, int $me): array {
    $t = KIND_TABLE[$kind];
    [$vis, $p] = visible_sql('x', $kind, $me);
    $r = row("SELECT x.* FROM {$t} x WHERE x.id = ? AND {$vis}", array_merge([$id], $p));
    if (!$r) fail(404, '찾을 수 없거나 볼 권한이 없어요');
    return $r;
}
function load_owned(string $kind, int $id, int $me): array {
    $t = KIND_TABLE[$kind];
    $r = row("SELECT * FROM {$t} WHERE id = ?", [$id]);
    if (!$r) fail(404, '찾을 수 없어요');
    if ((int)$r['owner_id'] !== $me) fail(403, '만든 사람만 바꿀 수 있어요');
    return $r;
}

/* 'selected' 공유 대상 저장 (내 친구만 남김) */
function save_shares(string $kind, int $itemId, int $owner, string $visibility): void {
    q('DELETE FROM shares WHERE kind = ? AND item_id = ?', [$kind, $itemId]);
    if ($visibility !== 'selected') return;
    $want = arg('shares', []);
    if (!is_array($want)) return;
    $friends = array_flip(friend_ids($owner));
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $want), fn($i) => isset($friends[$i])))), 0, 200);
    foreach ($ids as $u) q('INSERT IGNORE INTO shares (kind, item_id, user_id) VALUES (?, ?, ?)', [$kind, $itemId, $u]);
}
function shares_of(string $kind, int $itemId): array {
    return array_map('intval', array_column(rows('SELECT user_id FROM shares WHERE kind = ? AND item_id = ?', [$kind, $itemId]), 'user_id'));
}
function delete_shares(string $kind, int $itemId): void { q('DELETE FROM shares WHERE kind = ? AND item_id = ?', [$kind, $itemId]); }
