import { randomUUID } from "node:crypto";
import path from "node:path";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { prisma } from "@/lib/prisma";
import {
	ingestDocument,
	loadDocuments,
	type PersistDocumentInput,
} from "./ingest-docs-core";

const DOCS_DIRECTORY = path.join("data", "docs", "langchain");
const ENVIRONMENT = "dev";

async function persistDocument(input: PersistDocumentInput): Promise<void> {
	await prisma.$transaction(async (transaction) => {
		const document = await transaction.document.upsert({
			where: {
				environment_source: {
					environment: ENVIRONMENT,
					source: input.source,
				},
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
	const embeddings = new OpenAIEmbeddings({
		model: "text-embedding-3-small",
	});
	let ingested = 0;
	let skipped = 0;

	for (const document of documents) {
		const result = await ingestDocument(document, {
			findContentHash: async (source) => {
				const existing = await prisma.document.findUnique({
					where: {
						environment_source: {
							environment: ENVIRONMENT,
							source,
						},
					},
					select: { contentHash: true },
				});

				return existing?.contentHash ?? null;
			},
			split: async (content, source) => {
				const splits = await textSplitter.splitDocuments([
					new Document({
						pageContent: content,
						metadata: { source },
					}),
				]);

				return splits.map((split, chunkIndex) => ({
					content: split.pageContent,
					metadata: { ...split.metadata, chunkIndex },
				}));
			},
			embed: (contents) => embeddings.embedDocuments(contents),
			persist: persistDocument,
		});

		if (result === "ingested") {
			ingested += 1;
		} else {
			skipped += 1;
		}
		console.log(`${result}: ${document.source}`);
	}

	console.log(
		`Completed ingestion: ${ingested} ingested, ${skipped} skipped.`,
	);
}

main()
	.catch((error: unknown) => {
		console.error("Failed to ingest LangChain documentation:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
