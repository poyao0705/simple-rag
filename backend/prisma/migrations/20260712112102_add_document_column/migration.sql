/*
  Warnings:

  - Added the required column `content_hash` to the `documents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "content_hash" TEXT NOT NULL;
