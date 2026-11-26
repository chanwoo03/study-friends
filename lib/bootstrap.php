<?php
declare(strict_types=1);

/* 모든 서버 파일이 맨 처음 불러오는 공통 준비 코드 */

/* PHP 경고 문구가 JSON 응답에 섞이지 않게: 화면에는 안 보이고 서버 기록(error_log)에만 남겨요 */
ini_set('display_errors', '0');
ini_set('log_errors', '1');

/* PHP 7.4 에서도 돌아가게 하는 보조 함수 (PHP 8 에는 원래 있음) */
if (!function_exists('str_starts_with')) {
    function str_starts_with(string $h, string $n): bool { return $n === '' || strncmp($h, $n, strlen($n)) === 0; }
}
if (!function_exists('str_contains')) {
    function str_contains(string $h, string $n): bool { return $n === '' || strpos($h, $n) !== false; }
}

function json_out(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

class ApiError extends Exception {
    public int $status;
    public array $extra;
    public function __construct(int $status, string $message, array $extra = []) {
        parent::__construct($message);
        $this->status = $status;
        $this->extra = $extra;
    }
}
/* 오류를 내고 이 요청을 끝내요 (돌아오지 않음) */
function fail(int $status, string $message, array $extra = []) {
    throw new ApiError($status, $message, $extra);
}

$cfgFile = dirname(__DIR__) . '/config.php';
if (!is_file($cfgFile)) {
    json_out(500, ['error' => 'config.php 가 없어요. config.sample.php 를 복사해서 설정해 주세요']);
}
$CONFIG = require $cfgFile;
date_default_timezone_set($CONFIG['timezone'] ?? 'Asia/Seoul');

function cfg(string $key, $default = null) {
    global $CONFIG;
    $cur = $CONFIG;
    foreach (explode('.', $key) as $k) {
        if (!is_array($cur) || !array_key_exists($k, $cur)) return $default;
        $cur = $cur[$k];
    }
    return $cur;
}
function app_url(): string { return rtrim((string)cfg('app_url', ''), '/'); }
/* 앱이 놓인 폴더 (예: /study_friend/). config 의 app_url 이 아니라 실제로 열린 주소에서 계산해서,
   app_url 을 조금 틀리게 적어도 로그인 쿠키가 제대로 저장돼요 */
function base_path(): string {
    $dir = str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/')));
    if (substr($dir, -6) === '/oauth') $dir = substr($dir, 0, -6);
    return rtrim($dir, '/') . '/';
}
/* 지금 요청이 https 로 들어왔는지 (보안 쿠키는 https 일 때만) */
function is_https(): bool {
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') return true;
    if (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https') return true;
    if ((string)($_SERVER['SERVER_PORT'] ?? '') === '443') return true;
    return false;
}

/* 세션: 다른 사이트와 섞이지 않게 앱 전용 폴더에 30일 보관 */
(function () {
    $dir = (string)cfg('session_path', '') ?: dirname(__DIR__) . '/sessions';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_dir($dir) && is_writable($dir)) session_save_path($dir);
    $life = 60 * 60 * 24 * 30;
    ini_set('session.gc_maxlifetime', (string)$life);
    ini_set('session.use_strict_mode', '1');
    session_name('sf_session');
    session_set_cookie_params([
        'lifetime' => $life,
        'path'     => base_path(),
        'secure'   => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
})();

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = cfg('db');
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], (int)($c['port'] ?? 3306), $c['name']);
    try {
        $pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        json_out(500, ['error' => '데이터베이스에 연결하지 못했어요. config.php 의 db 설정을 확인해 주세요']);
    }
    // PHP 와 MySQL 의 '지금' 시각을 같은 시간대로 맞춤
    $pdo->exec("SET time_zone = '" . (new DateTime())->format('P') . "'");
    return $pdo;
}
function q(string $sql, array $params = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute(array_values($params));
    return $st;
}
function row(string $sql, array $params = []): ?array { $r = q($sql, $params)->fetch(); return $r ?: null; }
function rows(string $sql, array $params = []): array { return q($sql, $params)->fetchAll(); }
function val(string $sql, array $params = []) { $v = q($sql, $params)->fetchColumn(); return $v === false ? null : $v; }
function in_list(array $ids): string { return implode(',', array_fill(0, count($ids), '?')); }

/* ===== 입력값 ===== */
function body(): array {
    static $b = null;
    if ($b !== null) return $b;
    $raw = file_get_contents('php://input');
    $b = $raw ? json_decode($raw, true) : [];
    if (!is_array($b)) $b = [];
    return $b;
}
function arg(string $k, $default = null) {
    $b = body();
    if (array_key_exists($k, $b)) return $b[$k];
    return $_GET[$k] ?? $default;
}
function str_arg(string $k, int $max, bool $required = false, string $label = '값'): string {
    $v = arg($k, '');
    if (!is_string($v) && !is_int($v)) $v = '';
    $v = trim(str_replace("\r\n", "\n", (string)$v));
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    if ($required && $v === '') fail(400, $label . '을(를) 입력해 주세요');
    if (mb_strlen($v) > $max) fail(400, $label . '은(는) ' . $max . '자까지 쓸 수 있어요');
    return $v;
}
function int_arg(string $k, bool $required = true): int {
    $v = arg($k);
    if ($v === null || $v === '') { if ($required) fail(400, '필요한 값이 빠졌어요 (' . $k . ')'); return 0; }
    if (!is_numeric($v)) fail(400, '숫자 값이 잘못됐어요 (' . $k . ')');
    return (int)$v;
}
function date_arg(string $k, bool $required = true): ?string {
    $v = (string)arg($k, '');
    if ($v === '' && !$required) return null;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) fail(400, '날짜 형식이 잘못됐어요');
    [$y, $m, $d] = array_map('intval', explode('-', $v));
    if (!checkdate($m, $d, $y)) fail(400, '없는 날짜예요');
    return $v;
}
function time_arg(string $k): ?string {
    $v = (string)arg($k, '');
    if ($v === '') return null;
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) fail(400, '시간 형식이 잘못됐어요');
    return $v . ':00';
}
function color_arg(string $k, string $default = '#3182f6'): string {
    $v = (string)arg($k, $default);
    return preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : $default;
}
function visibility_arg(string $default = 'friends'): string {
    $v = (string)arg('visibility', $default);
    return in_array($v, ['private', 'friends', 'selected'], true) ? $v : $default;
}
function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }
function now(): string { return date('Y-m-d H:i:s'); }
