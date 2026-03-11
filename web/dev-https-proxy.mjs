import { createServer } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const certPath = join(__dirname, "localhost.pem");
const keyPath = join(__dirname, "localhost-key.pem");

// Auto-generate certs if missing
if (!existsSync(certPath) || !existsSync(keyPath)) {
  console.log("Generating SSL certificates with mkcert...");
  try {
    execSync("which mkcert", { stdio: "ignore" });
  } catch {
    console.error(
      "mkcert not found. Install it with: brew install mkcert && mkcert -install"
    );
    process.exit(1);
  }
  execSync(`mkcert -install`, { stdio: "inherit" });
  execSync(`mkcert -cert-file ${certPath} -key-file ${keyPath} localhost`, {
    stdio: "inherit",
  });
}

const cert = readFileSync(certPath);
const key = readFileSync(keyPath);
const TARGET_PORT = parseInt(process.env.PORT || "3000");
const SSL_PORT = parseInt(process.env.HTTPS_PORT || String(TARGET_PORT + 1));

const proxy = createServer({ cert, key }, (clientReq, clientRes) => {
  const proxyReq = httpRequest(
    {
      hostname: "localhost",
      port: TARGET_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        host: `localhost:${SSL_PORT}`,
      },
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    clientRes.writeHead(502);
    clientRes.end("Bad Gateway");
  });

  clientReq.pipe(proxyReq, { end: true });
});

proxy.listen(SSL_PORT, () => {
  console.log(
    `\nHTTPS proxy: https://localhost:${SSL_PORT} -> http://localhost:${TARGET_PORT}\n`
  );
});
