FROM node:24-slim AS development

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --filter backend... --frozen-lockfile

COPY backend backend
RUN DATABASE_URL=postgresql://postgres:postgres@postgres:5432/rag pnpm --filter backend exec prisma generate

WORKDIR /app/backend

EXPOSE 3000

CMD ["pnpm", "dev"]

FROM development AS production

WORKDIR /app
RUN pnpm --filter backend build:ts

WORKDIR /app/backend

CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec pnpm exec fastify start -a 0.0.0.0 -l info dist/app.js"]
