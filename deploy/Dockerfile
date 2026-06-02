# ---- build stage ----
FROM oven/bun:1.1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- runtime ----
FROM oven/bun:1.1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["bun", "run", ".output/server/index.mjs"]
