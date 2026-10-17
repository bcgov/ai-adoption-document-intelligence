-- CreateTable
CREATE TABLE "dynamic_node" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "owner_user_id" TEXT,
    "head_version_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dynamic_node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dynamic_node_version" (
    "id" TEXT NOT NULL,
    "dynamic_node_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "script" TEXT NOT NULL,
    "signature" JSONB NOT NULL,
    "allow_net" TEXT[],
    "deterministic" BOOLEAN NOT NULL DEFAULT false,
    "published_by_user_id" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dynamic_node_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dynamic_node_head_version_id_key" ON "dynamic_node"("head_version_id");

-- CreateIndex
CREATE INDEX "dynamic_node_group_id_deleted_at_idx" ON "dynamic_node"("group_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "dynamic_node_group_id_slug_key" ON "dynamic_node"("group_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "dynamic_node_version_dynamic_node_id_version_number_key" ON "dynamic_node_version"("dynamic_node_id", "version_number");

-- AddForeignKey
ALTER TABLE "dynamic_node" ADD CONSTRAINT "dynamic_node_head_version_id_fkey" FOREIGN KEY ("head_version_id") REFERENCES "dynamic_node_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dynamic_node_version" ADD CONSTRAINT "dynamic_node_version_dynamic_node_id_fkey" FOREIGN KEY ("dynamic_node_id") REFERENCES "dynamic_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
