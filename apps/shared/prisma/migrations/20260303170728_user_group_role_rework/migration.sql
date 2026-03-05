/*
  Warnings:

  - You are about to drop the `role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_role` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('ADMIN', 'MEMBER');

-- DropForeignKey
ALTER TABLE "user_role" DROP CONSTRAINT "user_role_role_id_fkey";

-- DropForeignKey
ALTER TABLE "user_role" DROP CONSTRAINT "user_role_user_id_fkey";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "is_system_admin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_group" ADD COLUMN     "role" "GroupRole";

-- DropTable
DROP TABLE "role";

-- DropTable
DROP TABLE "user_role";

-- CreateIndex
CREATE INDEX "user_group_group_id_idx" ON "user_group"("group_id");
