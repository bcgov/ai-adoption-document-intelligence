/*
  Warnings:

  - You are about to drop the column `userId` on the `benchmark_audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `reviewer_id` on the `review_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `workflows` table. All the data in the column will be lost.
  - Added the required column `actor_id` to the `benchmark_audit_logs` table without a default value. This is not possible if the table is not empty.
  - Made the column `created_by` on table `group` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `actor_id` to the `review_sessions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actor_id` to the `workflows` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "classifier_model" DROP CONSTRAINT "classifier_model_created_by_fkey";

-- DropForeignKey
ALTER TABLE "classifier_model" DROP CONSTRAINT "classifier_model_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "group" DROP CONSTRAINT "group_created_by_fkey";

-- DropForeignKey
ALTER TABLE "group" DROP CONSTRAINT "group_deleted_by_fkey";

-- DropForeignKey
ALTER TABLE "group" DROP CONSTRAINT "group_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "labeling_projects" DROP CONSTRAINT "labeling_projects_created_by_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_user_id_fkey";

-- DropIndex
DROP INDEX "benchmark_audit_logs_userId_idx";

-- AlterTable
ALTER TABLE "benchmark_audit_logs" DROP COLUMN "userId",
ADD COLUMN     "actor_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "group" ALTER COLUMN "created_by" SET NOT NULL;

-- AlterTable
ALTER TABLE "review_sessions" DROP COLUMN "reviewer_id",
ADD COLUMN     "actor_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "workflows" DROP COLUMN "user_id",
ADD COLUMN     "actor_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "benchmark_audit_logs_actor_id_idx" ON "benchmark_audit_logs"("actor_id");

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labeling_projects" ADD CONSTRAINT "labeling_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classifier_model" ADD CONSTRAINT "classifier_model_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classifier_model" ADD CONSTRAINT "classifier_model_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_projects" ADD CONSTRAINT "benchmark_projects_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_audit_logs" ADD CONSTRAINT "benchmark_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
