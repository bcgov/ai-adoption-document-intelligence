-- Internal tokens are short-lived, group-scoped credentials minted server-side
-- for dynamic-node callbacks (the worker mints one per dyn.run invocation,
-- scoped to the group owning the running workflow) and agent self-calls
-- (minted from the already-resolved caller identity). They replace the shared
-- PLATFORM_API_KEY design: only a hash of the token is stored, `user_id` has
-- no FK because actor ids come from JWT identities as well as user rows, and
-- the `expires_at` index backs the cleanup sweep that deletes expired rows.

-- CreateTable
CREATE TABLE "internal_token" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_token_token_hash_key" ON "internal_token"("token_hash");

-- CreateIndex
CREATE INDEX "internal_token_expires_at_idx" ON "internal_token"("expires_at");

-- CreateIndex
CREATE INDEX "internal_token_group_id_idx" ON "internal_token"("group_id");

-- AddForeignKey
ALTER TABLE "internal_token" ADD CONSTRAINT "internal_token_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
