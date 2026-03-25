FROM oven/bun
WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .
RUN bun run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh", "-c", "bun run start -p ${PORT:-4000}"]
