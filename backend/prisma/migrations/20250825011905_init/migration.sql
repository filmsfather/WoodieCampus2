-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "public"."NoticeCategory" AS ENUM ('GENERAL', 'ACADEMIC', 'EVENT', 'SYSTEM', 'URGENT');

-- CreateEnum
CREATE TYPE "public"."ForumCategory" AS ENUM ('GENERAL', 'QNA', 'STUDY', 'PROJECT', 'ANNOUNCEMENT', 'HELP');

-- CreateEnum
CREATE TYPE "public"."MessageType" AS ENUM ('PRIVATE', 'GROUP', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('MESSAGE', 'FORUM_REPLY', 'COMMENT_REPLY', 'NOTICE', 'SYSTEM', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "public"."AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE');

-- CreateEnum
CREATE TYPE "public"."LearningStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."AchievementType" AS ENUM ('LEARNING', 'ATTENDANCE', 'PARTICIPATION', 'SPECIAL');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'STUDENT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "profile_image" TEXT,
    "phone_number" TEXT,
    "birth_date" DATE,
    "address" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."problem_sets" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."problems" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "solution" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "estimated_time" INTEGER,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "problem_set_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notices" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "public"."NoticeCategory" NOT NULL DEFAULT 'GENERAL',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."forum_posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "public"."ForumCategory" NOT NULL DEFAULT 'GENERAL',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "author_id" TEXT NOT NULL,
    "forum_post_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" "public"."MessageType" NOT NULL DEFAULT 'PRIVATE',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "group_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "resource_id" TEXT,
    "resource_type" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."attendance_records" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "check_in_time" TIMESTAMP(3),
    "check_out_time" TIMESTAMP(3),
    "status" "public"."AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "address" TEXT,
    "work_duration" INTEGER,
    "break_duration" INTEGER,
    "notes" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."learning_progress" (
    "id" TEXT NOT NULL,
    "status" "public"."LearningStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_accessed_at" TIMESTAMP(3),
    "progress_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "time_spent" INTEGER NOT NULL DEFAULT 0,
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "max_score" DOUBLE PRECISION,
    "notes" TEXT,
    "user_id" TEXT NOT NULL,
    "problem_set_id" TEXT,
    "problem_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."achievements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "public"."AchievementType" NOT NULL,
    "icon_url" TEXT,
    "badge_url" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "criteria" JSONB,
    "unlocked_at" TIMESTAMP(3) NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schedules" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule" TEXT,
    "participant_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reminder_minutes" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "public"."users"("role");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "public"."users"("created_at");

-- CreateIndex
CREATE INDEX "problem_sets_created_by_id_idx" ON "public"."problem_sets"("created_by_id");

-- CreateIndex
CREATE INDEX "problem_sets_category_idx" ON "public"."problem_sets"("category");

-- CreateIndex
CREATE INDEX "problem_sets_is_public_idx" ON "public"."problem_sets"("is_public");

-- CreateIndex
CREATE INDEX "problem_sets_created_at_idx" ON "public"."problem_sets"("created_at");

-- CreateIndex
CREATE INDEX "problems_problem_set_id_idx" ON "public"."problems"("problem_set_id");

-- CreateIndex
CREATE INDEX "problems_created_by_id_idx" ON "public"."problems"("created_by_id");

-- CreateIndex
CREATE INDEX "problems_difficulty_idx" ON "public"."problems"("difficulty");

-- CreateIndex
CREATE INDEX "problems_is_public_idx" ON "public"."problems"("is_public");

-- CreateIndex
CREATE INDEX "problems_created_at_idx" ON "public"."problems"("created_at");

-- CreateIndex
CREATE INDEX "notices_created_by_id_idx" ON "public"."notices"("created_by_id");

-- CreateIndex
CREATE INDEX "notices_category_idx" ON "public"."notices"("category");

-- CreateIndex
CREATE INDEX "notices_is_pinned_idx" ON "public"."notices"("is_pinned");

-- CreateIndex
CREATE INDEX "notices_is_public_idx" ON "public"."notices"("is_public");

-- CreateIndex
CREATE INDEX "notices_created_at_idx" ON "public"."notices"("created_at");

-- CreateIndex
CREATE INDEX "forum_posts_author_id_idx" ON "public"."forum_posts"("author_id");

-- CreateIndex
CREATE INDEX "forum_posts_category_idx" ON "public"."forum_posts"("category");

-- CreateIndex
CREATE INDEX "forum_posts_is_pinned_idx" ON "public"."forum_posts"("is_pinned");

-- CreateIndex
CREATE INDEX "forum_posts_created_at_idx" ON "public"."forum_posts"("created_at");

-- CreateIndex
CREATE INDEX "comments_author_id_idx" ON "public"."comments"("author_id");

-- CreateIndex
CREATE INDEX "comments_forum_post_id_idx" ON "public"."comments"("forum_post_id");

-- CreateIndex
CREATE INDEX "comments_parent_id_idx" ON "public"."comments"("parent_id");

-- CreateIndex
CREATE INDEX "comments_created_at_idx" ON "public"."comments"("created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "public"."messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_receiver_id_idx" ON "public"."messages"("receiver_id");

-- CreateIndex
CREATE INDEX "messages_is_read_idx" ON "public"."messages"("is_read");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "public"."messages"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "public"."notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "public"."notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "public"."notifications"("is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "public"."notifications"("created_at");

-- CreateIndex
CREATE INDEX "attendance_records_user_id_idx" ON "public"."attendance_records"("user_id");

-- CreateIndex
CREATE INDEX "attendance_records_date_idx" ON "public"."attendance_records"("date");

-- CreateIndex
CREATE INDEX "attendance_records_status_idx" ON "public"."attendance_records"("status");

-- CreateIndex
CREATE INDEX "attendance_records_created_at_idx" ON "public"."attendance_records"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_user_id_date_key" ON "public"."attendance_records"("user_id", "date");

-- CreateIndex
CREATE INDEX "learning_progress_user_id_idx" ON "public"."learning_progress"("user_id");

-- CreateIndex
CREATE INDEX "learning_progress_status_idx" ON "public"."learning_progress"("status");

-- CreateIndex
CREATE INDEX "learning_progress_problem_set_id_idx" ON "public"."learning_progress"("problem_set_id");

-- CreateIndex
CREATE INDEX "learning_progress_problem_id_idx" ON "public"."learning_progress"("problem_id");

-- CreateIndex
CREATE INDEX "learning_progress_created_at_idx" ON "public"."learning_progress"("created_at");

-- CreateIndex
CREATE INDEX "achievements_user_id_idx" ON "public"."achievements"("user_id");

-- CreateIndex
CREATE INDEX "achievements_type_idx" ON "public"."achievements"("type");

-- CreateIndex
CREATE INDEX "achievements_unlocked_at_idx" ON "public"."achievements"("unlocked_at");

-- CreateIndex
CREATE INDEX "schedules_created_by_id_idx" ON "public"."schedules"("created_by_id");

-- CreateIndex
CREATE INDEX "schedules_start_time_idx" ON "public"."schedules"("start_time");

-- CreateIndex
CREATE INDEX "schedules_end_time_idx" ON "public"."schedules"("end_time");

-- CreateIndex
CREATE INDEX "schedules_is_recurring_idx" ON "public"."schedules"("is_recurring");

-- AddForeignKey
ALTER TABLE "public"."problem_sets" ADD CONSTRAINT "problem_sets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."problems" ADD CONSTRAINT "problems_problem_set_id_fkey" FOREIGN KEY ("problem_set_id") REFERENCES "public"."problem_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."problems" ADD CONSTRAINT "problems_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notices" ADD CONSTRAINT "notices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."forum_posts" ADD CONSTRAINT "forum_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_forum_post_id_fkey" FOREIGN KEY ("forum_post_id") REFERENCES "public"."forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_records" ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."learning_progress" ADD CONSTRAINT "learning_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."learning_progress" ADD CONSTRAINT "learning_progress_problem_set_id_fkey" FOREIGN KEY ("problem_set_id") REFERENCES "public"."problem_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."learning_progress" ADD CONSTRAINT "learning_progress_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."achievements" ADD CONSTRAINT "achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
