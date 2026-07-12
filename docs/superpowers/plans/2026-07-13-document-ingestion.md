# Document Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest changed LangChain Markdown documents into PostgreSQL with chunk embeddings and automatically maintained full-text search vectors while skipping unchanged content.

**Architecture:** A testable ingestion core owns hashing and the skip/split/embed/persist workflow. The CLI adapter owns filesystem access, LangChain/OpenAI construction, and Prisma transactions. A manual Prisma migration adds the compound document identity plus a generated `tsvector` column and GIN index.

**Tech Stack:** TypeScript 5.9, Node.js test runner, LangChain `RecursiveCharacterTextSplitter`, LangChain `OpenAIEmbeddings`, Prisma 7, PostgreSQL, pgvector.

## Global Constraints

- Import the Prisma singleton exactly as `import { prisma } from "@/lib/prisma"`.
- Read `.md` files directly from `data/docs/langchain` in sorted order.
- Use SHA-256 content hashes and skip matching documents before splitting or embedding.
- Use chunk size `1000` and chunk overlap `200`.
- Use OpenAI model `text-embedding-3-small` and 1,536-dimensional vectors.
- Use parameterized Prisma `$executeRaw` for chunk inserts containing `vector` data.
- Store full-text data in a generated `to_tsvector('english', content)` column with a GIN index.
- Replace a changed document and all of its chunks atomically.
- Preserve unrelated user changes in `README.md` and `backend/tsconfig.json`.

---

### Task 1: Database identity and generated full-text search

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260713000000_add_ingestion_constraints/migration.sql`

**Interfaces:**
- Consumes: Existing `Document` and `DocumentChunk` models.
- Produces: Prisma compound selector `environment_source`; database-generated `search_vector`; GIN index `document_chunks_search_vector_idx`.

- [ ] **Step 1: Add schema assertions that initially fail**

Run this inspection command before editing:

```bash
cd backend
rg -n '@@unique\(\[environment, source\]\)|searchVector.*@default\(dbgenerated\(\)\)' prisma/schema.prisma
```

Expected: no matches.

- [ ] **Step 2: Update the Prisma schema**

Add the compound identity to `Document`:

```prisma
  @@unique([environment, source])
```

Mark `DocumentChunk.searchVector` as database-generated:

```prisma
  searchVector Unsupported("tsvector") @default(dbgenerated()) @map("search_vector")
```

- [ ] **Step 3: Add the manual migration**

Create `backend/prisma/migrations/20260713000000_add_ingestion_constraints/migration.sql` with:

```sql
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
```

- [ ] **Step 4: Validate and generate Prisma Client**

Run:

```bash
cd backend
npx prisma validate
npx prisma generate
```

Expected: both commands exit 0; generated `DocumentWhereUniqueInput` contains `environment_source`.

- [ ] **Step 5: Commit the schema task**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260713000000_add_ingestion_constraints/migration.sql backend/src/generated/prisma
git commit -m "feat: add ingestion database constraints"
```

---

### Task 2: Testable hash and ingestion workflow

**Files:**
- Create: `backend/scripts/ingest-docs-core.ts`
- Create: `backend/scripts/ingest-docs.test.ts`

**Interfaces:**
- Produces: `hashContent(content: string): string`.
- Produces: `ingestDocument(document: SourceDocument, dependencies: IngestionDependencies): Promise<"ingested" | "skipped">`.
- Produces types `SourceDocument`, `PreparedChunk`, `PersistDocumentInput`, and `IngestionDependencies` for the CLI adapter.

- [ ] **Step 1: Write the failing hashing test**

Create `backend/scripts/ingest-docs.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { hashContent } from "./ingest-docs-core";

test("hashContent returns a deterministic SHA-256 digest", () => {
  assert.equal(
    hashContent("LangChain"),
    "63c34d5ded165a695acdf3669191ab6ebeb38aa54176056e35d3cf53fdcd7c21",
  );
});
```

- [ ] **Step 2: Run the hashing test and verify RED**

