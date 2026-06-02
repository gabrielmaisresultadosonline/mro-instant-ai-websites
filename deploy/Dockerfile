# ---- build stage ----
FROM oven/bun:1.2 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

# ---- runtime ----
FROM oven/bun:1.2-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["bun", "dist/server/index.mjs"]
