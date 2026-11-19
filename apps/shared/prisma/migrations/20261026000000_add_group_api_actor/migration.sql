-- The group's durable API-key identity: created once, the first time the
-- group gets an API key, and reused by every key issued afterward (including
-- after a delete + recreate), so records authored via the API keep a valid
-- author even once the key that created them is deleted.
-- AlterTable
ALTER TABLE "group" ADD COLUMN "api_actor_id" TEXT;

-- Backfill: groups that already have a key keep that key's actor as their
-- durable api_actor_id, instead of minting a new one on the key's next
-- delete/recreate cycle.
UPDATE "group" g
SET "api_actor_id" = ak."actor_id"
FROM "api_keys" ak
WHERE ak."group_id" = g."id";

-- CreateIndex
CREATE UNIQUE INDEX "group_api_actor_id_key" ON "group"("api_actor_id");

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_api_actor_id_fkey" FOREIGN KEY ("api_actor_id") REFERENCES "actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
