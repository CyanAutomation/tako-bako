import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_REQUEST_BODY_BYTES } from "./constants.js";
import type { Simulator } from "./router.js";

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-tako-bako-simulator", "true");
  response.end(JSON.stringify(body));
}

function isBodylessMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

async function requestBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  let oversized = false;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.byteLength;
    if (size > MAX_REQUEST_BODY_BYTES) {
      oversized = true;
      chunks.length = 0;
    } else if (!oversized) {
      chunks.push(value);
    }
  }
  return oversized ? undefined : Buffer.concat(chunks).toString("utf8");
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, rawValue] of Object.entries(request.headers)) {
    if (rawValue !== undefined) headers.set(name, Array.isArray(rawValue) ? rawValue.join(", ") : rawValue);
  }
  return headers;
}

async function toSimulatorRequest(request: IncomingMessage): Promise<Request | undefined> {
  const method = request.method ?? "GET";
  const bodyless = isBodylessMethod(method);
  const body = bodyless ? undefined : await requestBody(request);
  if (!bodyless && body === undefined) return undefined;

  const headers = requestHeaders(request);
  const host = headers.get("host") ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`).toString();
  return new Request(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

async function writeSimulatorResponse(response: ServerResponse, simulatorResponse: Response): Promise<void> {
  response.statusCode = simulatorResponse.status;
  simulatorResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(Buffer.from(await simulatorResponse.arrayBuffer()));
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  simulator: Simulator,
): Promise<void> {
  try {
    const simulatorRequest = await toSimulatorRequest(request);
    if (!simulatorRequest) {
      writeJson(response, 413, { error: { code: "payload_too_large", message: "Request body is too large" } });
      return;
    }
    await writeSimulatorResponse(response, await simulator.handle(simulatorRequest));
  } catch {
    writeJson(response, 500, { error: { code: "simulator_error", message: "The local simulator could not process this request" } });
  }
}

export function createSimulatorHttpHandler(simulator: Simulator) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    void handle(request, response, simulator);
  };
}
