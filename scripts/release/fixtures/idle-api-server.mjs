import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

// This independent process can close sockets while the release client blocks.
const server = createServer((_request, response) => {
  response.end("{}");
});
server.keepAliveTimeout = 60_000;
server.listen(0, "127.0.0.1", () => {
  process.send(server.address().port);
});
process.on("message", () => {
  server.closeIdleConnections();
  writeFileSync(process.argv[2], "");
});
