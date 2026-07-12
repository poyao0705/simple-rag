import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";

const DOCS_BASE = "https://docs.langchain.com";

// Curated LangChain OSS pages for this tutorial. Expand this list or filter
// llms.txt URLs to index more of the site.
const DOC_PATHS = [
	"oss/javascript/langchain/agents",
	"oss/javascript/deepagents/rag",
	"oss/javascript/langchain/tools",
	"oss/javascript/langchain/models",
	"oss/javascript/langchain/retrieval",
	"oss/javascript/langchain/knowledge-base",
	"oss/javascript/langchain/middleware",
	"oss/javascript/deepagents/overview",
	"oss/javascript/deepagents/subagents",
	"oss/javascript/deepagents/streaming",
	"oss/javascript/deepagents/frontend/subagent-streaming",
	"oss/javascript/deepagents/backends",
	"oss/javascript/langgraph/overview",
	"oss/javascript/langgraph/quickstart",
];

async function main() {
	await mkdir("data/docs/langchain", { recursive: true });

	for (const docPath of DOC_PATHS) {
		const url = `${DOCS_BASE}/${docPath}.md`;

		const response = await fetch(url);
		const text = await response.text();

		const file = path.join(
			"data/docs/langchain",
			`${docPath.replaceAll("/", "__")}.md`,
		);

		await writeFile(file, text);
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
