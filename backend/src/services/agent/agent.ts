import { createAgent } from "langchain";
import { Providers } from "@/services/llm/providers.js";

export type CreateAppAgentOptions = {
	apiKey: string;
	model: string;
};

export function createAppAgent(options: CreateAppAgentOptions) {
	const model = new Providers.OPENAI({
		model: options.model,
		apiKey: options.apiKey,
	});

	return createAgent({
		model,
		// tools: [],
	});
}

export type AppAgent = ReturnType<typeof createAppAgent>;
