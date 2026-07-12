import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

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
	split(
		content: string,
		source: string,
	): Promise<Array<{ content: string; metadata: Record<string, unknown> }>>;
	embed(contents: string[]): Promise<number[][]>;
	persist(input: PersistDocumentInput): Promise<void>;
};

export function hashContent(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function loadDocuments(
	directory: string,
): Promise<SourceDocument[]> {
	const fileNames = (await readdir(directory))
		.filter((fileName) => fileName.endsWith(".md"))
		.sort();

	return Promise.all(
		fileNames.map(async (fileName) => {
			const source = path.join(directory, fileName);
			const content = await readFile(source, "utf8");
			return {
				content,
				contentHash: hashContent(content),
				source,
				title: path.basename(fileName, ".md"),
			};
		}),
	);
}

export async function ingestDocument(
	document: SourceDocument,
	dependencies: IngestionDependencies,
): Promise<"ingested" | "skipped"> {
	const existingHash = await dependencies.findContentHash(document.source);
	if (existingHash === document.contentHash) {
		return "skipped";
	}

	const splits = await dependencies.split(document.content, document.source);
	const embeddings = await dependencies.embed(
		splits.map((split) => split.content),
	);
	if (embeddings.length !== splits.length) {
		throw new Error(
			`Expected ${splits.length} embeddings, received ${embeddings.length}`,
		);
	}
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
