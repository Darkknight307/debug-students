-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'student',
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "university" TEXT NOT NULL,
    "course" TEXT,
    "phone" TEXT,
    "first_login_at" TEXT NOT NULL,
    "last_login_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "reset_tokens" (
    "token_hash" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    CONSTRAINT "reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "board_locked" BOOLEAN NOT NULL DEFAULT false,
    "board_autolock_min" INTEGER NOT NULL DEFAULT 10
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contest_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" TEXT,
    "ends_at" TEXT,
    CONSTRAINT "rounds_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "round_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL DEFAULT '',
    "points" INTEGER NOT NULL DEFAULT 1,
    "options" JSONB,
    "correct" TEXT,
    "starter_code" TEXT,
    "solution_code" TEXT,
    "variant" TEXT,
    "image_url" TEXT,
    "entry" TEXT,
    "max_changed_lines" INTEGER,
    "forbidden" JSONB NOT NULL DEFAULT [],
    "ai_refs" JSONB NOT NULL DEFAULT [],
    "tests_public" JSONB NOT NULL DEFAULT [],
    "tests_hidden" JSONB NOT NULL DEFAULT [],
    CONSTRAINT "tasks_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contest_id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "answer" TEXT,
    "code" TEXT,
    "is_correct" BOOLEAN NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "extensions" (
    "round_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "extra_min" INTEGER NOT NULL,

    PRIMARY KEY ("round_id", "student_id")
);

-- CreateTable
CREATE TABLE "variants" (
    "contest_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,

    PRIMARY KEY ("contest_id", "student_id")
);

-- CreateTable
CREATE TABLE "activity" (
    "round_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TEXT NOT NULL,

    PRIMARY KEY ("round_id", "student_id")
);

-- CreateTable
CREATE TABLE "task_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mime" TEXT NOT NULL,
    "data" BLOB NOT NULL,
    "created_at" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_first_login_at_idx" ON "users"("role", "first_login_at");

-- CreateIndex
CREATE UNIQUE INDEX "contests_slug_key" ON "contests"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_contest_id_idx_key" ON "rounds"("contest_id", "idx");

-- CreateIndex
CREATE INDEX "tasks_round_id_idx_idx" ON "tasks"("round_id", "idx");

-- CreateIndex
CREATE INDEX "submissions_contest_id_created_at_idx" ON "submissions"("contest_id", "created_at");

-- CreateIndex
CREATE INDEX "submissions_student_id_task_id_idx" ON "submissions"("student_id", "task_id");

-- CreateIndex
CREATE INDEX "activity_contest_id_idx" ON "activity"("contest_id");
