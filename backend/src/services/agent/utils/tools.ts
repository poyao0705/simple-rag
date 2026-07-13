import { tool } from "langchain";
import * as z from "zod";
import { retrieve } from "@/services/retrieval/retrieve.js";

export const searchDocument = tool(
	async ({ query }) => {
		const environment = process.env.APP_ENVIRONMENT;
		if (!environment) {
			throw new Error("APP_ENVIRONMENT is not set");
		}
		const result = await retrieve(query, environment);
		return result;
	},
	{
		name: "search_document",
		description: "Search for a document.",
		schema: z.object({
			query: z.string().describe("Natural language search query."),
		}),
	},
);
