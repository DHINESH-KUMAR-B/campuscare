const http = require("node:http");
const handleRequest = require("./lib/server-handler");

const PORT = Number(process.env.PORT || 3000);
const server = http.createServer(handleRequest);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`CampusCare is running at http://127.0.0.1:${PORT}`);
});
