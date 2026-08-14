/**
 * Static file server for the expo web export (expo-app/dist) with an
 * SPA fallback to index.html, so expo-router client-side routes work
 * on hard navigation. Run with: bun serve-dist.ts (PORT, default 8088).
 */
import { join, normalize } from "path";
import { existsSync, statSync } from "fs";

const PORT = Number(process.env.PORT ?? 8088);
const DIST = process.env.DIST_DIR ?? join(import.meta.dir, "../../dist");

if (!existsSync(join(DIST, "index.html"))) {
  console.error(
    `No web export found at ${DIST}. Run \`bun run export\` in e2e/web first.`,
  );
  process.exit(1);
}

const server = Bun.serve({
  port: PORT,
  fetch(request) {
    const url = new URL(request.url);
    const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(DIST, safePath);

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(DIST, "index.html"); // SPA fallback
    }
    return new Response(Bun.file(filePath));
  },
});

console.log(`[serve-dist] serving ${DIST} on http://localhost:${server.port}`);
