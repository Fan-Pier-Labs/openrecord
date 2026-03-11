# Migrating web/ from Node.js/npm to Bun

## Why this is a clean migration

The `web/src/` codebase uses **zero Node-specific APIs** — no `require()`, no `node:` imports, no `__dirname`/`__filename`, no `process.env` references. Everything is ESM + TypeScript, which Bun handles natively. Next.js 16 has official Bun support.

## Steps

### 1. Swap the lockfile

```bash
cd web/
rm package-lock.json   # if one exists
bun install            # generates bun.lock
```

### 2. Update package.json scripts

Replace `npm run` / `npx` with `bun` equivalents. Use the `--bun` flag on Next.js commands so Next.js runs on the Bun runtime instead of Node.

```jsonc
{
  "scripts": {
    "dev": "bun --bun next dev",
    "build": "bun --bun next build",
    "start": "bun --bun next start",
    "lint": "next lint",
    "test": "bun vitest"
  }
}
```

### 3. Rewrite the Dockerfile

Replace the current Node-based multi-stage build:

```dockerfile
FROM oven/bun:1-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun --bun next build

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:bunjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:bunjs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

CMD ["bun", "server.js"]
```

### 4. Update .dockerignore

Add `bun.lock` awareness (no changes needed — the current `.dockerignore` doesn't exclude it).

### 5. Update .gitignore

Add `package-lock.json` so it doesn't come back:

```gitignore
# lockfiles (using bun)
package-lock.json
```

### 6. Vitest

No config changes required. Vitest works out of the box with Bun — just invoke it via `bun vitest` (or `bun test` if using Bun's built-in test runner, but `bun vitest` keeps the existing vitest config).

## Verification

After migrating, confirm everything works:

```bash
bun install                  # lockfile generates cleanly
bun --bun next dev           # dev server starts on localhost:3000
bun --bun next build         # production build succeeds
bun --bun next start         # standalone server runs
bun vitest                   # tests pass
docker build -t web-bun .    # Docker image builds
docker run -p 8080:8080 web-bun  # container runs
```

## Fallback

If you hit runtime compatibility issues with the `--bun` flag (e.g., a dependency that requires Node-specific internals), drop it from the affected scripts:

```jsonc
{
  "scripts": {
    "dev": "next dev",         // runs on Node, installed by Bun
    "build": "next build",
    "start": "next start"
  }
}
```

This still uses Bun as the package manager (faster installs, `bun.lock`) but runs Next.js on Node. You get most of the benefits without runtime risk.
