<?php
/* 설치 점검 페이지. 주소/check.php 로 열어 보세요.
   모두 통과하면 이 파일은 지워도 돼요(지우는 걸 권장해요). 비밀번호 같은 값은 화면에 보여 주지 않아요. */
declare(strict_types=1);
if (!function_exists('str_contains')) { function str_contains(string $h, string $n): bool { return $n === '' || strpos($h, $n) !== false; } }
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');

$rows = [];
$needInstall = false;
function item(string $name, bool $ok, string $msg): void { global $rows; $rows[] = [$name, $ok, $msg]; }

item('PHP 버전 7.4 이상', version_compare(PHP_VERSION, '7.4.0', '>='), 'PHP ' . PHP_VERSION . (version_compare(PHP_VERSION, '7.4.0', '>=') ? '' : ' → 호스팅 관리 화면에서 PHP 버전을 8.x 로 바꿔 주세요'));
foreach (['pdo_mysql' => 'DB 연결', 'curl' => '카카오·구글 로그인', 'mbstring' => '한글 글자 수 계산', 'json' => '데이터 주고받기'] as $ext => $why) {
    item("확장 {$ext} ({$why})", extension_loaded($ext), extension_loaded($ext) ? '있음' : '없음 → 호스팅 고객센터에 켜 달라고 요청하세요');
}

$cfgFile = __DIR__ . '/config.php';
$cfg = null;
if (!is_file($cfgFile)) {
    item('config.php 있음', false, 'config.sample.php 를 복사해 config.php 로 이름을 바꾸고 값을 채워 주세요');
} else {
    $cfg = require $cfgFile;
    item('config.php 있음', is_array($cfg), is_array($cfg) ? '있음' : '파일 내용이 잘못됐어요 (return [ ... ]; 형태여야 해요)');
}

