import type { FusedCandidate, RetrievalCandidate } from "./utils/types.js";

type RankedList = {
	name: "fts" | "vector";
	results: RetrievalCandidate[];
};

export function reciprocalRankFusion(
	lists: RankedList[],
	rankConstant: number,
): FusedCandidate[] {
	const candidates = new Map<string, FusedCandidate>();

	for (const { name, results } of lists) {
		results.forEach((candidate, index) => {
			const rank = index + 1;
			const contribution = 1 / (rankConstant + rank);

			const existing = candidates.get(candidate.chunkId);

			if (existing) {
				existing.rrfScore += contribution;
				existing.ranks[name] = rank;
			} else {
				candidates.set(candidate.chunkId, {
					...candidate,
					rrfScore: contribution,
					ranks: { [name]: rank },
				});
			}
		});
	}

	return [...candidates.values()].sort(
		(left, right) =>
			right.rrfScore - left.rrfScore ||
			left.chunkId.localeCompare(right.chunkId),
	);
}
