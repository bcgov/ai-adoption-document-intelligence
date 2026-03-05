/*
  Warnings:

  - Made the column `role` on table `user_group` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "user_group" ALTER COLUMN "role" SET NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'MEMBER';
