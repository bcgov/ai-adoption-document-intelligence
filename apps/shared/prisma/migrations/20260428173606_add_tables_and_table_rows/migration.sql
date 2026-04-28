-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "columns" JSONB NOT NULL,
    "lookups" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_rows" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tables_group_id_idx" ON "tables"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "tables_group_id_table_id_key" ON "tables"("group_id", "table_id");

-- CreateIndex
CREATE INDEX "table_rows_group_id_table_id_idx" ON "table_rows"("group_id", "table_id");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_rows" ADD CONSTRAINT "table_rows_group_id_table_id_fkey" FOREIGN KEY ("group_id", "table_id") REFERENCES "tables"("group_id", "table_id") ON DELETE CASCADE ON UPDATE CASCADE;
