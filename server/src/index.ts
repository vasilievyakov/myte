import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom";
import path from "path";
import fs from "fs";
import express from "express";

const port = Number(process.env.PORT || 2567);
const transport = new WebSocketTransport({});

// Serve built client files in production
const app = transport.getExpressApp();
const publicPath = path.join(__dirname, "../public");
const indexPath = path.join(publicPath, "index.html");

// Debug: log public path contents
console.log(`[STATIC] publicPath: ${publicPath}`);
console.log(`[STATIC] exists: ${fs.existsSync(publicPath)}`);
if (fs.existsSync(publicPath)) {
  console.log(`[STATIC] files: ${fs.readdirSync(publicPath).join(", ")}`);
}
console.log(`[STATIC] index.html exists: ${fs.existsSync(indexPath)}`);

app.use(express.static(publicPath));
// SPA fallback — serve index.html for non-API routes
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.url.startsWith("/colyseus") || req.url.startsWith("/matchmake")) return next();
  if (req.method === "GET" && req.accepts("html") && fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

const server = new Server({ transport });
server.define("game_room", GameRoom);

server.listen(port).then(() => {
  console.log(`MYTE server listening on port ${port}`);
});
