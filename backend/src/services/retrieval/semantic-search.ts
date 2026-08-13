import { prisma } from "@/lib/prisma.js";
import { retrievalConfig } from "./utils/config.js";
import type { RetrievalCandidate } from "./utils/types.js";

type SemanticSearchInput = {
	embedding: number[];
	environment: string;
	limit: number;
};

/**
 * Finds document chunks by semantic similarity to a query embedding.
 *
 * The embedding is validated before it is sent to PostgreSQL because pgvector
 * requires the configured dimensionality, and non-finite values cannot form a
 * valid vector literal. The returned score is the cosine similarity derived
 * from pgvector's cosine distance (`1 - distance`).
 *
 * @param embedding The query embedding produced by the configured embedding model.
 * @param environment The document scope to search.
 * @param limit Maximum number of chunks to return.
 * @returns Chunks ordered from the most semantically similar to the least.
 */
export async function semanticSearch({
	embedding,
	environment,
	limit,
}: SemanticSearchInput): Promise<RetrievalCandidate[]> {
	// Query embeddings come from an external model, so validate them before
	// constructing SQL. The stored pgvector column and the query embedding
	// must have the same dimension, and NaN/Infinity are not valid vector values.
	if (
		embedding.length !== retrievalConfig.EMBEDDING_DIMENSIONS ||
		embedding.some((value) => !Number.isFinite(value))
	) {
		throw new Error(
			`Expected a valid ${retrievalConfig.EMBEDDING_DIMENSIONS}-dimensional query embedding`,
		);
	}

	// pgvector accepts a bracketed comma-separated vector literal. The value is
	// interpolated through Prisma's tagged query so it remains a bound parameter;
	// the `::vector` casts in the SQL convert it to PostgreSQL's vector type.
	const vector = `[${embedding.join(",")}]`;

	return prisma.$queryRaw<RetrievalCandidate[]>`
    -- Match the full-text result shape so both retrieval strategies can share
    -- the same candidate type and be combined by reciprocal rank fusion.
    SELECT
      dc."id" AS "chunkId",
      dc."document_id" AS "documentId",
      dc."content",
      d."source",
      d."title",
      (dc."metadata"->>'chunkIndex')::integer AS "chunkIndex",
      -- pgvector's cosine operator returns distance. Convert it to similarity
      -- for the candidate score, where a larger value indicates a closer match.
      (
        1 - (dc."embedding" <=> ${vector}::vector)
      )::double precision AS "score"
    FROM "document_chunks" dc
    -- Chunks contain the embeddings and content; the parent document supplies
    -- metadata such as source/title and the environment used for isolation.
    JOIN "documents" d
      ON d."id" = dc."document_id"
    -- Apply the scope before ranking so results from another environment can
    -- never enter this retrieval stage.
    WHERE d."environment" = ${environment}
    -- Cosine distance is ordered ascending: the smallest distance is the most
    -- similar chunk. The chunk ID makes ties deterministic across executions.
    ORDER BY
      dc."embedding" <=> ${vector}::vector ASC,
      dc."id" ASC
    -- Return only the top semantic candidates; this pool is later fused with
    -- full-text results and reduced again before the expensive reranker.
    LIMIT ${limit}
  `;
}
