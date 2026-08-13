import { OpenAIEmbeddings } from "@langchain/openai";
import { fullTextSearch } from "./full-text-search.js";
import { reciprocalRankFusion } from "./reciprocal-rank-fusion.js";
import { rerank } from "./rerank.js";
import { semanticSearch } from "./semantic-search.js";
import { retrievalConfig } from "./utils/config.js";

// Reuse the embedding client across requests and keep its model in sync with
// the model configured for the retrieval pipeline.
const embeddings = new OpenAIEmbeddings({
	model: retrievalConfig.EMBEDDING_MODEL,
});

/**
 * Runs hybrid retrieval for a query.
 *
 * Lexical and semantic searches run in parallel. Their ranked results are
 * combined with reciprocal rank fusion, then the most promising candidates
 * are sent to the more expensive final reranker.
 *
 * @param query The user's natural-language search query.
 * @param environment The document scope to search.
 * @returns Candidates ordered by the final reranking step.
 */
export async function retrieve(query: string, environment: string) {
	// Use one normalized value for every retrieval stage so the full-text
	// parser, embedding model, and reranker all receive the same query text.
	const normalizedQuery = query.trim();

	// A blank query cannot produce useful lexical or semantic matches. Return
	// before making provider or database calls for this invalid search input.
	if (!normalizedQuery) {
		return [];
	}

	// Start both retrieval strategies before awaiting either one. Full-text
	// search provides lexical matching for exact terms, while vector search
	// finds chunks that are semantically related even when wording differs.
	// Starting them together lets their independent latency overlap.
	const ftsPromise = fullTextSearch({
		query: normalizedQuery,
		environment,
		limit: retrievalConfig.FTS_LIMIT,
	});

	// Semantic retrieval first turns the query into the same embedding space
	// used for indexed document chunks, then searches pgvector in the database.
	// This promise starts the embedding request immediately; the full-text
	// request above continues while the embedding service is responding.
	const vectorPromise = embeddings
		.embedQuery(normalizedQuery)
		.then((embedding) =>
			semanticSearch({
				embedding,
				environment,
				limit: retrievalConfig.SEMANTIC_LIMIT,
			}),
		);

	// Fusion needs both ranked lists. Promise.all also preserves the source
	// order here, so each result set is passed to the correct fusion list.
	const [ftsResults, vectorResults] = await Promise.all([
		ftsPromise,
		vectorPromise,
	]);

	// Full-text rank and vector similarity are different score systems and
	// should not be compared directly. Reciprocal rank fusion combines their
	// positions instead, rewarding chunks that rank well in either or both
	// retrieval strategies.
	const fused = reciprocalRankFusion(
		[
			{ name: "fts", results: ftsResults },
			{ name: "vector", results: vectorResults },
		],
		retrievalConfig.RRF_RANK_CONSTANT,
	);

	// Fusion can leave a larger candidate set than the final reranker should
	// inspect. Limit that pool first to control reranking cost, then let the
	// reranker use the original query and candidate content for fine-grained
	// relevance scoring before returning the configured number of results.
	return rerank(
		normalizedQuery,
		fused.slice(0, retrievalConfig.FUSE_LIMIT),
		retrievalConfig.RERANK_LIMIT,
	);
}
