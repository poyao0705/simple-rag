export type RetrievalCandidate = {
	chunkId: string;
	documentId: string;
	content: string;
	source: string | null;
	title: string | null;
	chunkIndex: number | null;
	score: number;
};

export type FusedCandidate = RetrievalCandidate & {
	rrfScore: number;
	ranks: {
		fts?: number;
		vector?: number;
	};
};

export type RerankedCandidate = FusedCandidate & {
	rerankScore: number;
};
