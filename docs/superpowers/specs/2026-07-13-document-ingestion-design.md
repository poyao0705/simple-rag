# Document Ingestion Design

## Goal

Complete `backend/scripts/ingest-docs.ts` so it ingests the Markdown files in `backend/data/docs/langchain` into PostgreSQL for hybrid vector and full-text retrieval.

## Document identity

Each document is identified by its environment and source path. The Prisma schema will enforce a compound unique constraint on `(environment, source)`, with ingestion using the existing `dev` environment and paths relative to the backend working directory.

Only `.md` files directly inside `data/docs/langchain` are included. Files are processed in sorted order for deterministic logs and tests.

## Change detection

The script computes a SHA-256 hash from each file's UTF-8 contents. It looks up the existing document by `(environment, source)` before splitting or embedding. If the stored hash matches, the file is skipped without calling the embedding API or changing database rows.

New files and files with changed hashes continue through ingestion.

## Chunking and embedding

Changed documents are split with LangChain's `RecursiveCharacterTextSplitter`, using a chunk size of 1,000 characters and an overlap of 200 characters. Chunk metadata includes the source path and zero-based chunk index.

Chunks are embedded in one batch per document with LangChain's `OpenAIEmbeddings` and the supported OpenAI model ID `text-embedding-3-small`. Its default 1,536-dimensional output matches the existing `vector(1536)` database column.

## Persistence

Prisma Client upserts the parent `Document` through the required `import { prisma } from "@/lib/prisma"`. For a changed document, one database transaction:

1. Upserts the document metadata and current content hash.
2. Deletes all previous chunks for that document.
3. Inserts the replacement chunks with parameterized `$executeRaw` statements because Prisma does not natively write the required `vector` and `tsvector` fields.

This replacement strategy prevents stale chunks when a changed file becomes shorter. The transaction ensures readers see either the old complete document or the new complete document if an insertion fails.

## Full-text search capability

A migration will change `document_chunks.search_vector` to a stored generated column based on `to_tsvector('english', content)` and add a GIN index. PostgreSQL, rather than application code, will keep the value synchronized with chunk content.

The Prisma schema will continue to represent the column as `Unsupported("tsvector")` and mark its database-generated behavior. Chunk insertion omits `search_vector`, allowing PostgreSQL to generate it.

## Errors and lifecycle

The script fails fast on filesystem, OpenAI, or database errors, reports the error, sets a non-zero exit code, and always disconnects Prisma. A file is only reported as ingested after its transaction commits.

## Verification

Unit tests will cover deterministic hashing, unchanged-document skipping, and changed-document ingestion/replacement through injected test dependencies, without requiring OpenAI or PostgreSQL. Prisma generation/validation and TypeScript compilation will verify schema and raw-query integration. If configured credentials and database access are available, the script can then be run as an integration check.