Run:

```bash
cd backend
node --import tsx --test scripts/ingest-docs.test.ts
```

Expected: FAIL because `./ingest-docs-core` does not exist.

- [ ] **Step 3: Implement hashing and workflow types**

Create `backend/scripts/ingest-docs-core.ts` with the SHA-256 implementation and these public contracts:

```ts
import { createHash } from "node:crypto";

export type SourceDocument = {
  content: string;
  contentHash: string;
  source: string;
  title: string;
};

export type PreparedChunk = {
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

export type PersistDocumentInput = {
  contentHash: string;
  source: string;
  title: string;
  chunks: PreparedChunk[];
};

export type IngestionDependencies = {
  findContentHash(source: string): Promise<string | null>;
  split(content: string, source: string): Promise<Array<{ content: string; metadata: Record<string, unknown> }>>;
  embed(contents: string[]): Promise<number[][]>;
  persist(input: PersistDocumentInput): Promise<void>;
};

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
```

- [ ] **Step 4: Run the hashing test and verify GREEN**

Run the same Node test command. Expected: 1 passing test.

- [ ] **Step 5: Write failing unchanged-content test**

Update the core import and add a test whose dependencies throw if splitting, embedding, or persistence occurs:

```ts
import { hashContent, ingestDocument } from "./ingest-docs-core";

test("ingestDocument skips unchanged content before splitting or embedding", async () => {
  const document = { content: "same", contentHash: hashContent("same"), source: "doc.md", title: "doc" };
  const fail = async () => { throw new Error("must not be called"); };

  const result = await ingestDocument(document, {
    findContentHash: async () => document.contentHash,
    split: fail,
    embed: fail,
    persist: fail,
  });

  assert.equal(result, "skipped");
});
```

- [ ] **Step 6: Run the unchanged test and verify RED**

Expected: FAIL because `ingestDocument` is not exported.

- [ ] **Step 7: Implement the hash skip**

Add:

```ts
export async function ingestDocument(
  document: SourceDocument,
  dependencies: IngestionDependencies,
): Promise<"ingested" | "skipped"> {
  const existingHash = await dependencies.findContentHash(document.source);
  if (existingHash === document.contentHash) return "skipped";

  const splits = await dependencies.split(document.content, document.source);
  const embeddings = await dependencies.embed(splits.map((split) => split.content));
  const chunks = splits.map((split, index) => ({
    ...split,
    embedding: embeddings[index],
  }));
  await dependencies.persist({
    chunks,
    contentHash: document.contentHash,
    source: document.source,
    title: document.title,
  });
  return "ingested";
}
```

- [ ] **Step 8: Add and pass the changed-content test**

Add:

```ts
test("ingestDocument embeds and persists changed content", async () => {
  const document = { content: "changed", contentHash: hashContent("changed"), source: "doc.md", title: "doc" };
  let embeddedContents: string[] = [];
  let persisted: unknown;

  const result = await ingestDocument(document, {
    findContentHash: async () => hashContent("old"),
    split: async () => [
      { content: "first", metadata: { chunkIndex: 0 } },
      { content: "second", metadata: { chunkIndex: 1 } },
    ],
    embed: async (contents) => {
      embeddedContents = contents;
      return [[0.1, 0.2], [0.3, 0.4]];
    },
    persist: async (input) => { persisted = input; },
  });

  assert.equal(result, "ingested");
  assert.deepEqual(embeddedContents, ["first", "second"]);
  assert.deepEqual(persisted, {
    chunks: [
      { content: "first", embedding: [0.1, 0.2], metadata: { chunkIndex: 0 } },
      { content: "second", embedding: [0.3, 0.4], metadata: { chunkIndex: 1 } },
    ],
    contentHash: document.contentHash,
    source: "doc.md",
    title: "doc",
  });
});
```

Run the Node test command. Expected: all tests pass.

- [ ] **Step 9: Add embedding-count validation**

Write this failing test:

