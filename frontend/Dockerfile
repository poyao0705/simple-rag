FROM node:24-alpine AS development

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --filter frontend... --frozen-lockfile

COPY frontend frontend

WORKDIR /app/frontend

EXPOSE 80

CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "80"]

FROM development AS build

RUN pnpm build

FROM nginx:1.29-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
