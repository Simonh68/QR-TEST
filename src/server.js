import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, join } from "node:path";
import QRCode from "qrcode";
import { CodeStore } from "./code-store.js";
import { TEST_DEFINITION, publicTestDefinition } from "./test-definition.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultPublicDirectory = join(moduleDirectory, "..", "public");
const defaultDataFile = join(moduleDirectory, "..", "data", "codes.json");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error("body-too-large");
  }
  if (!body) return {};
  return JSON.parse(body);
}

async function serveFile(response, publicDirectory, fileName) {
  try {
    const file = await readFile(join(publicDirectory, fileName));
    response.writeHead(200, {
      "content-type": contentTypes[extname(fileName)] ?? "application/octet-stream",
      "cache-control": fileName.endsWith(".html") ? "no-store" : "public, max-age=300"
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "not-found" });
  }
}

function statusCodeFor(reason) {
  if (reason === "not-found") return 404;
  if (["expired", "completed", "canceled", "completed-on-this-device"].includes(reason)) return 410;
  if (reason === "different-device") return 403;
  return 409;
}

function requestOrigin(request) {
  const forwardedProtocol = request.headers["x-forwarded-proto"];
  const protocol = forwardedProtocol === "https" ? "https" : "http";
  return `${protocol}://${request.headers.host}`;
}

export function createRequestHandler({ store, publicDirectory = defaultPublicDirectory } = {}) {
  if (!store) throw new Error("A code store is required");

  return async function handle(request, response) {
    try {
      const url = new URL(request.url, requestOrigin(request));

      if (request.method === "GET" && url.pathname === "/") {
        return serveFile(response, publicDirectory, "teacher.html");
      }

      if (request.method === "GET" && /^\/t\/[A-Za-z0-9_-]{20,}$/.test(url.pathname)) {
        return serveFile(response, publicDirectory, "student.html");
      }

      if (request.method === "GET" && url.pathname === "/api/test") {
        return sendJson(response, 200, { test: publicTestDefinition() });
      }

      if (request.method === "POST" && url.pathname === "/api/codes") {
        const { token, record } = store.create({
          testId: TEST_DEFINITION.id,
          testVersion: TEST_DEFINITION.version
        });
        const studentUrl = `${requestOrigin(request)}/t/${token}`;
        const qrDataUrl = await QRCode.toDataURL(studentUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 360,
          color: { dark: "#102a43", light: "#ffffff" }
        });
        return sendJson(response, 201, { token, studentUrl, qrDataUrl, record });
      }

      const codeMatch = url.pathname.match(/^\/api\/codes\/([A-Za-z0-9_-]{20,})(?:\/(start|complete))?$/);
      if (codeMatch) {
        const [, token, action] = codeMatch;

        if (request.method === "GET" && !action) {
          const record = store.preview(token);
          return record
            ? sendJson(response, 200, { record })
            : sendJson(response, 404, { error: "not-found" });
        }

        if (request.method === "POST" && action === "start") {
          const { deviceId } = await readJson(request);
          const result = store.claim(token, deviceId);
          return result.ok
            ? sendJson(response, 200, result)
            : sendJson(response, statusCodeFor(result.reason), { error: result.reason, record: result.record });
        }

        if (request.method === "POST" && action === "complete") {
          const { deviceId } = await readJson(request);
          const result = store.complete(token, deviceId);
          return result.ok
            ? sendJson(response, 200, result)
            : sendJson(response, statusCodeFor(result.reason), { error: result.reason, record: result.record });
        }
      }

      if (request.method === "GET" && ["/styles.css", "/teacher.js", "/student.js"].includes(url.pathname)) {
        return serveFile(response, publicDirectory, url.pathname.slice(1));
      }

      return sendJson(response, 404, { error: "not-found" });
    } catch (error) {
      const clientError = error instanceof SyntaxError || error.message === "body-too-large";
      return sendJson(response, clientError ? 400 : 500, {
        error: clientError ? "invalid-request" : "server-error"
      });
    }
  };
}

export function createQrTestServer(options = {}) {
  const store = options.store ?? new CodeStore({
    filePath: options.dataFile ?? process.env.CODE_STORE_FILE ?? defaultDataFile
  });
  return createServer(createRequestHandler({ store, publicDirectory: options.publicDirectory }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createQrTestServer();
  server.listen(port, host, () => {
    console.log(`QR TEST is running at http://${host}:${port}`);
  });
}
