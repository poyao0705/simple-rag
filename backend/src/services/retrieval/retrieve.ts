import { OpenAIEmbeddings } from "@langchain/openai";
import { fullTextSearch } from "./full-text-search.js";
import { reciprocalRankFusion } from "./reciprocal-rank-fusion.js";
import { rerank } from "./rerank.js";
import { semanticSearch } from "./semantic-search.js";
import { retrievalConfig } from "./utils/config.js";

const embeddings = new OpenAIEmbeddings({
	model: retrievalConfig.EMBEDDING_MODEL,
});

export async function retrieve(query: string, environment: string) {
	const normalizedQuery = query.trim();

	if (!normalizedQuery) {
		return [];
	}

	const ftsPromise = fullTextSearch({
		query: normalizedQuery,
		environment,
		limit: retrievalConfig.FTS_LIMIT,
	});

	const vectorPromise = embeddings
		.embedQuery(normalizedQuery)
		.then((embedding) =>
			semanticSearch({
				embedding,
				environment,
				limit: retrievalConfig.SEMANTIC_LIMIT,
			}),
		);

	const [ftsResults, vectorResults] = await Promise.all([
		ftsPromise,
		vectorPromise,
	]);

	const fused = reciprocalRankFusion(
		[
			{ name: "fts", results: ftsResults },
			{ name: "vector", results: vectorResults },
		],
		retrievalConfig.RRF_RANK_CONSTANT,
	);

	return rerank(
		normalizedQuery,
		fused.slice(0, retrievalConfig.FUSE_LIMIT),
		retrievalConfig.RERANK_LIMIT,
	);
}
