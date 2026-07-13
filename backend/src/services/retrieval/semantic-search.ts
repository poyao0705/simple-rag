import { prisma } from "@/lib/prisma.js";
import { retrievalConfig } from "./utils/config.js";
import type { RetrievalCandidate } from "./utils/types.js";

type SemanticSearchInput = {
	embedding: number[];
	environment: string;
	limit: number;
};

export async function semanticSearch({
	embedding,
	environment,
	limit,
}: SemanticSearchInput): Promise<RetrievalCandidate[]> {
	if (
		embedding.length !== retrievalConfig.EMBEDDING_DIMENSIONS ||
		embedding.some((value) => !Number.isFinite(value))
	) {
		throw new Error(
			`Expected a valid ${retrievalConfig.EMBEDDING_DIMENSIONS}-dimensional query embedding`,
		);
	}

	const vector = `[${embedding.join(",")}]`;

	return prisma.$queryRaw<RetrievalCandidate[]>`
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
  `;
}
