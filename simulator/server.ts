import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSimulator } from "./router.js";

const DEFAULT_PORT = 4174;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const port = Number(process.env.TAKO_BAKO_SIMULATOR_PORT ?? DEFAULT_PORT);
const simulator = createSimulator();

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-tako-bako-simulator", "true");
  response.end(JSON.stringify(body));
}

async function requestBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const method = request.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : await requestBody(request);
    if (method !== "GET" && method !== "HEAD" && body === undefined) {
      writeJson(response, 413, { error: { code: "payload_too_large", message: "Request body is too large" } });
      return;
    }
    const headers = new Headers();
    for (const [name, rawValue] of Object.entries(request.headers)) {
      if (rawValue !== undefined) headers.set(name, Array.isArray(rawValue) ? rawValue.join(", ") : rawValue);
    }
    const host = request.headers.host ?? "127.0.0.1";
    const url = new URL(request.url ?? "/", `http://${host}`).toString();
    const simulatorRequest = new Request(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
    const simulatorResponse = await simulator.handle(simulatorRequest);
    response.statusCode = simulatorResponse.status;
    simulatorResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await simulatorResponse.arrayBuffer()));
  } catch {
    writeJson(response, 500, { error: { code: "simulator_error", message: "The local simulator could not process this request" } });
  }
}

const server = createServer((request, response) => { void handle(request, response); });
server.on("error", error => {
  console.error("[tako-bako simulator] failed to start", error);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`[tako-bako simulator] local Yokaiba API ready at http://127.0.0.1:${port}`);
});

function stop(): void {
  server.close(() => process.exit(0));
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
