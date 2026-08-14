# Build context is the REPO ROOT, not this directory: fake-mychart imports the
# shared AMF3 writer and CLO wrapper encoder from ../shared (see
# next.config.ts). The image mirrors the repo layout so those relative paths
# resolve identically inside and outside the container.
#
#   docker build -f fake-mychart/Dockerfile .        # from the repo root
#   docker compose -f docker-compose.ci.yaml build   # does this for you
#   cd fake-mychart && bun run deploy                # chdirs to the root first
FROM oven/bun
WORKDIR /app/fake-mychart

COPY fake-mychart/package.json ./
RUN bun install

COPY shared/ /app/shared/
COPY fake-mychart/ ./
RUN bun run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["sh", "-c", "bun run start -p ${PORT:-8080}"]
