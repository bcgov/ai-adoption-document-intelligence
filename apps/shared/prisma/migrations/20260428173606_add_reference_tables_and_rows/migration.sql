-- CreateTable
CREATE TABLE "reference_tables" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "columns" JSONB NOT NULL,
    "lookups" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_table_rows" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_table_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_tables_group_id_idx" ON "reference_tables"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "reference_tables_group_id_table_id_key" ON "reference_tables"("group_id", "table_id");

-- CreateIndex
CREATE INDEX "reference_table_rows_group_id_table_id_idx" ON "reference_table_rows"("group_id", "table_id");

-- AddForeignKey
ALTER TABLE "reference_tables" ADD CONSTRAINT "reference_tables_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_table_rows" ADD CONSTRAINT "reference_table_rows_group_id_table_id_fkey" FOREIGN KEY ("group_id", "table_id") REFERENCES "reference_tables"("group_id", "table_id") ON DELETE CASCADE ON UPDATE CASCADE;
