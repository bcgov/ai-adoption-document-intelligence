import { getConfig } from "./config";
import { logger } from "./logger";
import { createServer } from "./server";

const config = getConfig();
const server = createServer(config);

server.listen(config.port, () => {
  logger.info("ches-adapter listening", { port: config.port });
});
