import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";

export const Providers = {
	OPENAI: ChatOpenAI,
	ANTHROPIC: ChatAnthropic,
} as const;

export default Providers;
