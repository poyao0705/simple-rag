import fp from "fastify-plugin";
import { type AppAgent, createAppAgent } from "../services/agent/agent.js";

declare module "fastify" {
	interface FastifyInstance {
		agent: AppAgent;
	}
}

export default fp(
	async (fastify) => {
		const model = process.env.OPENAI_MODEL;
		const apiKey = process.env.OPENAI_API_KEY;

		if (!model) {
			throw new Error("OPENAI_MODEL is not configured");
		}

		if (!apiKey) {
			throw new Error("OPENAI_API_KEY is not configured");
		}

		fastify.decorate("agent", createAppAgent({ model, apiKey }));
	},
	{ name: "agent" },
);
