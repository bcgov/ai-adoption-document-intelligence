-- CreateEnum
CREATE TYPE "ClassifierSource" AS ENUM ('AZURE');

-- CreateEnum
CREATE TYPE "ClassifierStatus" AS ENUM ('PRETRAINING', 'FAILED', 'TRAINING', 'READY');

-- CreateTable
CREATE TABLE "ClassifierModel" (
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

    CONSTRAINT "ClassifierModel_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassifierModel_group_id_idx" ON "ClassifierModel"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- AddForeignKey
ALTER TABLE "ClassifierModel" ADD CONSTRAINT "ClassifierModel_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
