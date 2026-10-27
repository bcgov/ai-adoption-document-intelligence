-- AlterTable
ALTER TABLE "field_corrections" ADD COLUMN     "actor_id" TEXT;

-- CreateIndex
CREATE INDEX "field_corrections_actor_id_idx" ON "field_corrections"("actor_id");

-- AddForeignKey
ALTER TABLE "field_corrections" ADD CONSTRAINT "field_corrections_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