```ts
test("ingestDocument rejects an embedding count mismatch", async () => {
  await assert.rejects(
    ingestDocument(
      { content: "changed", contentHash: hashContent("changed"), source: "doc.md", title: "doc" },
      {
        findContentHash: async () => null,
        split: async () => [
          { content: "first", metadata: {} },
          { content: "second", metadata: {} },
        ],
        embed: async () => [[0.1]],
        persist: async () => undefined,
      },
    ),
    /Expected 2 embeddings, received 1/,
  );
});
```

Then add before chunk mapping:

```ts
if (embeddings.length !== splits.length) {
  throw new Error(`Expected ${splits.length} embeddings, received ${embeddings.length}`);
}
```

Run the Node test command. Expected: all tests pass.

- [ ] **Step 10: Commit the workflow task**

```bash
git add backend/scripts/ingest-docs-core.ts backend/scripts/ingest-docs.test.ts
git commit -m "test: define document ingestion workflow"
```

---

### Task 3: Filesystem, LangChain, OpenAI, and Prisma adapters

**Files:**
- Modify: `backend/scripts/ingest-docs.ts`

**Interfaces:**
- Consumes: `SourceDocument`, `PersistDocumentInput`, `hashContent`, and `ingestDocument` from Task 2.
- Consumes: Prisma compound selector `environment_source` from Task 1.
- Produces: Executable CLI ingestion pipeline using the shared Prisma singleton.

- [ ] **Step 1: Write a failing source-loader test**

Add these imports and the loader test:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashContent, ingestDocument, loadDocuments } from "./ingest-docs-core";

test("loadDocuments loads sorted Markdown files with hashes", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ingest-docs-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  await Promise.all([
    writeFile(path.join(directory, "b.md"), "second"),
    writeFile(path.join(directory, "a.md"), "first"),
    writeFile(path.join(directory, "ignore.txt"), "ignored"),
  ]);

  assert.deepEqual(await loadDocuments(directory), [
    {
      content: "first",
      contentHash: hashContent("first"),
      source: path.join(directory, "a.md"),
      title: "a",
    },
    {
      content: "second",
      contentHash: hashContent("second"),
      source: path.join(directory, "b.md"),
      title: "b",
    },
  ]);
});
```

Run:

```bash
cd backend
node --import tsx --test scripts/ingest-docs.test.ts
```

Expected: FAIL because `loadDocuments` is not exported from the core module.

- [ ] **Step 2: Implement the filesystem loader in the core module**

Add `readdir`, `readFile`, and `path` imports and:

```ts
export async function loadDocuments(directory: string): Promise<SourceDocument[]> {
  const fileNames = (await readdir(directory))
    .filter((fileName) => fileName.endsWith(".md"))
    .sort();

  return Promise.all(fileNames.map(async (fileName) => {
    const source = path.join(directory, fileName);
    const content = await readFile(source, "utf8");
    return {
      content,
      contentHash: hashContent(content),
      source,
      title: path.basename(fileName, ".md"),
    };
  }));
}
```

Run the test command. Expected: all tests pass.

- [ ] **Step 3: Replace the CLI placeholder with production adapters**

Replace `backend/scripts/ingest-docs.ts` with:

```ts
import "dotenv/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { prisma } from "@/lib/prisma";
import { ingestDocument, loadDocuments, type PersistDocumentInput } from "./ingest-docs-core";

const DOCS_DIRECTORY = path.join("data", "docs", "langchain");
const ENVIRONMENT = "dev";

