# Backend ESM Migration Design

## Goal

Migrate the complete `backend` package from CommonJS assumptions to native ECMAScript modules while preserving its current Fastify application behavior, TypeScript build, tests, Prisma tooling, and ingestion scripts.

## Scope

The migration covers the backend package boundary, Fastify runtime, tests, Prisma configuration, and ingestion scripts. The frontend is already an ESM package and will not change. The root package will not become an ESM package because it has no runtime source and does not need a module-system declaration.

The supported runtime is Node.js 24. No dependency upgrades, application-logic refactors, dual-module build, or CommonJS compatibility output are included.

## Architecture

`backend/package.json` will declare `"type": "module"`. The existing TypeScript configuration will continue to inherit `module: "NodeNext"` and `moduleResolution: "NodeNext"` from `fastify-tsconfig`, aligning TypeScript's source checking and emitted JavaScript with Node's native ESM rules.

Package imports will remain bare specifiers. Every handwritten relative runtime import in backend source, tests, and scripts will use the emitted `.js` extension. Type-only imports follow the same NodeNext specifier rules. Generated Prisma files already use ESM-compatible `.js` specifiers and will not be manually edited.

The production flow remains TypeScript compilation followed by Fastify CLI loading `dist/app.js`. The emitted module graph must be directly loadable by Node 24 without experimental resolution flags or a bundler.

## Runtime and Tooling Changes

`backend/src/app.ts` and `backend/test/helper.ts` will replace CommonJS `__dirname` usage with Node 24's `import.meta.dirname`.

The test helper will replace `require("fastify-cli/helper.js")` with an ESM default import. `fastify-cli` is a CommonJS dependency, and Node's documented CommonJS interoperability exposes its `module.exports` value as the default ESM import. No `createRequire` bridge is needed.

The backend test command will retain its current compile and test-typecheck gates, but execute TypeScript tests with Node's test runner and the `tsx` import hook instead of `ts-node/register`. This removes the CommonJS loader while continuing to run the existing `.ts` tests directly.

The ingestion scripts and their tests will continue to run as TypeScript entry points through `tsx`. The ingestion entry point's `@/lib/prisma` alias will become a relative `.js` import because plain Node ESM does not resolve TypeScript `paths` aliases in emitted JavaScript. Relative imports between ingestion files will also use `.js` specifiers.

`prisma.config.ts` already uses ESM syntax and requires no source change. It inherits ESM interpretation from the backend package boundary.

## Application Behavior and Errors

The migration changes module loading only. Routes, plugins, services, database behavior, environment validation, and application-level error handling remain unchanged.

Module-resolution mistakes should fail at the earliest appropriate boundary: TypeScript compilation for invalid source specifiers or unavailable CommonJS globals, test startup for loader interoperability, and the production smoke import for emitted-graph issues. Checks will not be weakened to hide failures caused by missing external services or environment variables; those failures will be identified separately from ESM regressions.

## Verification

The completed migration must satisfy all of the following:

1. TypeScript compiles the backend successfully with the existing NodeNext build.
2. The backend Fastify route and plugin tests pass through Node's test runner with `tsx`.
3. The ingestion unit tests pass through Node's test runner with `tsx`.
4. Node 24 can dynamically import `backend/dist/app.js` after compilation.
5. Root lint passes for the backend and frontend.
6. Handwritten backend code contains no `require`, `module.exports`, `__dirname`, or `__filename` usage.
7. Handwritten backend relative runtime imports are valid native-ESM specifiers with `.js` extensions.

Generated Prisma output is excluded from the handwritten-code scans because it is generator-owned and already emits ESM-compatible specifiers.

## Change Safety

Existing uncommitted edits in `README.md` and `backend/src/routes/api/chat/index.ts` belong to the user and will be preserved. The chat route may receive only the `.js` extension required on its existing relative provider import. No other content in those edits will be changed.
