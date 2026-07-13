import { CohereClient } from "cohere-ai";
import { retrievalConfig } from "./utils/config.js";
import type { FusedCandidate, RerankedCandidate } from "./utils/types.js";

const apiKey = process.env.COHERE_API_KEY;

if (!apiKey) {
	throw new Error("COHERE_API_KEY is not configured");
}

const cohere = new CohereClient({ token: apiKey });

export async function rerank(
	query: string,
	candidates: FusedCandidate[],
	limit: number,
): Promise<RerankedCandidate[]> {
	if (candidates.length === 0 || limit <= 0) {
		return [];
	}

	const response = await cohere.v2.rerank({
		documents: candidates.map((candidate) => candidate.content),
		query,
		topN: Math.min(limit, candidates.length),
		model: retrievalConfig.RERANK_MODEL,
	});

	return response.results.map((result) => {
		const candidate = candidates[result.index];

		if (!candidate) {
			throw new Error(
				`Cohere returned an invalid document index: ${result.index}`,
			);
		}

		return {
			...candidate,
			rerankScore: result.relevanceScore,
		};
	});
}
