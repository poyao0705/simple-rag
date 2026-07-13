export const retrievalConfig = {
	EMBEDDING_MODEL: "text-embedding-3-small",
	EMBEDDING_DIMENSIONS: 1536,
	RERANK_MODEL: "rerank-v4.0-pro",
	FTS_LIMIT: 50,
	SEMANTIC_LIMIT: 50,
	RRF_RANK_CONSTANT: 60,
	FUSE_LIMIT: 30,
	RERANK_LIMIT: 8,
} as const;
