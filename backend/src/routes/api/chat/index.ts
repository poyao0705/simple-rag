import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import type { FastifyPluginAsync } from "fastify";
import { Providers } from "../../../services/llm/providers";

const chat: FastifyPluginAsync = async (fastify): Promise<void> => {
	const modelId = process.env.OPENAI_MODEL;
	const openaiApiKey = process.env.OPENAI_API_KEY;
	const model = new Providers.OPENAI({ model: modelId, apiKey: openaiApiKey });

	fastify.post<{ Body: { messages: UIMessage[] } }>(
		"/",
		async (request, reply) => {
			const { messages } = request.body;
			const langchainMessages = await toBaseMessages(messages);
			const stream = await model.stream(langchainMessages);
			return reply.send(
				createUIMessageStreamResponse({
					stream: toUIMessageStream(stream),
				}),
			);
		},
	);
};

export default chat;
