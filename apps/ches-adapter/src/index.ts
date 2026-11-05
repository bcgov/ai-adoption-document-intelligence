import { getConfig } from "./config";
import { logger } from "./logger";
import { createServer } from "./server";

process.on("uncaughtExceptionMonitor", (err: Error, origin: string) => {
  logger.error("Process crashing: uncaught exception", {
    event: "process_crash",
    origin,
    error: err.message,
    stack: err.stack,
  });
});

const config = getConfig();
const server = createServer(config);

server.listen(config.port, () => {
  logger.info("ches-adapter listening", { port: config.port });
});
