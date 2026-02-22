import path from "node:path";
import { stat } from "node:fs/promises";

const DIST_DIR = path.resolve(process.cwd(), "dist");
const PORT = Number.parseInt(Bun.env.PORT ?? "8080", 10);
const HOST = Bun.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

function resolveRequestPath(pathname) {
  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath =
    decodedPathname === "/" ? "index.html" : decodedPathname.replace(/^\/+/, "");
  const absolutePath = path.resolve(DIST_DIR, relativePath);

  if (absolutePath !== DIST_DIR && !absolutePath.startsWith(`${DIST_DIR}${path.sep}`)) {
    return null;
  }

  return absolutePath;
}

async function resolveFilePath(pathname) {
  const requestedPath = resolveRequestPath(pathname);
  if (!requestedPath) {
    return null;
  }

  try {
    const fileStats = await stat(requestedPath);
    if (fileStats.isDirectory()) {
      return path.join(requestedPath, "index.html");
    }
    return requestedPath;
  } catch {
    return null;
  }
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405
      });
    }

    const requestUrl = new URL(request.url);
    const filePath = await resolveFilePath(requestUrl.pathname);
    if (!filePath) {
      return new Response("Not Found", { status: 404 });
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(file);
  }
});

process.stdout.write(`Serving dist/ at http://${server.hostname}:${server.port}\n`);
