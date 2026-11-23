import { createServer } from "node:http";
import { createSimulatorHttpHandler } from "./http-adapter.js";
import { createSimulator } from "./router.js";

const DEFAULT_PORT = 4174;
const port = Number(process.env.TAKO_BAKO_SIMULATOR_PORT ?? DEFAULT_PORT);
const server = createServer(createSimulatorHttpHandler(createSimulator()));
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
