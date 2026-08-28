"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Protocol = require("./public/protocol.js");
const CONFIG = require("./public/config.js");

let WebSocketServer;
try {
  ({ WebSocketServer } = require("ws"));
} catch (error) {
  console.error('Dependência "ws" ausente. Execute "npm install" antes de iniciar.');
  process.exit(1);
}

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 5201;
const PUBLIC_DIR = path.resolve(__dirname, "public");
const ACTIVE_CLIENT_TYPES = ["hello", "ping"];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function resolvePublicFile(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, "http://localhost").pathname);
  } catch (error) {
    return null;
  }

  if (pathname === "/") pathname = "/index.html";
  const candidate = path.resolve(PUBLIC_DIR, `.${pathname}`);
  const publicPrefix = PUBLIC_DIR.endsWith(path.sep) ? PUBLIC_DIR : `${PUBLIC_DIR}${path.sep}`;

  if (candidate !== PUBLIC_DIR && !candidate.startsWith(publicPrefix)) {
    return null;
  }

  return candidate;
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  if (request.url === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      name: "arcane-pool",
      version: CONFIG.version,
      protocolVersion: Protocol.VERSION,
      phase: 6,
      multiplayerEnabled: false
    });
    return;
  }

  const filePath = resolvePublicFile(request.url);
  if (!filePath) {
    sendJson(response, 400, { ok: false, error: "invalid_path" });
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      sendJson(response, 404, { ok: false, error: "not_found" });
      return;
    }

    const headers = {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache"
    };

    response.writeHead(200, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  });
});

const wss = new WebSocketServer({
  server,
  maxPayload: Protocol.MAX_MESSAGE_BYTES
});

function send(socket, type, payload, options = {}) {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify(Protocol.createEnvelope(type, payload, options)));
}

function sendError(socket, parsed, requestId) {
  send(
    socket,
    "error",
    {
      code: parsed.code || "invalid_message",
      message: parsed.message || "Mensagem rejeitada"
    },
    { requestId: requestId || null }
  );
}

wss.on("connection", (socket) => {
  const connectionId = crypto.randomUUID();

  send(socket, "welcome", {
    connectionId,
    protocolVersion: Protocol.VERSION,
    capabilities: ["transport", "ping"],
    projectPhase: 6,
    multiplayerEnabled: false
  });

  socket.on("message", (raw) => {
    const parsed = Protocol.parse(raw, ACTIVE_CLIENT_TYPES);
    if (!parsed.ok) {
      sendError(socket, parsed, null);
      return;
    }

    const message = parsed.message;

    if (message.type === "hello") {
      send(
        socket,
        "welcome",
        {
          connectionId,
          protocolVersion: Protocol.VERSION,
          capabilities: ["transport", "ping"],
          projectPhase: 6,
          multiplayerEnabled: false
        },
        { requestId: message.requestId }
      );
      return;
    }

    if (message.type === "ping") {
      send(
        socket,
        "pong",
        {
          clientTime: message.payload.clientTime || null,
          serverTime: Date.now()
        },
        { requestId: message.requestId }
      );
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Arcane Pool disponível em http://localhost:${PORT}`);
  console.log(`Protocolo WebSocket v${Protocol.VERSION}; multiplayer completo reservado às Fases 7–8.`);
});
