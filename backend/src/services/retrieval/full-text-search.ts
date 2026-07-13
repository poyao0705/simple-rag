// full-text-search.ts
import { prisma } from "@/lib/prisma.js";
import type { RetrievalCandidate } from "./utils/types.js";

type FullTextSearchInput = {
	query: string;
	environment: string;
	limit: number;
};

export async function fullTextSearch({
	query,
	environment,
	limit,
}: FullTextSearchInput): Promise<RetrievalCandidate[]> {
	return prisma.$queryRaw<RetrievalCandidate[]>`
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
  `;
}
