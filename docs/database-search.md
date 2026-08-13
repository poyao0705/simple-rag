# Database full-text and vector search

This project uses PostgreSQL as both the application database and the retrieval store. The database supports two complementary retrieval strategies:

- **Full-text search (FTS)** matches words and phrases using PostgreSQL's `tsvector`/`tsquery` types.
- **Vector search** matches the meaning of text using pgvector embeddings and cosine distance.

The application runs both searches for the same query, combines their ranked results, and then reranks the strongest candidates. The two SQL queries do not combine their results in PostgreSQL; hybrid fusion happens in the application layer after both queries complete.

## Where the database is configured

The database configuration is split across these project files:

| File | Responsibility |
| --- | --- |
| `compose.yaml` | Runs PostgreSQL with the `pgvector/pgvector:pg17` image and persists its data in the `postgres_data` volume. |
| `backend/prisma/schema.prisma` | Defines the relational models and declares the pgvector/`tsvector` columns as Prisma unsupported types. |
| `backend/prisma/migrations/` | Installs the vector extension, creates the tables, and creates the FTS and vector indexes. |
| `backend/prisma.config.ts` | Points Prisma at `prisma/schema.prisma`, the migrations directory, and `DATABASE_URL`. |
| `backend/scripts/ingest/ingest-docs.ts` | Splits documents, creates embeddings, and persists searchable chunks. |
| `backend/src/services/retrieval/full-text-search.ts` | Executes the PostgreSQL FTS query. |
| `backend/src/services/retrieval/semantic-search.ts` | Executes the pgvector similarity query. |
| `backend/src/services/retrieval/retrieve.ts` | Runs both searches, fuses their ranks, and invokes the final reranker. |

The Compose PostgreSQL service uses these database defaults:

```yaml
image: pgvector/pgvector:pg17
POSTGRES_USER: postgres
POSTGRES_PASSWORD: postgres
POSTGRES_DB: rag
```

The backend connects to that service with `DATABASE_URL` set to:

```text
postgresql://postgres:postgres@postgres:5432/rag
```

When the development Compose override starts the backend, it applies pending Prisma migrations before generating the client and starting Fastify:

```sh
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

## Schema that enables both search strategies

The relevant part of the relational model is:

```prisma
model Document {
  id          String  @id @default(uuid()) @db.Uuid
  environment String  @default("dev")
  source      String?
  title       String?
  contentHash String @map("content_hash")
  metadata    Json    @default("{}")

  chunks DocumentChunk[]

  @@unique([environment, source])
  @@map("documents")
}

