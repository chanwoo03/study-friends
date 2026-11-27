<?php
/* =========================================================
   설정 파일
   1) 이 파일을 복사해서 이름을 config.php 로 바꾸세요.
   2) 아래 값을 내 호스팅에 맞게 채우세요.
   config.php 는 .htaccess 로 바깥에서 열 수 없게 막혀 있어요.
   ========================================================= */
return [
  // 사이트 주소 (끝에 / 없이). 예: https://example.com/study
  'app_url' => 'https://example.com/study',

  // 호스팅에서 받은 MySQL 정보
  'db' => [
    'host' => 'localhost',
    'port' => 3306,
    'name' => 'my_database',
    'user' => 'my_user',
    'pass' => 'my_password',
  ],

  'timezone' => 'Asia/Seoul',

  // 로그인 상태를 저장할 폴더. 비워 두면 이 폴더 안의 sessions/ 를 써요.
  // nginx 처럼 .htaccess 가 안 먹는 서버라면 웹에서 안 보이는 곳으로 바꾸세요. 예: '/home/내계정/sf_sessions'
  'session_path' => '',

  // 아이디·비밀번호로 새로 가입하는 것을 막고 싶으면 false
  'allow_register' => true,

  // 카카오 로그인 (https://developers.kakao.com)
  // 비워 두면 카카오 버튼이 안 보여요.
  'kakao' => [
    'rest_api_key'  => '',
    'client_secret' => '',   // 카카오 로그인 > 보안 > Client Secret 을 '사용함'으로 했을 때만
  ],

  // 휴대폰 푸시 서버 열쇠 위치 (Firebase 서비스 계정 키). 비워 두면 www 바깥의 fcm-key.json 을 찾아요.
  'fcm_key' => '',

  // 아이폰(홈 화면 웹앱)·컴퓨터 브라우저 푸시 — https 에서만 동작해요. Firebase 콘솔 > 프로젝트 설정 > 일반(웹 앱) / 클라우드 메시징(웹 푸시 인증서)
  // 이 값들은 공개 식별자라 비밀은 아니에요. 비워 두면 브라우저 푸시는 꺼져요.
  'firebase_web' => [
    'apiKey'            => '',
    'appId'             => '',
    'projectId'         => '',
    'messagingSenderId' => '',
    'vapidKey'          => '',   // 웹 푸시 인증서 > 키 쌍 (공개 키)
  ],

  // 구글 로그인 (https://console.cloud.google.com > API 및 서비스 > 사용자 인증 정보)
  // 비워 두면 구글 버튼이 안 보여요.
  'google' => [
    'client_id'     => '',
    'client_secret' => '',
  ],
];
