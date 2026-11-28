<?php
declare(strict_types=1);
/* 화면(app.js)이 부르는 모든 서버 기능의 입구. 예: api.php?a=events.list */

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/access.php';
require __DIR__ . '/lib/notify.php';
require __DIR__ . '/lib/fcm.php';

$ROUTES = [];
/* $method: GET(읽기) / POST(쓰기). $public: 로그인 없이 부를 수 있는지. $device: 로그인 대신 앱 기기 열쇠로 확인하는 곳(CSRF 검사 없음) */
function route(string $name, string $method, callable $fn, bool $public = false, bool $device = false): void {
    global $ROUTES;
    $ROUTES[$name] = [$method, $fn, $public, $device];
}
foreach (['auth', 'friends', 'events', 'study', 'messages', 'board', 'canvas', 'notes', 'journal', 'notif', 'planner'] as $h) {
    require __DIR__ . '/handlers/' . $h . '.php';
}

try {
    $a = (string)($_GET['a'] ?? '');
    if (!isset($ROUTES[$a])) fail(404, '알 수 없는 요청이에요');
    [$method, $fn, $public, $device] = $ROUTES[$a];
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail(405, '요청 방식이 맞지 않아요');
    if ($method === 'POST' && !$device) check_csrf();
    $me = $public ? uid() : me();
    $res = $fn($me);
    json_out(200, ['ok' => true] + ($res ?? []));
} catch (ApiError $e) {
    json_out($e->status, ['error' => $e->getMessage()] + $e->extra);
} catch (Throwable $e) {
    error_log('[study-friends] ' . $e);
    json_out(500, ['error' => '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요']);
}