model DocumentChunk {
  id         String @id @default(uuid()) @db.Uuid
  documentId String @map("document_id") @db.Uuid
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  content  String
  metadata Json @default("{}")

  embedding   Unsupported("vector(1536)")
  searchVector Unsupported("tsvector") @default(dbgenerated()) @map("search_vector")

  @@map("document_chunks")
}
```

`vector(1536)` and `tsvector` are database-specific types that Prisma does not model as regular scalar fields. They are represented as `Unsupported(...)` in the Prisma schema, while the migrations and retrieval code use SQL directly for operations involving those columns.

### The `documents` table

A document stores the source-level metadata and owns its chunks:

- `environment` scopes a document collection. Both retrieval queries filter by it.
- `source` identifies the source within an environment.
- `title` and `metadata` are returned with matching chunks for citations and display.
- `content_hash` lets ingestion skip an unchanged source.
- The unique constraint on `(environment, source)` supports the ingestion upsert.

### The `document_chunks` table

Each row is the unit returned by retrieval:

- `content` is the chunk text searched by both strategies.
- `metadata` stores the zero-based `chunkIndex` used to preserve source location.
- `embedding vector(1536)` stores the OpenAI `text-embedding-3-small` representation.
- `search_vector tsvector` stores the PostgreSQL lexical representation of `content`.
- `document_id` joins the chunk to its source document and environment.

## Migrations and indexes

The migration history builds the search support in stages:

1. `20260712101457_add_documents/migration.sql` enables the `vector` extension and creates `embedding vector(1536)` and `search_vector tsvector` columns.
2. `20260713000000_add_ingestion_constraints/migration.sql` replaces `search_vector` with a stored generated column and creates its GIN index:

   ```sql
   ALTER TABLE "document_chunks" DROP COLUMN "search_vector";
   ALTER TABLE "document_chunks"
   ADD COLUMN "search_vector" tsvector
   GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;

   CREATE INDEX "document_chunks_search_vector_idx"
   ON "document_chunks" USING GIN ("search_vector");
   ```

3. `20260713010000_add_embedding_hnsw_index/migration.sql` creates the vector nearest-neighbor index:

   ```sql
   CREATE INDEX "document_chunks_embedding_hnsw_idx"
   ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);
   ```

### Why these indexes exist

- **GIN on `search_vector`** accelerates the `search_vector @@ tsquery` containment predicate used by FTS. The database can use it to find matching chunks before calculating their rank.
- **HNSW with `vector_cosine_ops`** supports approximate nearest-neighbor lookup for the cosine-distance expression used by semantic search. The operator class must match the distance metric in the query.
- The indexes are separate because lexical token matching and vector nearest-neighbor lookup are different PostgreSQL operations.

The generated `search_vector` column is important: PostgreSQL recomputes it from `content` whenever a chunk is inserted or its content changes. Ingestion therefore inserts `content` and `embedding`, but does not manually insert `search_vector`.

## How ingestion populates searchable rows

`backend/scripts/ingest/ingest-docs.ts` prepares the two search representations for every changed document:

1. Markdown files are loaded and hashed with SHA-256. If the stored `content_hash` is unchanged, ingestion skips the document.
2. Changed content is split into chunks of 1,000 characters with 200 characters of overlap.
3. `text-embedding-3-small` creates one 1,536-dimensional embedding per chunk.
4. Inside a Prisma transaction, the document is upserted by `(environment, source)`, old chunks are deleted, and new chunks are inserted.
5. The raw insert supplies `content`, `metadata`, and the pgvector `embedding`:

   ```sql
   INSERT INTO "document_chunks"
     ("id", "document_id", "content", "metadata", "embedding")
   VALUES
     (..., ..., ..., ...::jsonb, ...::vector)
   ```

   `search_vector` is intentionally omitted because PostgreSQL generates it from `content`.

This keeps the lexical and semantic representations aligned: every stored chunk has both its original text and the embedding generated from that same text.

## Full-text search SQL

The FTS implementation is in `backend/src/services/retrieval/full-text-search.ts`:

```sql
WITH query_input AS (
  SELECT websearch_to_tsquery('english', ${query}) AS value
)
SELECT
  dc."id" AS "chunkId",
  dc."document_id" AS "documentId",
  dc."content",
  d."source",
  d."title",
  (dc."metadata"->>'chunkIndex')::integer AS "chunkIndex",
  ts_rank_cd(dc."search_vector", query_input.value)::double precision
    AS "score"
FROM "document_chunks" dc
JOIN "documents" d
  ON d."id" = dc."document_id"
CROSS JOIN query_input
WHERE d."environment" = ${environment}
  AND dc."search_vector" @@ query_input.value
ORDER BY
  ts_rank_cd(dc."search_vector", query_input.value) DESC,
  dc."id" ASC
LIMIT ${limit}
```

The query works as follows:

1. `websearch_to_tsquery('english', query)` parses natural-language input using PostgreSQL's English text-search configuration. The same language configuration is used when the stored generated column is built.
2. `search_vector @@ query_input.value` keeps only chunks whose indexed terms satisfy the query. This is the predicate supported by the GIN index.
3. `ts_rank_cd` assigns a lexical relevance score to each matching chunk. A higher score ranks the chunk earlier.
4. The join adds document metadata while `environment` prevents results from another document collection from entering the result set.
5. `chunkId ASC` is a deterministic tie-breaker when multiple chunks have the same FTS rank.
6. `LIMIT` bounds the lexical candidate list before it enters application-level fusion.

The query is issued through Prisma's tagged `$queryRaw` template. Interpolated values such as `query`, `environment`, and `limit` are sent as query parameters rather than concatenated into SQL.

## Vector similarity search SQL

The semantic implementation is in `backend/src/services/retrieval/semantic-search.ts`. Before SQL runs, the query embedding is checked against the configured 1,536 dimensions and rejected if any value is non-finite. The embedding is then passed as a bound value and cast to `vector` in SQL:

```sql
SELECT
  dc."id" AS "chunkId",
  dc."document_id" AS "documentId",
  dc."content",
  d."source",
  d."title",
  (dc."metadata"->>'chunkIndex')::integer AS "chunkIndex",
  (
    1 - (dc."embedding" <=> ${vector}::vector)
  )::double precision AS "score"
