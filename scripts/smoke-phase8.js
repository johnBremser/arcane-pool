"use strict";

const assert = require("assert");
const WebSocket = require("ws");
const Protocol = require("../public/protocol.js");
const Specials = require("../public/specials.js");

process.env.HOST = "127.0.0.1";
process.env.PORT = "0";

const { server, wss, rooms } = require("../server.js");

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

  waitFor(type, predicate = () => true, timeoutMs = 5000) {
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
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(Protocol.createEnvelope(type, payload, { roomCode })));
    return true;
  }

  close() {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

async function waitForListening() {
  if (server.listening) return;
  await new Promise((resolve) => server.once("listening", resolve));
}

async function run() {
  await waitForListening();
  const address = server.address();
  const url = `ws://127.0.0.1:${address.port}`;
  const host = new TestClient(url);
  const guest = new TestClient(url);
  let roomCode = null;

  try {
    await Promise.all([host.connect(), guest.connect()]);
    host.send("create_room", { name: "Mago Azul", mode: "arcane" });
    const created = await host.waitFor("room_created");
    roomCode = created.payload.code;

    guest.send("join_room", { code: roomCode, name: "Maga Roxa" });
    await guest.waitFor("room_joined");
    await host.waitFor("lobby_state", (message) => message.payload.players.length === 2);
    host.send("set_ready", { ready: true }, roomCode);
    guest.send("set_ready", { ready: true }, roomCode);
    await host.waitFor("lobby_state", (message) => message.payload.players.every((player) => player.ready));

    host.send("start_match", {}, roomCode);
    const [hostStart, guestStart] = await Promise.all([
      host.waitFor("match_started"),
      guest.waitFor("match_started")
    ]);
    assert.equal(hostStart.payload.match.mode, "arcane");
    assert.equal(hostStart.payload.privatePlayer.seat, 1);
    assert.equal(guestStart.payload.privatePlayer.seat, 2);
    assert.equal(hostStart.payload.privatePlayer.arcanaPoints, 2);
    assert.equal(hostStart.payload.privatePlayer.shopOffers.length, 3);
    assert(hostStart.payload.match.magicBall);
    assert(hostStart.payload.physics.some((ball) => ball.kind === "magic"));
    const magicSpawned = await host.waitFor("arcane_ball_spawned");
    assert.equal(magicSpawned.payload.id, hostStart.payload.match.magicBall.id);

    guest.send("pause_match", {}, roomCode);
    const pauseForbidden = await guest.waitFor("error", (message) => message.payload.code === "not_your_turn");
    assert.equal(pauseForbidden.payload.code, "not_your_turn");

    host.send("pause_match", {}, roomCode);
    const [hostPaused, guestPaused] = await Promise.all([
      host.waitFor("match_paused"),
      guest.waitFor("match_paused")
    ]);
    assert.equal(hostPaused.payload.seat, 1);
    assert(hostPaused.payload.remainingMs <= 20000 && hostPaused.payload.remainingMs > 19000);
    assert.equal(guestPaused.payload.playerName, "Mago Azul");

    guest.send("resume_match", {}, roomCode);
    const [hostResumed, guestResumed] = await Promise.all([
      host.waitFor("match_resumed"),
      guest.waitFor("match_resumed")
    ]);
    assert.equal(hostResumed.payload.pausedBySeat, 1);
    assert.equal(guestResumed.payload.reason, "manual");

    guest.send("open_shop", {}, roomCode);
    const forbidden = await guest.waitFor("error");
    assert.equal(forbidden.payload.code, "not_your_turn");

    const room = rooms.get(roomCode);
    room.match.players[0].arcanaPoints = 10;
    host.send("open_shop", {}, roomCode);
    const [, guestNotice, shopState] = await Promise.all([
      host.waitFor("shop_opened"),
      guest.waitFor("shop_opened"),
      host.waitFor("shop_state")
    ]);
    assert.equal(guestNotice.payload.seat, 1);
    assert(Number.isFinite(guestNotice.payload.remainingMs));
    assert.equal(Object.hasOwn(guestNotice.payload, "privatePlayer"), false);
    assert.equal(shopState.payload.privatePlayer.shopOffers.length, 3);

    host.send("reroll_shop", {}, roomCode);
    const rerolled = await host.waitFor("shop_rerolled");
    assert.equal(rerolled.payload.cost, 1);
    assert.equal(rerolled.payload.privatePlayer.arcanaPoints, 9);

    const offer = rerolled.payload.privatePlayer.shopOffers[0];
    host.send("buy_special", { offerId: offer.offerId, cost: 0 }, roomCode);
    const bought = await host.waitFor("special_bought");
    assert.equal(bought.payload.privatePlayer.inventory.filter(Boolean).length, 1);
    assert.equal(bought.payload.privatePlayer.arcanaPoints, 9 - offer.cost);

    host.send("discard_special", { instanceId: bought.payload.instance.uid }, roomCode);
    const discarded = await host.waitFor("special_discarded");
    assert.equal(discarded.payload.privatePlayer.inventory.filter(Boolean).length, 0);
    host.send("close_shop", {}, roomCode);
    await host.waitFor("shop_closed", (message) => message.payload.seat === 1);

    const softTouch = Specials.createSpecialInstance({ defId: "soft_touch" }, () => 0.123);
    room.match.players[0].inventory[0] = softTouch;
    host.send("use_special", { instanceId: softTouch.uid }, roomCode);
    const [softUsed, softPublic] = await Promise.all([
      host.waitFor("special_used", (message) => message.payload.effect.defId === "soft_touch"),
      guest.waitFor("special_effect_started", (message) => message.payload.effect.defId === "soft_touch")
    ]);
    assert.equal(softUsed.payload.privatePlayer.inventory[0].usesLeft, softTouch.maxUses - 1);
    assert.equal(softPublic.payload.appliedToSeat, 1);
    assert.equal(softPublic.payload.effect.sourceSeat, 1);

    host.send("use_special", { instanceId: softTouch.uid }, roomCode);
    const duplicateUse = await host.waitFor("error", (message) => message.payload.code === "already_active");
    assert.equal(duplicateUse.payload.code, "already_active");

    const ghostHand = Specials.createSpecialInstance({ defId: "ghost_hand" }, () => 0.456);
    room.match.players[0].inventory[1] = ghostHand;
    const freePoint = room.world.findMagicBallSpawnPosition();
    assert(freePoint);
    host.send("select_special_target", {
      instanceId: ghostHand.uid,
      target: { x: freePoint.x, y: freePoint.y }
    }, roomCode);
    const moved = await host.waitFor(
      "special_used",
      (message) => message.payload.effect.defId === "ghost_hand"
    );
    assert.equal(moved.payload.immediate, true);
    assert(Math.hypot(room.world.getCueBall().x - freePoint.x, room.world.getCueBall().y - freePoint.y) < 0.01);

    host.send("shoot", {
      direction: { x: 1, y: 0 },
      power: 0.25,
      spin: { x: 0, y: 0 }
    }, roomCode);
    const accepted = await host.waitFor("shot_accepted");
    assert(accepted.payload.effectIds.includes("soft_touch"));
    assert.equal(room.world.getShotModifiers().softTouch, true);

    console.log("Smoke Fase 8: economia, magia, alvos e Bola Mágica autoritativos OK");
  } finally {
    if (roomCode) {
      host.send("leave_room", {}, roomCode);
      guest.send("leave_room", {}, roomCode);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    host.close();
    guest.close();
    wss.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
  wss.close();
  server.close();
});
