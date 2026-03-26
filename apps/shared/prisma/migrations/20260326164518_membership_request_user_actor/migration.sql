/*
  Warnings:

  - You are about to drop the column `actor_id` on the `group_membership_request` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "group_membership_request" DROP CONSTRAINT "group_membership_request_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "group_membership_request" DROP CONSTRAINT "group_membership_request_created_by_fkey";

-- DropForeignKey
ALTER TABLE "group_membership_request" DROP CONSTRAINT "group_membership_request_updated_by_fkey";

-- AlterTable
ALTER TABLE "group_membership_request" DROP COLUMN "actor_id";

-- AddForeignKey
ALTER TABLE "group_membership_request" ADD CONSTRAINT "group_membership_request_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_membership_request" ADD CONSTRAINT "group_membership_request_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