FROM "document_chunks" dc
JOIN "documents" d
  ON d."id" = dc."document_id"
WHERE d."environment" = ${environment}
ORDER BY
  dc."embedding" <=> ${vector}::vector ASC,
  dc."id" ASC
LIMIT ${limit}
```

The important details are:

1. `${vector}::vector` converts the bound bracketed vector literal into the pgvector type. Binding the value avoids building SQL from untrusted input.
2. `<=>` is pgvector's cosine-distance operator. Smaller distance means greater semantic similarity, so the query orders by it ascending.
3. The returned `score` is `1 - cosine distance`, which presents similarity as a larger-is-better value. Ordering still uses the distance expression so it directly matches the HNSW index's cosine operator class.
4. The document join and environment predicate are the same as in FTS, allowing both paths to return the same `RetrievalCandidate` shape and enforce the same collection boundary.
5. The chunk ID tie-breaker makes equal-distance results deterministic.
6. `LIMIT` bounds the semantic candidate list before fusion.

## How the two SQL results become hybrid retrieval

The SQL queries run separately in `backend/src/services/retrieval/retrieve.ts`:

```text
query
  ├─ PostgreSQL FTS query ----------------┐
  └─ OpenAI query embedding → vector SQL ┘
                    ↓
          reciprocal rank fusion
                    ↓
          keep top 30 fused chunks
                    ↓
          Cohere rerank, return top 8
```

The application starts the FTS request and query-embedding request without awaiting either one, then waits for both with `Promise.all()`. This allows the database and embedding-service latency to overlap.

The result scores are not added together because `ts_rank_cd` and cosine similarity have different scales and meanings. Instead, `reciprocalRankFusion` deduplicates candidates by `chunkId` and adds a rank contribution from each list:

```text
RRF contribution = 1 / (60 + rank)
```

The top 30 fused candidates are passed to Cohere `rerank-v4.0-pro`, which performs the final query-to-content relevance pass and returns at most 8 chunks. The RRF and reranking stages are application code, not SQL.

The limits and model settings are centralized in `backend/src/services/retrieval/utils/config.ts`:

| Setting | Current value | Meaning |
| --- | ---: | --- |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Model used for stored and query embeddings. |
| `EMBEDDING_DIMENSIONS` | `1536` | Must match `vector(1536)`. |
| `FTS_LIMIT` | `50` | Maximum lexical candidates. |
| `SEMANTIC_LIMIT` | `50` | Maximum semantic candidates. |
| `RRF_RANK_CONSTANT` | `60` | Smoothing constant in the RRF formula. |
| `FUSE_LIMIT` | `30` | Candidates sent to the reranker. |
| `RERANK_LIMIT` | `8` | Final chunks returned to the agent. |

## Invariants when changing the search setup

- If the embedding model or dimensionality changes, update the application configuration, migrate the `embedding` column and its index as needed, and re-embed every stored chunk. Old and new dimensions cannot be searched together.
- The generated FTS column uses the `'english'` configuration. Changing the language, tokenization, or source expression requires a migration so the stored generated values and GIN index remain consistent.
- Keep the vector operator in the SQL (`<=>`) aligned with the index operator class (`vector_cosine_ops`). Changing the distance metric requires a matching index migration and query change.
- Keep the `environment` predicate in both search queries. It is the retrieval boundary between document collections.
