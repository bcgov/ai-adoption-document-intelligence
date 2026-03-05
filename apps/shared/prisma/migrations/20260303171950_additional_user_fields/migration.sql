ALTER TABLE "group" ADD COLUMN     "description" TEXT,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" TEXT;

-- AlterTable
ALTER TABLE "group" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
