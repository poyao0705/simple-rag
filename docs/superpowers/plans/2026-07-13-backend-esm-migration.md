# Backend ESM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the complete backend package to native Node.js 24 ESM while preserving Fastify runtime behavior, TypeScript compilation, tests, Prisma tooling, and ingestion scripts.

**Architecture:** Declare ESM at the backend package boundary and retain TypeScript NodeNext compilation. Handwritten relative imports name emitted `.js` files, Node 24 runtime globals replace CommonJS globals, and `tsx` loads TypeScript tests without a CommonJS registration hook.

**Tech Stack:** Node.js 24, TypeScript 5.9 NodeNext, Fastify 5/Fastify CLI 8, Node test runner, tsx 4, c8, pnpm.

## Global Constraints

- The supported runtime is Node.js 24.
- Do not upgrade dependencies.
- Do not create a dual-module build or CommonJS compatibility output.
- Do not change application behavior, routes, services, database behavior, environment validation, or error handling.
- Do not modify the frontend or root package module boundary.
- Preserve existing uncommitted edits in `README.md` and `backend/src/routes/api/chat/index.ts`; only add the required `.js` extension to the chat route's existing relative import.
- Do not manually edit generated Prisma files under `backend/src/generated/prisma`.

---

### Task 1: Convert the Fastify Runtime and Test Harness

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/lib/prisma.ts`
- Modify: `backend/src/services/llm/index.ts`
- Modify: `backend/src/routes/api/chat/index.ts`
- Modify: `backend/test/helper.ts`
- Modify: `backend/test/routes/root.test.ts`
- Modify: `backend/test/routes/example.test.ts`
- Modify: `backend/test/plugins/support.test.ts`
- Test: `backend/test/routes/root.test.ts`
- Test: `backend/test/routes/example.test.ts`
- Test: `backend/test/plugins/support.test.ts`

**Interfaces:**
- Consumes: Fastify CLI's CommonJS `helper.js` module through Node's default-import interoperability.
- Produces: an ESM backend package whose compiled `dist/app.js` and TypeScript Fastify tests load with native Node resolution.

- [ ] **Step 1: Run structural checks that demonstrate the CommonJS assumptions**

Run:

```bash
node -e "const p=require('./backend/package.json'); if (p.type !== 'module') process.exit(1)"
rg -n 'require\(|__dirname|__filename|from ["'"']\.{1,2}/[^"'"']+["'"']' backend/src backend/test -g '!backend/src/generated/**'
```

Expected: the package check exits 1, and the scan reports `require`, `__dirname`, and extensionless relative imports.

- [ ] **Step 2: Declare ESM and switch the test loader**

Add `"type": "module"` after the backend package version and replace the test script in `backend/package.json` so the relevant section is exactly:

```json
{
  "name": "backend",
  "version": "1.0.0",
  "type": "module",
  "description": "This project was bootstrapped with Fastify-CLI.",
  "main": "app.ts",
  "directories": {
    "test": "test"
  },
  "scripts": {
    "test": "npm run build:ts && tsc -p test/tsconfig.json && c8 node --import tsx --test \"test/**/*.ts\"",
    "start": "npm run build:ts && fastify start -l info dist/app.js",
    "build:ts": "tsc",
    "watch:ts": "tsc -w",
    "dev": "npm run build:ts && concurrently -k -p \"[{name}]\" -n \"TypeScript,App\" -c \"yellow.bold,cyan.bold\" \"npm:watch:ts\" \"npm:dev:start\"",
    "dev:start": "fastify start --ignore-watch=.ts$ -w -l info -P dist/app.js"
  }
}
```

Keep all existing metadata and dependencies below this section unchanged.

- [ ] **Step 3: Replace CommonJS directory globals in the runtime and helper**

In `backend/src/app.ts`, replace both autoload paths with:

```ts
dir: join(import.meta.dirname, "plugins"),
```

and:

```ts
dir: join(import.meta.dirname, "routes"),
```

In `backend/test/helper.ts`, replace the helper import and application path with:

```ts
import helper from 'fastify-cli/helper.js'
import * as path from 'node:path'
import * as test from 'node:test'

const AppPath = path.join(import.meta.dirname, '..', 'src', 'app.ts')
```

Keep `TestContext`, `config`, `build`, and the named exports unchanged.

- [ ] **Step 4: Make handwritten runtime imports Node ESM-compatible**

Apply these exact specifier changes:

```ts
// backend/src/lib/prisma.ts
import { PrismaClient } from "../generated/prisma/client.js";

// backend/src/services/llm/index.ts
export { Providers as providers } from "./providers.js";

// backend/src/routes/api/chat/index.ts
import { Providers } from "../../../services/llm/providers.js";

// backend/test/routes/root.test.ts and backend/test/routes/example.test.ts
import { build } from '../helper.js'

// backend/test/plugins/support.test.ts
import Support from '../../src/plugins/support.js'
```

Do not alter any other chat-route content.

- [ ] **Step 5: Run the backend build and Fastify tests**

Run:

```bash
pnpm --dir backend test
```

Expected: TypeScript build and test typecheck succeed; all Fastify route/plugin tests pass under `tsx`.

- [ ] **Step 6: Commit the runtime migration**

```bash
git add backend/package.json backend/src/app.ts backend/src/lib/prisma.ts backend/src/services/llm/index.ts backend/src/routes/api/chat/index.ts backend/test/helper.ts backend/test/routes/root.test.ts backend/test/routes/example.test.ts backend/test/plugins/support.test.ts
git commit -m "refactor: migrate backend runtime to ESM"
```

Before committing, use `git diff --cached` to confirm the pre-existing chat-route logic is included unchanged except for its import extension; do not stage `README.md`.

### Task 2: Convert Ingestion Scripts and Verify Native ESM Output

**Files:**
- Modify: `backend/scripts/ingest/ingest-docs.ts`
- Modify: `backend/scripts/ingest/ingest-docs.test.ts`
- Test: `backend/scripts/ingest/ingest-docs.test.ts`

**Interfaces:**
- Consumes: `prisma` from `backend/src/lib/prisma.ts` and ingestion functions/types from `backend/scripts/ingest/ingest-docs-core.ts` through native relative ESM specifiers.
- Produces: TypeScript ingestion entry points and tests that load through `tsx` without TypeScript path-alias or CommonJS resolution.

- [ ] **Step 1: Demonstrate extensionless ingestion imports**

Run:

```bash
rg -n 'from ["'"'](\.{1,2}/|@/)[^"'"']+["'"']' backend/scripts
```

Expected: the scan reports `@/lib/prisma` and `./ingest-docs-core` imports.

- [ ] **Step 2: Convert the ingestion imports**

In `backend/scripts/ingest/ingest-docs.ts`, use:

```ts
import { prisma } from "../../src/lib/prisma.js";
import {
	ingestDocument,
	loadDocuments,
	type PersistDocumentInput,
} from "./ingest-docs-core.js";
```

In `backend/scripts/ingest/ingest-docs.test.ts`, use:

```ts
import {
	hashContent,
	ingestDocument,
	loadDocuments,
} from "./ingest-docs-core.js";
```

Keep all ingestion behavior unchanged.

- [ ] **Step 3: Run ingestion unit tests and script typechecking**

Run:

```bash
cd backend && node --import tsx --test scripts/ingest/ingest-docs.test.ts
cd backend && tsc -p scripts/tsconfig.json
```

Expected: five ingestion tests pass and the scripts typecheck succeeds.

- [ ] **Step 4: Run production-output and repository verification**

Run:

```bash
pnpm --dir backend build:ts
node -e "import('./backend/dist/app.js').then((m) => { if (typeof m.default !== 'function') process.exit(1) })"
pnpm --dir backend test
pnpm lint
rg -n 'require\(|module\.exports|__dirname|__filename' backend/src backend/test backend/scripts -g '!backend/src/generated/**'
rg -n -P 'from ["'"']\.{1,2}/(?![^"'"']*\.js["'"'])' backend/src backend/test backend/scripts -g '!backend/src/generated/**'
```

Expected: build, smoke import, backend tests, and lint pass. Both final scans produce no output.

- [ ] **Step 5: Commit the ingestion migration**

```bash
git add backend/scripts/ingest/ingest-docs.ts backend/scripts/ingest/ingest-docs.test.ts
git commit -m "refactor: migrate backend scripts to ESM"
```

Do not stage `README.md`.
