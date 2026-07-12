/*
  Warnings:

  - Made the column `search_vector` on table `document_chunks` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "document_chunks_search_vector_idx";

-- AlterTable
ALTER TABLE "document_chunks" ALTER COLUMN "search_vector" SET NOT NULL;
