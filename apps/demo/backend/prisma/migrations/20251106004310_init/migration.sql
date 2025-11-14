-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user', 'viewer');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "DocumentFileType" AS ENUM ('pdf', 'image', 'scan');

-- CreateEnum
CREATE TYPE "IntakeMethod" AS ENUM ('web_upload', 'email', 'mobile', 'citizen_portal', 'scan');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'processing', 'completed', 'needs_validation', 'archived');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('pending', 'approved', 'rejected', 'not_required');

-- CreateEnum
CREATE TYPE "Ministry" AS ENUM ('health', 'education', 'transportation', 'justice', 'finance', 'environment', 'social_services');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('public', 'internal', 'restricted', 'confidential');

-- CreateEnum
CREATE TYPE "RetentionPolicy" AS ENUM ('one_year', 'three_years', 'seven_years', 'permanent');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ministry" "Ministry" NOT NULL,
    "description" TEXT,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'active',
    "intake_methods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retention_policy" "RetentionPolicy" NOT NULL DEFAULT 'seven_years',
    "access_level" "AccessLevel" NOT NULL DEFAULT 'internal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" "DocumentFileType" NOT NULL,
    "intake_method" "IntakeMethod" NOT NULL,
    "workspace_id" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'uploaded',
    "confidence_score" DOUBLE PRECISION,
    "extracted_data" JSONB,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'pending',
    "ministry" "Ministry" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'medium',
    "retention_date" TIMESTAMP(3),
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "documents_workspace_id_idx" ON "documents"("workspace_id");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_ministry_idx" ON "documents"("ministry");

-- CreateIndex
CREATE INDEX "documents_created_date_idx" ON "documents"("created_date");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
