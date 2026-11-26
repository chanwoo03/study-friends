<?php
declare(strict_types=1);
/* 구글 로그인. 승인된 리디렉션 URI 로 이 파일 주소(…/oauth/google.php)를 등록하세요 */
require __DIR__ . '/../lib/oauth.php';

oauth_run([
    'name' => 'google',
    'authorize' => fn(string $state, string $redirect) => 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'response_type' => 'code',
        'client_id'     => cfg('google.client_id'),
        'redirect_uri'  => $redirect,
        'scope'         => 'openid profile',
        'state'         => $state,
        'prompt'        => 'select_account',
    ]),
    'profile' => function (string $code, string $redirect) {
        $tok = http_post_form('https://oauth2.googleapis.com/token', [
            'grant_type'    => 'authorization_code',
            'client_id'     => cfg('google.client_id'),
            'client_secret' => cfg('google.client_secret'),
            'redirect_uri'  => $redirect,
            'code'          => $code,
        ]);
        $me = http_get_json('https://openidconnect.googleapis.com/v1/userinfo', ['Authorization: Bearer ' . ($tok['access_token'] ?? '')]);
        return ['uid' => (string)($me['sub'] ?? ''), 'name' => (string)($me['name'] ?? ($me['given_name'] ?? ''))];
    },
]);
