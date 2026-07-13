import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import type { FastifyPluginAsync } from "fastify";

const chat: FastifyPluginAsync = async (fastify): Promise<void> => {
	fastify.post<{ Body: { messages: UIMessage[] } }>(
		"/",
		async (request, reply) => {
			const { messages } = request.body;
			const langchainMessages = await toBaseMessages(messages);
			const stream = await fastify.agent.stream(
				{ messages: langchainMessages },
				{ streamMode: ["values", "messages"] },
			);
			return reply.send(
				createUIMessageStreamResponse({
					stream: toUIMessageStream(stream),
				}),
			);
		},
	);
};

export default chat;
