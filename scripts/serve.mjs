import fs from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const DIST_DIR = path.resolve(process.cwd(), "dist");
const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const HOST = process.env.HOST ?? "127.0.0.1";

const CONTENT_TYPES = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

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
      const indexPath = path.join(requestedPath, "index.html");
      const indexStats = await stat(indexPath);
      return indexStats.isFile() ? { filePath: indexPath, fileStats: indexStats } : null;
    }
    return fileStats.isFile() ? { filePath: requestedPath, fileStats } : null;
  } catch {
    return null;
  }
}

function getContentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Length": Buffer.byteLength(message),
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(message);
}

const server = http.createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method Not Allowed");
    return;
  }

  const requestUrl = new URL(request.url, "http://localhost");
  const resolvedFile = await resolveFilePath(requestUrl.pathname);
  if (!resolvedFile) {
    sendText(response, 404, "Not Found");
    return;
  }

  response.writeHead(200, {
    "Content-Length": resolvedFile.fileStats.size,
    "Content-Type": getContentType(resolvedFile.filePath)
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = fs.createReadStream(resolvedFile.filePath);
  stream.on("error", () => {
    if (!response.headersSent) {
      sendText(response, 500, "Internal Server Error");
      return;
    }
    response.destroy();
  });
  stream.pipe(response);
});

server.on("error", (error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  const hostname = typeof address === "object" && address ? address.address : HOST;
  const port = typeof address === "object" && address ? address.port : PORT;
  process.stdout.write(`Serving dist/ at http://${hostname}:${port}\n`);
});