if (is_array($cfg)) {
    $url = rtrim((string)($cfg['app_url'] ?? ''), '/');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $here = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '') . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/\\');
    $same = strcasecmp($url, $here) === 0;
    item('app_url 이 지금 주소와 같음', $same, $same ? $url : "config.php 의 app_url 은 '{$url}' 인데 지금 주소는 '{$here}' 예요. 지금 주소로 바꿔 주세요");
    // HTTPS 는 권장이지만 없어도 앱은 돌아가요 (구글 로그인만 HTTPS 가 꼭 필요)
    item('HTTPS (권장)', true, $https ? '보안 연결' : '⚠ http 로 쓰는 중이에요. 앱은 돌아가지만 비밀번호가 암호화되지 않은 채 오가요. 구글 로그인은 HTTPS 가 있어야 쓸 수 있어요');

    $sp = (string)($cfg['session_path'] ?? '') ?: __DIR__ . '/sessions';
    if (!is_dir($sp)) @mkdir($sp, 0700, true);
    $w = is_dir($sp) && is_writable($sp);
    item('로그인 저장 폴더 쓰기 가능', $w, $w ? '사용 가능' : '폴더(sessions)에 쓸 수 없어요. FTP 프로그램에서 sessions 폴더 권한을 700 또는 755 로 바꿔 주세요');

    $db = $cfg['db'] ?? [];
    try {
        $pdo = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['host'] ?? '', (int)($db['port'] ?? 3306), $db['name'] ?? ''),
            (string)($db['user'] ?? ''), (string)($db['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        item('DB 연결', true, 'DB ' . $pdo->query('SELECT VERSION()')->fetchColumn());
        $ver = (string)$pdo->query('SELECT VERSION()')->fetchColumn();
        $isMaria = stripos($ver, 'mariadb') !== false;
        $okVer = $isMaria ? version_compare($ver, '10.2', '>=') : version_compare($ver, '5.6.5', '>=');
        item('DB 버전', $okVer, $okVer ? '사용 가능' : 'MySQL 5.6.5 / MariaDB 10.2 이상이 필요해요. 호스팅 고객센터에 DB 버전을 물어보세요');
        $need = ['users','oauth_accounts','login_attempts','friendships','shares','events','plans','plan_tasks','plan_members','task_checks','day_notes','day_photos','study_sessions','messages','message_reactions','posts','comments','canvases','strokes','notes'];
        require_once __DIR__ . '/lib/migrate.php';
        // 예전 버전으로 설치한 DB 는 새 표·칸을 자동으로 추가
        try { $up = sf_migrate($pdo); if ($up) item('새 버전 업그레이드', true, '추가함: ' . implode(', ', $up)); }
        catch (Throwable $e3) { item('새 버전 업그레이드', false, '실패: ' . $e3->getMessage()); }
        $have = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $missing = array_values(array_diff($need, $have));
        /* '표 만들기' 버튼: schema.sql 을 실행해 없는 표만 만들어요 (이미 있는 표는 건드리지 않아요) */
        if ($missing && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && ($_POST['do'] ?? '') === 'install') {
            $sql = (string)file_get_contents(__DIR__ . '/schema.sql');
            $sql = preg_replace('/^\s*--.*$/m', '', $sql);
            try {
                foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) $pdo->exec($stmt);
                sf_migrate($pdo);
                header('Location: check.php?installed=1');
                exit;
            } catch (Throwable $e2) {
                item('표 만들기', false, '실패: ' . $e2->getMessage());
            }
            $have = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
            $missing = array_values(array_diff($need, $have));
        }
        $needInstall = (bool)$missing;
        item('표(테이블) ' . count($need) . '개', !$missing, $missing ? (count($missing) === count($need) ? '아직 없어요 → 아래 ‘표 만들기’ 버튼을 누르세요' : '없는 표: ' . implode(', ', $missing) . ' → 아래 ‘표 만들기’ 버튼을 누르세요') : (isset($_GET['installed']) ? '방금 만들었어요' : '모두 있음'));
    } catch (Throwable $e) {
        $m = $e->getMessage();
        $hint = str_contains($m, 'Access denied') ? 'DB 아이디나 비밀번호가 틀렸어요'
              : (str_contains($m, 'Unknown database') ? 'DB 이름이 틀렸어요'
              : (str_contains($m, 'getaddrinfo') || str_contains($m, 'No such file') || str_contains($m, 'Connection refused') ? 'DB 주소(host)가 틀렸어요. 호스팅 안내의 DB 서버 주소를 확인하세요' : '연결 실패'));
        item('DB 연결', false, $hint . ' → config.php 의 db 값을 확인하세요');
    }
    $kakao = (string)($cfg['kakao']['rest_api_key'] ?? '') !== '';
    $google = (string)($cfg['google']['client_id'] ?? '') !== '' && (string)($cfg['google']['client_secret'] ?? '') !== '';
    item('카카오 로그인 (선택)', true, $kakao ? '키 입력됨 · Redirect URI: ' . $url . '/oauth/kakao.php' : '아직 안 씀 (나중에 켜도 돼요)');
    item('구글 로그인 (선택)', true, $google ? '키 입력됨 · 리디렉션 URI: ' . $url . '/oauth/google.php' : '아직 안 씀 (나중에 켜도 돼요)');
}
$all = !array_filter($rows, function ($r) { return !$r[1]; });
?><!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>설치 점검</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#f2f4f6;color:#191f28;margin:0;padding:24px 16px;line-height:1.55}
main{max-width:720px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 8px 24px rgba(0,20,60,.05)}
h1{margin:0 0 4px;font-size:24px}p{color:#6b7684;margin:0 0 18px}
li{list-style:none;display:grid;grid-template-columns:28px 1fr;gap:10px;padding:10px 0;border-top:1px solid #eceef1}
ul{padding:0;margin:0}b{display:block}span.m{color:#6b7684;font-size:14px;word-break:break-all}
i{font-style:normal;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px}
.ok i{background:#20c997}.no i{background:#f04452}.no b{color:#f04452}
.done{background:#e6f9f2;border-radius:12px;padding:12px 14px;margin-top:16px}.todo{background:#fdecee;border-radius:12px;padding:12px 14px;margin-top:16px}
</style></head><body><main>
<h1>설치 점검</h1><p>빨간 항목을 위에서부터 고치고 새로고침하세요.</p>
<ul><?php foreach ($rows as [$n, $ok, $m]): ?>
<li class="<?= $ok ? 'ok' : 'no' ?>"><i><?= $ok ? '✓' : '!' ?></i><div><b><?= htmlspecialchars($n) ?></b><span class="m"><?= htmlspecialchars($m) ?></span></div></li>
<?php endforeach; ?></ul>
<?php if ($needInstall): ?><form method="post" style="margin-top:16px"><input type="hidden" name="do" value="install"><button style="height:46px;padding:0 20px;border:0;border-radius:12px;background:#3182f6;color:#fff;font-weight:700;font-size:15px;cursor:pointer">표 만들기</button></form><?php endif; ?>
<?= $all ? '<div class="done"><b>모두 통과했어요!</b> 이제 <a href="./">앱을 열어</a> 회원가입하세요. 이 check.php 파일은 지워 두는 걸 권장해요.</div>'
          : '<div class="todo">아직 고칠 항목이 있어요.</div>' ?>
</main></body></html>
