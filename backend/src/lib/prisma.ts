// src/lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client.js";

const connectingString = process.env.DATABASE_URL;
if (!connectingString) {
	throw new Error("DATABASE_URL is not set");
}

export const prisma = new PrismaClient({
	adapter: new PrismaPg(connectingString),
});
