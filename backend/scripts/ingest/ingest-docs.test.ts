import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
	hashContent,
	ingestDocument,
	loadDocuments,
} from "./ingest-docs-core";

test("hashContent returns a deterministic SHA-256 digest", () => {
	assert.equal(
		hashContent("LangChain"),
		"63c34d5ded165a695acdf3669191ab6ebeb38aa54176056e35d3cf53fdcd7c21",
	);
});

test("ingestDocument skips unchanged content before splitting or embedding", async () => {
	const document = {
		content: "same",
		contentHash: hashContent("same"),
		source: "doc.md",
		title: "doc",
	};
	const fail = async () => {
		throw new Error("must not be called");
	};

	const result = await ingestDocument(document, {
		findContentHash: async () => document.contentHash,
		split: fail,
		embed: fail,
		persist: fail,
	});

	assert.equal(result, "skipped");
});

test("ingestDocument embeds and persists changed content", async () => {
	const document = {
		content: "changed",
		contentHash: hashContent("changed"),
		source: "doc.md",
		title: "doc",
	};
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
			return [
				[0.1, 0.2],
				[0.3, 0.4],
			];
		},
		persist: async (input) => {
			persisted = input;
		},
	});

	assert.equal(result, "ingested");
	assert.deepEqual(embeddedContents, ["first", "second"]);
	assert.deepEqual(persisted, {
		chunks: [
			{
				content: "first",
				embedding: [0.1, 0.2],
				metadata: { chunkIndex: 0 },
			},
			{
				content: "second",
				embedding: [0.3, 0.4],
				metadata: { chunkIndex: 1 },
			},
		],
		contentHash: document.contentHash,
		source: "doc.md",
		title: "doc",
	});
});

test("ingestDocument rejects an embedding count mismatch", async () => {
	await assert.rejects(
		ingestDocument(
			{
				content: "changed",
				contentHash: hashContent("changed"),
				source: "doc.md",
				title: "doc",
			},
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
