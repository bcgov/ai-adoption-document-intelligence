-- CreateEnum
CREATE TYPE "ClassifierSource" AS ENUM ('AZURE');

-- CreateEnum
CREATE TYPE "ClassifierStatus" AS ENUM ('PRETRAINING', 'FAILED', 'TRAINING', 'READY');

-- CreateTable
CREATE TABLE "classifier_model" (
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" "ClassifierSource" NOT NULL,
    "status" "ClassifierStatus" NOT NULL DEFAULT 'PRETRAINING',
    "operation_location" TEXT,

    CONSTRAINT "classifier_model_pkey" PRIMARY KEY ("name","group_id")
);

-- CreateTable
CREATE TABLE "group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "classifier_model_group_id_idx" ON "classifier_model"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_name_key" ON "group"("name");

-- AddForeignKey
ALTER TABLE "classifier_model" ADD CONSTRAINT "classifier_model_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