async function persistDocument(input: PersistDocumentInput): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const document = await transaction.document.upsert({
      where: {
        environment_source: { environment: ENVIRONMENT, source: input.source },
      },
      create: {
        environment: ENVIRONMENT,
        source: input.source,
        title: input.title,
        contentHash: input.contentHash,
        metadata: { source: input.source },
      },
      update: {
        title: input.title,
        contentHash: input.contentHash,
        metadata: { source: input.source },
      },
    });

    await transaction.documentChunk.deleteMany({
      where: { documentId: document.id },
    });

    for (const chunk of input.chunks) {
      const vector = `[${chunk.embedding.join(",")}]`;
      await transaction.$executeRaw`
        INSERT INTO "document_chunks"
          ("id", "document_id", "content", "metadata", "embedding")
        VALUES
          (${randomUUID()}::uuid, ${document.id}::uuid, ${chunk.content},
           ${JSON.stringify(chunk.metadata)}::jsonb, ${vector}::vector)
      `;
    }
  });
}

async function main(): Promise<void> {
  const documents = await loadDocuments(DOCS_DIRECTORY);
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
  let ingested = 0;
  let skipped = 0;

  for (const document of documents) {
    const result = await ingestDocument(document, {
      findContentHash: async (source) => {
        const existing = await prisma.document.findUnique({
          where: {
            environment_source: { environment: ENVIRONMENT, source },
          },
          select: { contentHash: true },
        });
        return existing?.contentHash ?? null;
      },
      split: async (content, source) => {
        const splits = await textSplitter.splitDocuments([
          new Document({ pageContent: content, metadata: { source } }),
        ]);
        return splits.map((split, chunkIndex) => ({
          content: split.pageContent,
          metadata: { ...split.metadata, chunkIndex },
        }));
      },
      embed: (contents) => embeddings.embedDocuments(contents),
      persist: persistDocument,
    });

    if (result === "ingested") ingested += 1;
    else skipped += 1;
    console.log(`${result}: ${document.source}`);
  }

  console.log(`Completed ingestion: ${ingested} ingested, ${skipped} skipped.`);
}

main()
  .catch((error: unknown) => {
    console.error("Failed to ingest LangChain documentation:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 4: Confirm raw inserts are parameterized and generated search vectors are omitted**

Run:

```bash
cd backend
rg -n '\$executeRaw|search_vector|text-embedding-3-small|chunkSize: 1000|chunkOverlap: 200' scripts/ingest-docs.ts
```

Expected: `$executeRaw`, model, and chunk settings match; `search_vector` does not appear in the insert column list.

- [ ] **Step 5: Compile the script**

Run:

```bash
cd backend
npx tsc -p scripts/tsconfig.json
```

Expected: exit 0 with no diagnostics.

- [ ] **Step 6: Commit the adapter task**

```bash
git add backend/scripts/ingest-docs.ts backend/scripts/ingest-docs-core.ts backend/scripts/ingest-docs.test.ts
git commit -m "feat: ingest LangChain documents"
```

---

### Task 4: Final verification

**Files:**
- Verify only; modify files only if a verification failure traces to this feature.

**Interfaces:**
- Consumes: Complete ingestion schema, core, CLI adapter, and tests.
- Produces: Evidence that the requested workflow compiles and its isolated behavior passes.

- [ ] **Step 1: Run focused ingestion tests**

```bash
cd backend
node --import tsx --test scripts/ingest-docs.test.ts
```

Expected: all ingestion tests pass.

- [ ] **Step 2: Validate Prisma and compile all TypeScript targets**

```bash
cd backend
npx prisma validate
npx prisma generate
npm run build:ts
npx tsc -p scripts/tsconfig.json
```

Expected: every command exits 0.

- [ ] **Step 3: Run the existing backend test suite**

```bash
cd backend
npm test
```

Expected: all existing tests pass.

- [ ] **Step 4: Check migration and worktree scope**

```bash
git diff --check
git status --short
git diff -- backend/prisma backend/scripts
```

Expected: no whitespace errors; only requested implementation files plus pre-existing user changes are present.

- [ ] **Step 5: Optional live integration check**

Only when `DATABASE_URL` points to a migrated PostgreSQL database and `OPENAI_API_KEY` is configured:

```bash
cd backend
npx tsx --tsconfig scripts/tsconfig.json scripts/ingest-docs.ts
```

Expected on first run: documents reported as ingested. Expected on immediate second run: every document reported as skipped.
