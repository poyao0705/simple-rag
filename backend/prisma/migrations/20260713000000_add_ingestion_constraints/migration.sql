-- A source identifies one document within an environment.
CREATE UNIQUE INDEX "documents_environment_source_key"
ON "documents"("environment", "source");

-- Keep full-text data synchronized with chunk content in PostgreSQL.
ALTER TABLE "document_chunks" DROP COLUMN "search_vector";
ALTER TABLE "document_chunks"
ADD COLUMN "search_vector" tsvector
GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;

CREATE INDEX "document_chunks_search_vector_idx"
ON "document_chunks" USING GIN ("search_vector");
