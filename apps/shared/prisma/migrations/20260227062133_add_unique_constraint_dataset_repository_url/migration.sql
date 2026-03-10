/*
  Warnings:

  - A unique constraint covering the columns `[repositoryUrl]` on the table `datasets` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "datasets_repositoryUrl_key" ON "datasets"("repositoryUrl");
