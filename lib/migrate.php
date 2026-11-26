<?php
declare(strict_types=1);
/* 데이터베이스 자동 업그레이드
   이미 설치한 사이트도 새 기능에 필요한 표·칸이 저절로 추가돼요. 기존 데이터는 건드리지 않아요.
   새 버전에서 표 구조가 바뀌면 SCHEMA_VERSION 을 올리고 아래 sf_migrations() 에 단계를 덧붙여요. */

const SCHEMA_VERSION = 3;

function sf_col_exists(PDO $db, string $table, string $col): bool {
    $st = $db->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $col]);
    return (bool)$st->fetchColumn();
}
function sf_table_exists(PDO $db, string $table): bool {
    $st = $db->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$table]);
    return (bool)$st->fetchColumn();
}

/* 업그레이드 실행. 이미 적용된 단계는 건너뛰어요(여러 번 실행해도 안전). 적용한 단계 설명 목록을 돌려줘요 */
function sf_migrate(PDO $db): array {
    if (!sf_table_exists($db, 'users') || !sf_table_exists($db, 'plans')) return [];   // 아직 기본 표가 없음 (check.php 에서 먼저 만들어요)
    $done = [];
    // v2: 프로필 사진
    if (!sf_col_exists($db, 'users', 'avatar')) {
        $db->exec("ALTER TABLE users ADD COLUMN avatar VARCHAR(100) NULL AFTER color");
        $done[] = 'users.avatar';
    }
    // v2: 공동 계획(여러 명이 같이 쓰는 계획)과 공동 목표 시간
    if (!sf_col_exists($db, 'plans', 'kind')) {
        $db->exec("ALTER TABLE plans ADD COLUMN kind ENUM('personal','group') NOT NULL DEFAULT 'personal' AFTER owner_id");
        $done[] = 'plans.kind';
    }
    if (!sf_col_exists($db, 'plans', 'goal_hours')) {
        $db->exec("ALTER TABLE plans ADD COLUMN goal_hours SMALLINT UNSIGNED NULL AFTER visibility,
                   ADD COLUMN goal_from DATE NULL AFTER goal_hours, ADD COLUMN goal_to DATE NULL AFTER goal_from");
        $done[] = 'plans.goal';
    }
    if (!sf_table_exists($db, 'plan_members')) {
        $db->exec("CREATE TABLE plan_members (
            plan_id   INT UNSIGNED NOT NULL,
            user_id   INT UNSIGNED NOT NULL,
            joined_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (plan_id, user_id),
            KEY idx_user (user_id),
            CONSTRAINT fk_pm_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
            CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $done[] = 'plan_members';
    }
    if (!sf_table_exists($db, 'task_checks')) {
        $db->exec("CREATE TABLE task_checks (
            task_id INT UNSIGNED NOT NULL,
            user_id INT UNSIGNED NOT NULL,
            done_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (task_id, user_id),
            KEY idx_user (user_id),
            CONSTRAINT fk_tc_task FOREIGN KEY (task_id) REFERENCES plan_tasks(id) ON DELETE CASCADE,
            CONSTRAINT fk_tc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $done[] = 'task_checks';
    }
    // v3: 하루 기록 (날짜별 메모와 사진)
    if (!sf_table_exists($db, 'day_notes')) {
        $db->exec("CREATE TABLE day_notes (
            id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id    INT UNSIGNED NOT NULL,
            day        DATE         NOT NULL,
            memo       TEXT         NOT NULL,
            visibility ENUM('private','friends') NOT NULL DEFAULT 'friends',
            updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_user_day (user_id, day),
            KEY idx_day (day),
            CONSTRAINT fk_dn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $done[] = 'day_notes';
    }
    if (!sf_table_exists($db, 'day_photos')) {
        $db->exec("CREATE TABLE day_photos (
            id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            note_id    INT UNSIGNED NOT NULL,
            file       VARCHAR(80)  NOT NULL,
            thumb      VARCHAR(80)  NOT NULL,
            width      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            height     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_note (note_id),
            CONSTRAINT fk_dp_note FOREIGN KEY (note_id) REFERENCES day_notes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $done[] = 'day_photos';
    }
    return $done;
}

/* 요청마다 DB 를 뒤지지 않게, 한 번 업그레이드한 뒤에는 표시 파일을 남겨요 */
function sf_ensure_schema(PDO $db, string $markerDir): void {
    $marker = rtrim($markerDir, '/') . '/.schema_v' . SCHEMA_VERSION;
    if (is_file($marker)) return;
    sf_migrate($db);
    if (sf_table_exists($db, 'users') && is_dir($markerDir) && is_writable($markerDir)) @file_put_contents($marker, date('c'));
}
