-- 공부 친구 (Study Friends) 데이터베이스 구조
-- phpMyAdmin 등에서 이 파일을 그대로 가져오기(Import) 하세요. MySQL 5.7+ / MariaDB 10.3+

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(20)  NULL,
  password_hash VARCHAR(255) NULL,
  display_name  VARCHAR(20)  NOT NULL,
  color         CHAR(7)      NOT NULL DEFAULT '#3182f6',
  avatar        VARCHAR(100) NULL,
  invite_code   CHAR(8)      NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen     DATETIME     NULL,
  notif_off     VARCHAR(80)  NOT NULL DEFAULT '',
  planner_vis   ENUM('private','friends') NOT NULL DEFAULT 'private',
  UNIQUE KEY uq_username (username),
  UNIQUE KEY uq_invite (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  provider     VARCHAR(16)  NOT NULL,
  provider_uid VARCHAR(191) NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_uid (provider, provider_uid),
  UNIQUE KEY uq_user_provider (user_id, provider),
  CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip         VARCHAR(45) NOT NULL,
  username   VARCHAR(20) NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ip_time (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 친구 관계는 양쪽 방향으로 한 줄씩 저장해요 (A→B, B→A)
CREATE TABLE IF NOT EXISTS friendships (
  user_id    INT UNSIGNED NOT NULL,
  friend_id  INT UNSIGNED NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, friend_id),
  KEY idx_friend (friend_id),
  CONSTRAINT fk_fr_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fr_friend FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 공개 범위가 'selected'(고른 친구)인 항목을 누구에게 보여 줄지
CREATE TABLE IF NOT EXISTS shares (
  kind    ENUM('event','plan','canvas','note') NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (kind, item_id, user_id),
  KEY idx_user (user_id),
  CONSTRAINT fk_share_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id   INT UNSIGNED NOT NULL,
  title      VARCHAR(100) NOT NULL,
  memo       TEXT         NULL,
  start_date DATE         NOT NULL,
  end_date   DATE         NOT NULL,
  start_time TIME         NULL,
  end_time   TIME         NULL,
  color      CHAR(7)      NOT NULL DEFAULT '#3182f6',
  visibility ENUM('private','friends','selected') NOT NULL DEFAULT 'friends',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_owner_dates (owner_id, start_date, end_date),
  CONSTRAINT fk_event_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- kind: personal(혼자) / group(공동 계획, plan_members 의 사람들이 같이 씀)
CREATE TABLE IF NOT EXISTS plans (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id   INT UNSIGNED NOT NULL,
  kind       ENUM('personal','group') NOT NULL DEFAULT 'personal',
  title      VARCHAR(100) NOT NULL,
  color      CHAR(7)      NOT NULL DEFAULT '#3182f6',
  visibility ENUM('private','friends','selected') NOT NULL DEFAULT 'friends',
  goal_hours SMALLINT UNSIGNED NULL,
  goal_from  DATE         NULL,
  goal_to    DATE         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_owner (owner_id),
  CONSTRAINT fk_plan_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plan_tasks (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id  INT UNSIGNED NOT NULL,
  due_date DATE         NOT NULL,
  subject  VARCHAR(40)  NOT NULL DEFAULT '',
  content  VARCHAR(200) NOT NULL,
  done     TINYINT(1)   NOT NULL DEFAULT 0,
  done_at  DATETIME     NULL,
  KEY idx_plan_date (plan_id, due_date),
  KEY idx_date (due_date),
  CONSTRAINT fk_task_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 공동 계획에 같이 참여하는 사람 (만든 사람은 plans.owner_id)
CREATE TABLE IF NOT EXISTS plan_members (
  plan_id   INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  joined_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_id, user_id),
  KEY idx_user (user_id),
  CONSTRAINT fk_pm_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 공동 계획의 할 일을 누가 끝냈는지 (사람마다 따로 체크)
CREATE TABLE IF NOT EXISTS task_checks (
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  done_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, user_id),
  KEY idx_user (user_id),
  CONSTRAINT fk_tc_task FOREIGN KEY (task_id) REFERENCES plan_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_tc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 하루 기록: 날짜마다 한 사람당 한 개 (메모 + 사진 여러 장)
CREATE TABLE IF NOT EXISTS day_notes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  day        DATE         NOT NULL,
  memo       TEXT         NOT NULL,
  visibility ENUM('private','friends') NOT NULL DEFAULT 'friends',
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_day (user_id, day),
  KEY idx_day (day),
  CONSTRAINT fk_dn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 하루 기록 사진 (파일은 uploads/journal, 직접 열 수 없고 api.php 가 권한 확인 후 보내 줘요)
CREATE TABLE IF NOT EXISTS day_photos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  note_id    INT UNSIGNED NOT NULL,
  file       VARCHAR(80)  NOT NULL,
  thumb      VARCHAR(80)  NOT NULL,
  width      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  height     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_note (note_id),
  CONSTRAINT fk_dp_note FOREIGN KEY (note_id) REFERENCES day_notes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS study_sessions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  started_at DATETIME     NOT NULL,
  ended_at   DATETIME     NULL,
  seconds    INT UNSIGNED NOT NULL DEFAULT 0,
  proof_file  VARCHAR(80)  NULL,          -- 공부 인증 사진 (선택)
  proof_thumb VARCHAR(80)  NULL,
  proof_note  VARCHAR(200) NULL,
  proof_vis   ENUM('private','friends') NULL,
  proof_at    DATETIME     NULL,
  subject_id  INT UNSIGNED NULL,          -- 플래너 과목 (선택)
  KEY idx_user_start (user_id, started_at),
  KEY idx_open (ended_at),
  CONSTRAINT fk_study_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id   INT UNSIGNED NOT NULL,
  receiver_id INT UNSIGNED NOT NULL,
  kind        ENUM('text','sticker','image','file') NOT NULL DEFAULT 'text',
  body        TEXT         NOT NULL,
  file_name   VARCHAR(200) NULL,           -- 사진·파일 메시지: 원래 파일 이름
  file_path   VARCHAR(80)  NULL,           -- uploads/messages 안의 저장 이름 (직접 열 수 없음)
  file_thumb  VARCHAR(80)  NULL,
  file_size   INT UNSIGNED NULL,
  file_mime   VARCHAR(100) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at     DATETIME     NULL,
  KEY idx_pair (sender_id, receiver_id, id),
  KEY idx_unread (receiver_id, read_at),
  CONSTRAINT fk_msg_sender   FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 메시지 반응 (한 사람이 메시지 하나에 하나)
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  emoji      VARCHAR(16)  NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT fk_mr_msg  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 보드판: 글쓴이와 글쓴이의 친구에게 보여요
CREATE TABLE IF NOT EXISTS posts (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  author_id  INT UNSIGNED NOT NULL,
  body       TEXT         NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pinned_at  DATETIME     NULL,            -- 공지로 고정한 시각 (친구들 화면 위 공지 창)
  KEY idx_author (author_id, id),
  KEY idx_pinned (pinned_at),
  CONSTRAINT fk_post_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id    INT UNSIGNED NOT NULL,
  author_id  INT UNSIGNED NOT NULL,
  body       VARCHAR(1000) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_post (post_id, id),
  CONSTRAINT fk_cmt_post   FOREIGN KEY (post_id)   REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmt_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canvases (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id   INT UNSIGNED NOT NULL,
  title      VARCHAR(60)  NOT NULL,
  visibility ENUM('private','friends','selected') NOT NULL DEFAULT 'friends',
  version    INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_owner (owner_id),
  CONSTRAINT fk_canvas_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS strokes (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  canvas_id  INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT   NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_canvas (canvas_id, id),
  CONSTRAINT fk_stroke_canvas FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,
  CONSTRAINT fk_stroke_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id   INT UNSIGNED NOT NULL,
  title      VARCHAR(100) NOT NULL,
  body       MEDIUMTEXT   NOT NULL,
  visibility ENUM('private','friends','selected') NOT NULL DEFAULT 'private',
  version    INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_owner (owner_id),
  CONSTRAINT fk_note_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_note_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 알림 (v6)
CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  actor_id   INT UNSIGNED NULL,
  kind       VARCHAR(12)  NOT NULL,
  title      VARCHAR(120) NOT NULL,
  body       VARCHAR(300) NOT NULL DEFAULT '',
  link       VARCHAR(120) NOT NULL DEFAULT '',
  ref_key    VARCHAR(60)  NOT NULL,
  cnt        INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at    DATETIME     NULL,
  KEY idx_user (user_id, id),
  KEY idx_ref (user_id, ref_key),
  CONSTRAINT fk_nt_user  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_nt_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notif_devices (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token_hash CHAR(64)     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen  DATETIME     NULL,
  fcm_token  VARCHAR(255) NULL,
  UNIQUE KEY uq_token (token_hash),
  KEY idx_user (user_id),
  CONSTRAINT fk_nd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 학습 플래너 (v8)
CREATE TABLE IF NOT EXISTS planner_subjects (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id  INT UNSIGNED NOT NULL,
  name     VARCHAR(20)  NOT NULL,
  color    CHAR(7)      NOT NULL,
  sort     INT          NOT NULL DEFAULT 0,
  KEY idx_user (user_id),
  CONSTRAINT fk_ps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS planner_days (
  user_id    INT UNSIGNED NOT NULL,
  day        DATE         NOT NULL,
  goal_min   SMALLINT UNSIGNED NULL,
  mood       TINYINT UNSIGNED NULL,
  rating     TINYINT UNSIGNED NULL,
  reflection VARCHAR(500) NOT NULL DEFAULT '',
  blocks     TEXT         NULL,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, day),
  CONSTRAINT fk_pd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS planner_todos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  day        DATE         NOT NULL,
  text       VARCHAR(120) NOT NULL,
  done       TINYINT(1)   NOT NULL DEFAULT 0,
  subject_id INT UNSIGNED NULL,
  sort       INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_day (user_id, day),
  CONSTRAINT fk_pt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_subj FOREIGN KEY (subject_id) REFERENCES planner_subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ddays (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  title      VARCHAR(40)  NOT NULL,
  day        DATE         NOT NULL,
  color      CHAR(7)      NOT NULL DEFAULT '#f04452',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_day (user_id, day),
  CONSTRAINT fk_dd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
