import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom";
import path from "path";
import express from "express";

const port = Number(process.env.PORT || 2567);
const transport = new WebSocketTransport({});

// Serve built client files in production
const app = transport.getExpressApp();
const publicPath = path.join(__dirname, "../public");
app.use(express.static(publicPath));
// SPA fallback — serve index.html for non-API routes
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.url.startsWith("/colyseus") || req.url.startsWith("/matchmake")) return next();
  if (req.method === "GET" && req.accepts("html")) {
    res.sendFile(path.join(publicPath, "index.html"));
  } else {
    next();
  }
});

const server = new Server({ transport });
server.define("game_room", GameRoom);

server.listen(port).then(() => {
  console.log(`MYTE server listening on port ${port}`);
});
