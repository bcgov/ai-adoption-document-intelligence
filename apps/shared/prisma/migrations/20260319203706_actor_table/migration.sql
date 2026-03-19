/*
  Warnings:

  - A unique constraint covering the columns `[group_id]` on the table `api_keys` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[actor_id]` on the table `api_keys` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[group_id,user_id,status]` on the table `group_membership_request` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[actor_id]` on the table `user` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `actor_id` to the `api_keys` table without a default value. This is not possible if the table is not empty.
  - Made the column `generating_user_id` on table `api_keys` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `actor_id` to the `user` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_generating_user_id_fkey";

-- DropForeignKey
ALTER TABLE "benchmark_projects" DROP CONSTRAINT "benchmark_projects_group_id_fkey";

-- DropForeignKey
ALTER TABLE "datasets" DROP CONSTRAINT "datasets_group_id_fkey";

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "actor_id" TEXT NOT NULL,
ALTER COLUMN "generating_user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "actor_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Actor" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_group_id_key" ON "api_keys"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_actor_id_key" ON "api_keys"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_membership_request_group_id_user_id_status_key" ON "group_membership_request"("group_id", "user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_actor_id_key" ON "user"("actor_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_generating_user_id_fkey" FOREIGN KEY ("generating_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_projects" ADD CONSTRAINT "benchmark_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
