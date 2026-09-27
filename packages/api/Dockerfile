FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY src ./src

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app /app
ENV PORT=4501
EXPOSE 4501
CMD ["bun", "run", "src/index.ts"]
