import { getConfig } from "./config";
import { createServer } from "./server";

const config = getConfig();
const server = createServer(config);

server.listen(config.port, () => {
  console.log(`ches-adapter listening on port ${config.port}`);
});
