-- CreateTable
CREATE TABLE "confusion_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT,
    "matrix" JSONB NOT NULL,
    "metadata" JSONB,
    "group_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "confusion_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "confusion_profiles_group_id_idx" ON "confusion_profiles"("group_id");

-- AddForeignKey
ALTER TABLE "confusion_profiles" ADD CONSTRAINT "confusion_profiles_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
