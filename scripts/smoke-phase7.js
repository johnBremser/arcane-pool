"use strict";

const assert = require("assert");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const Protocol = require("../public/protocol.js");

const ROOT = path.resolve(__dirname, "..");

class TestClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.messages = [];
    this.waiters = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.on("message", (raw) => this.receive(raw));
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    await this.waitFor("welcome");
  }

  receive(raw) {
    const parsed = Protocol.parse(raw, Protocol.SERVER_TYPES);
    if (!parsed.ok) return;
    const message = parsed.message;

    const index = this.waiters.findIndex((waiter) => (
      waiter.type === message.type && waiter.predicate(message)
    ));
    if (index >= 0) {
      const [waiter] = this.waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      this.messages.push(message);
    }
  }

  waitFor(type, predicate = () => true, timeoutMs = 8000) {
    const queuedIndex = this.messages.findIndex((message) => (
      message.type === type && predicate(message)
    ));
    if (queuedIndex >= 0) return Promise.resolve(this.messages.splice(queuedIndex, 1)[0]);

    return new Promise((resolve, reject) => {
      const waiter = { type, predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== waiter);
        reject(new Error(`Timeout aguardando ${type}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  send(type, payload = {}, roomCode = null) {
    this.socket.send(JSON.stringify(Protocol.createEnvelope(type, payload, { roomCode })));
  }

  close() {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Servidor não iniciou: ${stderr}`));
    }, 5000);

    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/localhost:(\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve({ child, port: Number(match[1]) });
    });
    child.once("exit", (code) => {
      if (code && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Servidor encerrou com código ${code}: ${stderr}`));
      }
    });
  });
}

async function run() {
  const { child, port } = await startServer();
  const url = `ws://127.0.0.1:${port}`;
  const host = new TestClient(url);
  let guest = new TestClient(url);

  try {
    await Promise.all([host.connect(), guest.connect()]);

    host.send("create_room", { name: "Anfitrião", mode: "classic" });
    const created = await host.waitFor("room_created");
    const roomCode = created.payload.code;
    assert.equal(roomCode.length, 6);

    guest.send("join_room", { code: roomCode, name: "Convidado" });
    const joined = await guest.waitFor("room_joined");
    assert.equal(joined.payload.seat, 2);
    assert(joined.payload.reconnectToken);
    await host.waitFor("lobby_state", (message) => message.payload.players.length === 2);

    guest.close();
    await host.waitFor("player_disconnected", (message) => message.payload.seat === 2);

    guest = new TestClient(url);
    await guest.connect();
    guest.send("resume_session", {
      roomCode,
      reconnectToken: joined.payload.reconnectToken
    });
    const resumed = await guest.waitFor("session_resumed");
    assert.equal(resumed.payload.seat, 2);

    host.send("set_ready", { ready: true }, roomCode);
    guest.send("set_ready", { ready: true }, roomCode);
    await host.waitFor("lobby_state", (message) => (
      message.payload.players.length === 2 && message.payload.players.every((player) => player.ready)
    ));

    host.send("start_match", {}, roomCode);
    const [hostStart, guestStart] = await Promise.all([
      host.waitFor("match_started"),
      guest.waitFor("match_started")
    ]);
    assert.equal(hostStart.payload.match.currentSeat, 1);
    assert.equal(guestStart.payload.physics.length, 16);
    assert.deepEqual(
      hostStart.payload.match.players.map((player) => player.name),
      ["Anfitrião", "Convidado"]
    );

    guest.send("shoot", {
      direction: { x: 1, y: 0 },
      power: 0.5,
      spin: { x: 0, y: 0 }
    }, roomCode);
    const rejected = await guest.waitFor("shot_rejected");
    assert.equal(rejected.payload.code, "not_your_turn");

    host.send("shoot", {
      direction: { x: 1, y: 0 },
      power: 1,
      spin: { x: 0, y: 0 },
      cueY: 180,
      score: 999999
    }, roomCode);
    const accepted = await host.waitFor("shot_accepted");
    assert.equal(accepted.payload.openingBreak, true);
    assert.equal(accepted.payload.cueY, 180);
    const resolved = await host.waitFor("shot_resolved", () => true, 12000);
    assert(resolved.payload.physics.length === 16);
    assert(resolved.payload.match.players.every((player) => player.score < 999999));

    console.log("Smoke Fase 7: sala, nomes, reconexão, prontidão e tacada autoritativa OK");
  } finally {
    host.close();
    guest.close();
    child.kill();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
