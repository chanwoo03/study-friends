<?php
declare(strict_types=1);
/* 카카오 로그인. Redirect URI 로 이 파일 주소(…/oauth/kakao.php)를 등록하세요 */
require __DIR__ . '/../lib/oauth.php';

oauth_run([
    'name' => 'kakao',
    'authorize' => fn(string $state, string $redirect) => 'https://kauth.kakao.com/oauth/authorize?' . http_build_query([
        'response_type' => 'code',
        'client_id'     => cfg('kakao.rest_api_key'),
        'redirect_uri'  => $redirect,
        'state'         => $state,
    ]),
    'profile' => function (string $code, string $redirect) {
        $fields = [
            'grant_type'   => 'authorization_code',
            'client_id'    => cfg('kakao.rest_api_key'),
            'redirect_uri' => $redirect,
            'code'         => $code,
        ];
        if ((string)cfg('kakao.client_secret', '') !== '') $fields['client_secret'] = cfg('kakao.client_secret');
        $tok = http_post_form('https://kauth.kakao.com/oauth/token', $fields);
        $me = http_get_json('https://kapi.kakao.com/v2/user/me', ['Authorization: Bearer ' . ($tok['access_token'] ?? '')]);
        $name = $me['kakao_account']['profile']['nickname'] ?? ($me['properties']['nickname'] ?? '');
        return ['uid' => (string)($me['id'] ?? ''), 'name' => (string)$name];
    },
]);
