import { createAgent } from "langchain";
import { searchDocument } from "@/services/agent/utils/tools.js";
import { Providers } from "@/services/llm/providers.js";
import { SYSTEM_PROMPT } from "./utils/prompts.js";

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
		tools: [searchDocument],
		systemPrompt: SYSTEM_PROMPT,
	});
}

export type AppAgent = ReturnType<typeof createAppAgent>;
