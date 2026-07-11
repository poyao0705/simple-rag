import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";

export const Providers = {
	OPENAI: ChatOpenAI,
	ANTHROPIC: ChatAnthropic,
} as const;

export default Providers;
