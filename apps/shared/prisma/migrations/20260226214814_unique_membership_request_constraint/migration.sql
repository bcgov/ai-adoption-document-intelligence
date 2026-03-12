/*
  Warnings:

  - A unique constraint covering the columns `[group_id,user_id,status]` on the table `group_membership_request` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "group_membership_request_group_id_user_id_status_key" ON "group_membership_request"("group_id", "user_id", "status");

-- RenameForeignKey
ALTER TABLE "api_keys" RENAME CONSTRAINT "api_keys_user_id_fkey" TO "api_keys_generating_user_id_fkey";
