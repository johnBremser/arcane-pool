"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");
const Protocol = require("./public/protocol.js");
const CONFIG = require("./public/config.js");
const PhysicsCore = require("./public/physics.js");
const Rules = require("./public/rules.js");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT === undefined ? 5201 : Number(process.env.PORT);
const PUBLIC_DIR = path.resolve(__dirname, "public");
const RECONNECT_WINDOW_MS = CONFIG.network.reconnectWindowMs;
const MATCH_PAUSE_MS = 20000;
const ACTIVE_CLIENT_TYPES = [
  "hello",
  "ping",
  "resume_session",
  "create_room",
  "join_room",
  "leave_room",
  "set_ready",
  "start_match",
  "request_rematch",
  "pause_match",
  "resume_match",
  "shoot",
  "cancel_aim",
  "request_snapshot",
  "open_shop",
  "close_shop",
  "reroll_shop",
  "buy_special",
  "discard_special",
  "use_special",
  "select_special_target",
  "set_frozen_direction",
  "release_time_freeze"
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

const rooms = new Map();
const sessions = new WeakMap();

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
      phase: 10,
      multiplayerEnabled: true,
      arcaneEconomyEnabled: true,
      arcaneMultiplayerEnabled: true,
      activeRooms: rooms.size
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

const wss = new WebSocketServer({ server, maxPayload: Protocol.MAX_MESSAGE_BYTES });

function createSession(socket) {
  return {
    socket,
    connectionId: crypto.randomUUID(),
    roomCode: null,
    seat: null,
    requestCache: new Map()
  };
}

function serializeEnvelope(type, payload, options = {}) {
  return JSON.stringify(Protocol.createEnvelope(type, payload, options));
}

function sendSerialized(socket, serialized) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(serialized);
}

function send(session, type, payload, options = {}) {
  const serialized = serializeEnvelope(type, payload, options);
  sendSerialized(session.socket, serialized);
  return serialized;
}

function rememberResponse(session, requestId, serialized) {
  if (!requestId) return;
  session.requestCache.set(requestId, serialized);
  if (session.requestCache.size > 100) {
    session.requestCache.delete(session.requestCache.keys().next().value);
  }
}

function reply(session, message, type, payload, roomCode = null) {
  const serialized = send(session, type, payload, {
    requestId: message.requestId || null,
    roomCode
  });
  rememberResponse(session, message.requestId, serialized);
}

function sendError(session, message, code, text) {
  reply(session, message, "error", { code, message: text }, session.roomCode);
}

function broadcast(room, type, payload, message = null, initiatingSession = null) {
  room.seq += 1;
  const serialized = serializeEnvelope(type, payload, {
    requestId: message && message.requestId ? message.requestId : null,
    roomCode: room.code,
    seq: room.seq
  });

  for (const player of room.players) {
    if (player.connected) sendSerialized(player.socket, serialized);
  }

  if (initiatingSession && message) {
    rememberResponse(initiatingSession, message.requestId, serialized);
  }
}

function normalizeName(value, fallback) {
  const clean = String(value || "").replace(/\s+/g, " ").trim().slice(0, 24);
  return clean || fallback;
}

function normalizeRoomCode(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = "";
    const bytes = crypto.randomBytes(6);
    for (const byte of bytes) code += alphabet[byte % alphabet.length];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Não foi possível gerar código de sala");
}

function createPlayer(session, seat, name) {
  return {
    id: crypto.randomUUID(),
    seat,
    name: normalizeName(name, `Jogador ${seat}`),
    ready: false,
    connected: true,
    disconnectedAt: null,
    reconnectToken: crypto.randomBytes(24).toString("hex"),
    socket: session.socket,
    disconnectTimer: null
  };
}

function bindSessionToPlayer(session, room, player) {
  session.roomCode = room.code;
  session.seat = player.seat;
  player.socket = session.socket;
  player.connected = true;
  player.disconnectedAt = null;
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
}

function getRoomForSession(session) {
  return session.roomCode ? rooms.get(session.roomCode) || null : null;
}

function getPlayerForSession(session, room = getRoomForSession(session)) {
  return room ? room.players.find((player) => player.seat === session.seat) || null : null;
}

function publicLobby(room) {
  return {
    code: room.code,
    mode: room.mode,
    status: room.status,
    hostSeat: room.hostSeat,
    players: room.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      ready: player.ready,
      connected: player.connected,
      host: player.seat === room.hostSeat
    }))
  };
}

function publicRematch(room) {
  return {
    requestedBySeat: room.rematchRequestedBy || null,
    acceptedSeats: Array.from(room.rematchVotes || []).sort(),
    requiredAcceptances: 2
  };
}

function matchPayload(room, privateSeat = null) {
  const now = Date.now();
  const payload = {
    status: room.status,
    match: Rules.publicSnapshot(room.match),
    physics: room.world.getSnapshot(),
    moving: room.simulating,
    rematch: room.status === "finished" ? publicRematch(room) : null,
    pause: room.pause
      ? {
          seat: room.pause.seat,
          playerName: room.pause.playerName,
          remainingMs: Math.max(0, room.pause.deadlineAt - now)
        }
      : null
  };
  if (privateSeat) payload.privatePlayer = Rules.privatePlayerSnapshot(room.match, privateSeat);
  return payload;
}

function sendPrivateStates(room) {
  for (const roomPlayer of room.players) {
    if (!roomPlayer.connected || !roomPlayer.socket) continue;
    const playerSession = sessions.get(roomPlayer.socket);
    if (!playerSession) continue;
    send(playerSession, "inventory_state", {
      privatePlayer: Rules.privatePlayerSnapshot(room.match, roomPlayer.seat)
    }, { roomCode: room.code });
  }
}

function serializePhysicsDetail(detail = {}) {
  const compactEntity = (entity) => entity ? {
    id: entity.id,
    kind: entity.kind,
    number: entity.number,
    x: entity.x,
    y: entity.y,
    color: entity.color,
    magicBallId: entity.magicBallId || null
  } : null;
  return {
    ball: compactEntity(detail.ball),
    other: compactEntity(detail.other),
    cue: compactEntity(detail.cue),
    pocket: detail.pocket ? { id: detail.pocket.id, x: detail.pocket.x, y: detail.pocket.y } : null,
    exit: detail.exit ? { id: detail.exit.id, x: detail.exit.x, y: detail.exit.y } : null,
    wall: detail.wall || null,
    radius: Number(detail.radius) || null,
    remaining: Number(detail.remaining) || null
  };
}

function attachWorldCallbacks(room) {
  room.world.setCallbacks({
    onSpecialPhysicsEvent(type, detail) {
      broadcast(room, "special_physics_event", {
        eventType: type,
        shooterSeat: room.match.currentSeat,
        detail: serializePhysicsDetail(detail)
      });
    }
  });
}

function applyArcaneEventsToWorld(room, events) {
  for (const event of events) {
    if (event.type === "arcane_ball_spawned") {
      if (!room.world.getMagicBall()) room.world.addMagicBall(event.payload);
    } else if (event.type === "arcane_ball_potted" || event.type === "arcane_ball_expired") {
      room.world.removeMagicBall(event.payload.id);
    }
  }
}

function broadcastArcaneEvents(room, events) {
  for (const event of events) broadcast(room, event.type, event.payload);
}

function drainArcaneEvents(room) {
  const events = Rules.drainArcaneEvents(room.match);
  applyArcaneEventsToWorld(room, events);
  return events;
}

function maybeSpawnMagicBall(room) {
  if (room.mode !== "arcane" || !Rules.isMagicBallSpawnDue(room.match)) return [];
  const position = room.world.findMagicBallSpawnPosition();
  if (!position) return [];
  const result = Rules.spawnMagicBall(room.match, position);
  if (!result.ok) return [];
  return drainArcaneEvents(room);
}

function handleCreateRoom(session, message) {
  if (session.roomCode) {
    sendError(session, message, "already_in_room", "Você já está em uma sala");
    return;
  }

  const mode = message.payload.mode === "arcane" ? "arcane" : "classic";
  if (message.payload.mode && !["classic", "arcane"].includes(message.payload.mode)) {
    sendError(session, message, "mode_unavailable", "Modo multiplayer indisponível");
    return;
  }

  const code = createRoomCode();
  const player = createPlayer(session, 1, message.payload.name);
  const room = {
    code,
    mode,
    hostSeat: 1,
    status: "lobby",
    players: [player],
    match: null,
    world: null,
    simulating: false,
    snapshotTick: 0,
    currentShotEffects: {},
    currentShotStart: null,
    lastResolvedShot: null,
    pause: null,
    nextStartingSeat: 1,
    rematchRequestedBy: null,
    rematchVotes: new Set(),
    seq: 0
  };

  rooms.set(code, room);
  bindSessionToPlayer(session, room, player);
  reply(session, message, "room_created", {
    code,
    seat: player.seat,
    reconnectToken: player.reconnectToken
  }, code);
  broadcast(room, "lobby_state", publicLobby(room));
}

function handleJoinRoom(session, message) {
  if (session.roomCode) {
    sendError(session, message, "already_in_room", "Você já está em uma sala");
    return;
  }

  const code = normalizeRoomCode(message.payload.code);
  const room = rooms.get(code);
  if (!room) {
    sendError(session, message, "room_not_found", "Sala não encontrada");
    return;
  }
  if (room.status !== "lobby") {
    sendError(session, message, "match_in_progress", "A partida desta sala já começou");
    return;
  }
  if (room.players.length >= 2) {
    sendError(session, message, "room_full", "A sala já possui dois jogadores");
    return;
  }

  const player = createPlayer(session, 2, message.payload.name);
  room.players.push(player);
  bindSessionToPlayer(session, room, player);
  reply(session, message, "room_joined", {
    code,
    seat: player.seat,
    reconnectToken: player.reconnectToken,
    lobby: publicLobby(room)
  }, code);
  broadcast(room, "lobby_state", publicLobby(room));
}

function handleResumeSession(session, message) {
  if (session.roomCode) {
    sendError(session, message, "already_in_room", "A sessão já está vinculada a uma sala");
    return;
  }

  const code = normalizeRoomCode(message.payload.roomCode || message.roomCode);
  const token = String(message.payload.reconnectToken || "");
  const room = rooms.get(code);
  const player = room && room.players.find((item) => item.reconnectToken === token);

  if (!room || !player || player.connected) {
    sendError(session, message, "resume_unavailable", "Não foi possível retomar esta sessão");
    return;
  }
  if (player.disconnectedAt && Date.now() - player.disconnectedAt > RECONNECT_WINDOW_MS) {
    sendError(session, message, "resume_expired", "O prazo de reconexão terminou");
    return;
  }

  bindSessionToPlayer(session, room, player);
  reply(session, message, "session_resumed", {
    code,
    seat: player.seat,
    reconnectToken: player.reconnectToken,
    lobby: publicLobby(room),
    ...(room.match ? matchPayload(room, player.seat) : {})
  }, code);
  broadcast(room, "player_reconnected", { seat: player.seat });
  broadcast(room, "lobby_state", publicLobby(room));
}

function requireRoomPlayer(session, message) {
  const room = getRoomForSession(session);
  const player = getPlayerForSession(session, room);
  if (!room || !player) {
    sendError(session, message, "not_in_room", "Entre em uma sala primeiro");
    return null;
  }
  return { room, player };
}

function handleSetReady(session, message) {
  const context = requireRoomPlayer(session, message);
  if (!context) return;
  const { room, player } = context;
  if (room.status !== "lobby") {
    sendError(session, message, "wrong_phase", "A prontidão só pode ser alterada no lobby");
    return;
  }

  player.ready = Boolean(message.payload.ready);
  broadcast(room, "lobby_state", publicLobby(room), message, session);
}

function startRoomMatch(room, message = null, initiatingSession = null) {
  const startingSeat = room.nextStartingSeat || 1;
  room.match = Rules.createMatch(room.mode, Date.now());
  for (const roomPlayer of room.players) {
    room.match.players[roomPlayer.seat - 1].name = roomPlayer.name;
  }
  if (startingSeat !== 1) {
    room.match.turn = null;
    Rules.startTurn(room.match, startingSeat, Date.now());
  }
  room.world = PhysicsCore.createWorld(CONFIG);
  room.world.init();
  attachWorldCallbacks(room);
  room.status = "playing";
  room.simulating = false;
  room.snapshotTick = 0;
  room.currentShotEffects = {};
  room.currentShotStart = null;
  room.lastResolvedShot = null;
  room.pause = null;
  room.nextStartingSeat = startingSeat === 1 ? 2 : 1;
  room.rematchRequestedBy = null;
  room.rematchVotes.clear();
  const initialArcaneEvents = maybeSpawnMagicBall(room);
  room.seq += 1;
  for (const roomPlayer of room.players) {
    if (!roomPlayer.connected) continue;
    const serialized = serializeEnvelope("match_started", matchPayload(room, roomPlayer.seat), {
      requestId: message && message.requestId ? message.requestId : null,
      roomCode: room.code,
      seq: room.seq
    });
    sendSerialized(roomPlayer.socket, serialized);
    if (initiatingSession && roomPlayer.seat === initiatingSession.seat && message) {
      rememberResponse(initiatingSession, message.requestId, serialized);
    }
  }
  broadcast(room, "turn_started", {
    seat: room.match.currentSeat,
    match: Rules.publicSnapshot(room.match)
  });
  broadcastArcaneEvents(room, initialArcaneEvents);
}

function handleStartMatch(session, message) {
  const context = requireRoomPlayer(session, message);
  if (!context) return;
  const { room, player } = context;
  if (room.status !== "lobby") {
    sendError(session, message, "wrong_phase", "A partida já foi iniciada");
    return;
  }
  if (player.seat !== room.hostSeat) {
    sendError(session, message, "host_only", "Somente o anfitrião pode iniciar");
    return;
  }
  if (room.players.length !== 2 || room.players.some((item) => !item.ready || !item.connected)) {
    sendError(session, message, "players_not_ready", "São necessários dois jogadores prontos");
    return;
  }

  startRoomMatch(room, message, session);
}

function handleRequestRematch(session, message) {
  const context = requireRoomPlayer(session, message);
  if (!context) return;
  const { room, player } = context;

  if (room.status !== "finished" || !room.match) {
    sendError(session, message, "wrong_phase", "A revanche só pode ser pedida após o fim da partida");
    return;
  }
  if (room.players.length !== 2 || room.players.some((item) => !item.connected)) {
    sendError(session, message, "opponent_unavailable", "O adversário não está disponível para a revanche");
    return;
  }
  if (!room.rematchRequestedBy && player.seat === room.match.winnerSeat) {
    sendError(session, message, "loser_starts_rematch", "Aguarde o adversário pedir a revanche");
    return;
  }

  if (!room.rematchRequestedBy) room.rematchRequestedBy = player.seat;
  room.rematchVotes.add(player.seat);
  broadcast(room, "rematch_state", publicRematch(room), message, session);

  if (room.rematchVotes.size === 2) startRoomMatch(room);
}

function normalizeShot(payload) {
  const direction = payload.direction || {};
  const x = Number(direction.x);
  const y = Number(direction.y);
  const length = Math.hypot(x, y);
  const power = Number(payload.power);
  const cueY = payload.cueY === undefined || payload.cueY === null
    ? null
    : Number(payload.cueY);
  const rawSpin = payload.spin || {};
  const spin = {
    x: Math.max(-1, Math.min(1, Number(rawSpin.x) || 0)),
    y: Math.max(-1, Math.min(1, Number(rawSpin.y) || 0))
  };

  if (!Number.isFinite(x) || !Number.isFinite(y) || length < 0.99 || length > 1.01) {
    return { ok: false, code: "invalid_direction", message: "Direção inválida" };
  }
  if (!Number.isFinite(power) || power < CONFIG.input.minPower || power > 1) {
    return { ok: false, code: "invalid_power", message: "Força inválida" };
  }
  if (cueY !== null && !Number.isFinite(cueY)) {
    return { ok: false, code: "invalid_cue_position", message: "Posição da bola branca inválida" };
  }

  return {
    ok: true,
    angle: Math.atan2(y / length, x / length),
    direction: { x: x / length, y: y / length },
    power,
    cueY,
    spin
  };
}

function calculateIdealPower(world, angle) {
  const impact = world.raycastAim(angle, 1600);
  const settings = CONFIG.arcane.specialEffects.perfectForce;
  if (!impact || !impact.ball) return 0.56;
  let pocketDistance = Infinity;
  for (const pocket of world.getPockets()) {
    pocketDistance = Math.min(
      pocketDistance,
      Math.hypot(impact.ball.x - pocket.x, impact.ball.y - pocket.y)
    );
  }
  const travel = impact.t + pocketDistance;
  return Math.max(
    settings.minPower,
    Math.min(settings.maxPower, 0.26 + travel / 1900 * 0.58)
  );
}

function physicsModifiersFromEffects(effects) {
  return {
    softTouch: Boolean(effects.soft_touch),
    ghostBallArmed: Boolean(effects.ghost_ball),
    lightMagnetPocketId: effects.light_magnet ? effects.light_magnet.target.pocketId : null,
    magneticBallId: effects.magnetic_ball ? effects.magnetic_ball.target.ballId : null,
    shieldPocketId: effects.shield_pocket ? effects.shield_pocket.target.pocketId : null,
    zones: effects.table_zones || [],
    timeFreezeArmed: Boolean(effects.time_freeze),
    portalPocketIds: effects.portal_pocket ? effects.portal_pocket.target.pocketIds : null,
    explosiveBallId: effects.explosive_ball ? effects.explosive_ball.target.ballId : null
  };
}

function restoreMatchState(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, JSON.parse(JSON.stringify(snapshot)));
}

function handleShoot(session, message) {
  const context = requireRoomPlayer(session, message);
  if (!context) return;
  const { room, player } = context;
  if (room.status !== "playing" || !room.match || !room.world) {
    sendError(session, message, "wrong_phase", "A partida não está em andamento");
    return;
  }
  if (room.simulating || room.world.ballsMoving()) {
    sendError(session, message, "shot_in_progress", "A tacada anterior ainda está em movimento");
    return;
  }
  if (room.pause) {
    reply(session, message, "shot_rejected", {
      code: "match_paused",
      message: "A partida está pausada"
    }, room.code);
    return;
  }
  if (room.match.currentSeat !== player.seat) {
    reply(session, message, "shot_rejected", {
      code: "not_your_turn",
      message: "Aguarde sua vez"
    }, room.code);
    return;
  }
  if (Rules.getPlayer(room.match, player.seat).shop.open) {
    reply(session, message, "shot_rejected", {
      code: "shop_open",
      message: "Feche a Loja Arcana antes da tacada"
    }, room.code);
    return;
  }

  const shot = normalizeShot(message.payload);
  if (!shot.ok) {
    reply(session, message, "shot_rejected", {
      code: shot.code,
      message: shot.message
    }, room.code);
    return;
  }

  const openingBreak = Rules.isOpeningBreak(room.match);

  if (shot.cueY !== null) {
    if (!openingBreak) {
      reply(session, message, "shot_rejected", {
        code: "cue_placement_unavailable",
        message: "A bola branca só pode ser posicionada antes da saída"
      }, room.code);
      return;
    }
    const padding = CONFIG.input.openingBreak.cueVerticalPadding;
    const boundedY = Math.max(padding, Math.min(CONFIG.table.height - padding, shot.cueY));
    const cue = room.world.getCueBall();
    if (!cue || !room.world.moveCueTo(cue.x, boundedY)) {
      reply(session, message, "shot_rejected", {
        code: "invalid_cue_position",
        message: "Não foi possível posicionar a bola branca"
      }, room.code);
      return;
    }
  }

  const preShotMatch = JSON.parse(JSON.stringify(room.match));
  room.currentShotStart = {
    match: preShotMatch,
    physics: room.world.getSnapshot(),
    shooterSeat: player.seat
  };
  const prepared = Rules.prepareShot(room.match, shot.power, shot.spin, {
    idealPower: calculateIdealPower(room.world, shot.angle)
  });
  room.currentShotEffects = prepared.effects;
  room.world.setShotModifiers(physicsModifiersFromEffects(prepared.effects));

  if (!room.world.shoot(shot.angle, prepared.power, prepared.spin, { openingBreak })) {
    restoreMatchState(room.match, preShotMatch);
    room.world.setShotModifiers();
    room.currentShotEffects = {};
    room.currentShotStart = null;
    reply(session, message, "shot_rejected", {
      code: "physics_rejected",
      message: "A física recusou a tacada"
    }, room.code);
    return;
  }

  if (openingBreak) Rules.consumeOpeningBreak(room.match);
  Rules.pauseTurnTimer(room.match, Date.now());
  room.simulating = true;
  room.snapshotTick = 0;
  broadcast(room, "shot_accepted", {
    shotId: Protocol.makeId("shot"),
    shooterSeat: player.seat,
    direction: shot.direction,
    power: prepared.power,
    openingBreak,
    cueY: openingBreak ? room.world.getCueBall().y : null,
    spin: prepared.spin,
    effects: prepared.effects,
    effectIds: Object.keys(prepared.effects).filter((id) => id !== "table_zones"),
    notices: prepared.notices
  }, message, session);
  sendPrivateStates(room);
}

function handleRequestSnapshot(session, message) {
  const context = requireRoomPlayer(session, message);
  if (!context) return;
  const { room, player } = context;
  if (!room.match || !room.world) {
    reply(session, message, "lobby_state", publicLobby(room), room.code);
    return;
  }
  reply(session, message, "physics_snapshot", matchPayload(room, player.seat), room.code);
}

const ECONOMY_ERROR_MESSAGES = {
  wrong_mode: "A economia Arcana não está ativa nesta sala",
  wrong_phase: "A partida não está disponível para esta ação",
  not_your_turn: "Aguarde sua vez",
  shot_in_progress: "Aguarde o fim da tacada",
  shop_closed: "Abra a loja antes de continuar",
  insufficient_points: "Pontos Arcana insuficientes",
  inventory_full: "O inventário está cheio",
  legendary_limit: "O limite de especiais lendários foi atingido",
  offer_unavailable: "A oferta não está mais disponível",
  unknown_special: "Especial inválido",
  invalid_slot: "Item de inventário inválido",
  empty_slot: "Este espaço do inventário está vazio",
  shop_open: "Feche a Loja Arcana antes de usar o especial",
  cooldown: "Este especial ainda está em cooldown",
  already_active: "Este especial já está armado",
  target_required: "Selecione um alvo válido",
  invalid_target: "O alvo selecionado não é válido",
  phase_unavailable: "Este especial não está disponível"
};

function requireArcaneEconomyTurn(session, message) {
  const context = requireRoomPlayer(session, message);
  if (!context) return null;
  const { room, player } = context;
  if (!room.match || room.status !== "playing") {
    sendError(session, message, "wrong_phase", ECONOMY_ERROR_MESSAGES.wrong_phase);
    return null;
  }
  if (room.mode !== "arcane" || room.match.mode !== "arcane") {
    sendError(session, message, "wrong_mode", ECONOMY_ERROR_MESSAGES.wrong_mode);
    return null;
  }
  if (room.match.currentSeat !== player.seat) {
    sendError(session, message, "not_your_turn", ECONOMY_ERROR_MESSAGES.not_your_turn);
    return null;
  }
  if (room.pause) {
    sendError(session, message, "match_paused", "A partida está pausada");
    return null;
  }
  if (room.simulating || room.world.ballsMoving()) {
    sendError(session, message, "shot_in_progress", ECONOMY_ERROR_MESSAGES.shot_in_progress);
    return null;
  }
  return context;
}

function resumeRoomPause(room, reason = "manual", message = null, initiatingSession = null) {
  if (!room.pause || !room.match) return false;
  const paused = room.pause;
  room.pause = null;
  Rules.resumeTurnTimer(room.match, Date.now());
  broadcast(room, "match_resumed", {
    reason,
    pausedBySeat: paused.seat,
    pausedByName: paused.playerName,
    match: Rules.publicSnapshot(room.match)
  }, message, initiatingSession);
  return true;
}

function handlePauseMatch(session, message) {
  const context = requireRoomPlayer(session, message);
  if (!context) return;
  const { room, player } = context;
  if (room.status !== "playing" || !room.match || !room.world) {
    sendError(session, message, "wrong_phase", "A partida não está em andamento");
    return;
  }
  if (room.pause) {
    sendError(session, message, "already_paused", "A partida já está pausada");
    return;
  }
  if (room.match.currentSeat !== player.seat) {
    sendError(session, message, "not_your_turn", "Somente quem está na vez pode pausar");
    return;
  }
  if (room.simulating || room.world.ballsMoving()) {
    sendError(session, message, "shot_in_progress", "Pause somente entre tacadas");
    return;
  }
  if (Rules.getPlayer(room.match, player.seat).shop.open) {
    sendError(session, message, "shop_open", "Feche a Loja Arcana antes de pausar");
    return;
  }

  Rules.pauseTurnTimer(room.match, Date.now());
  room.pause = {
    seat: player.seat,
    playerName: player.name,
    deadlineAt: Date.now() + MATCH_PAUSE_MS
  };
  broadcast(room, "match_paused", {
    seat: player.seat,
    playerName: player.name,
    durationMs: MATCH_PAUSE_MS,
    remainingMs: MATCH_PAUSE_MS,
    match: Rules.publicSnapshot(room.match)
  }, message, session);
}

function handleResumeMatch(session, message) {
  const context = requireRoomPlayer(session, message);
  if (!context) return;
  if (!context.room.pause) {
    sendError(session, message, "not_paused", "A partida não está pausada");
    return;
  }
  resumeRoomPause(context.room, "manual", message, session);
}

function sendEconomyState(session, room, type, message, extra = {}) {
  reply(session, message, type, {
    ...extra,
    privatePlayer: Rules.privatePlayerSnapshot(room.match, session.seat)
  }, room.code);
}

function broadcastPublicPlayers(room) {
  broadcast(room, "points_updated", {
    players: Rules.publicSnapshot(room.match).players
  });
}

function handleOpenShop(session, message) {
  const context = requireArcaneEconomyTurn(session, message);
  if (!context) return;
  const result = Rules.openShop(context.room.match, Date.now());
  if (!result.ok) {
    sendError(session, message, result.code, ECONOMY_ERROR_MESSAGES[result.code] || "Não foi possível abrir a loja");
    return;
  }
  broadcast(context.room, "shop_opened", {
    seat: context.player.seat,
    remainingMs: Rules.getTurnRemainingMs(context.room.match)
  });
  sendEconomyState(session, context.room, "shop_state", message);
}

function handleCloseShop(session, message) {
  const context = requireArcaneEconomyTurn(session, message);
  if (!context) return;
  Rules.closeShop(context.room.match, Date.now());
  broadcast(context.room, "shop_closed", {
    seat: context.player.seat,
    remainingMs: Rules.getTurnRemainingMs(context.room.match)
  }, message, session);
}

function handleRerollShop(session, message) {
  const context = requireArcaneEconomyTurn(session, message);
  if (!context) return;
  const result = Rules.rerollShop(context.room.match);
  if (!result.ok) {
    sendError(session, message, result.code, ECONOMY_ERROR_MESSAGES[result.code] || "Não foi possível rolar a loja");
    return;
  }
  sendEconomyState(session, context.room, "shop_rerolled", message, { cost: result.cost });
  broadcastPublicPlayers(context.room);
}

function handleBuySpecial(session, message) {
  const context = requireArcaneEconomyTurn(session, message);
  if (!context) return;
  const offerId = String(message.payload.offerId || "");
  const result = Rules.buySpecial(context.room.match, offerId);
  if (!result.ok) {
    sendError(session, message, result.code, ECONOMY_ERROR_MESSAGES[result.code] || "Não foi possível comprar o especial");
    return;
  }
  sendEconomyState(session, context.room, "special_bought", message, {
    offerId: result.offer.offerId,
    instance: result.instance,
    slot: result.slot
  });
  send(session, "inventory_state", {
    privatePlayer: Rules.privatePlayerSnapshot(context.room.match, context.player.seat)
  }, { roomCode: context.room.code });
  broadcastPublicPlayers(context.room);
}

function handleDiscardSpecial(session, message) {
  const context = requireArcaneEconomyTurn(session, message);
  if (!context) return;
  const matchPlayer = Rules.getPlayer(context.room.match, context.player.seat);
  const instanceId = String(message.payload.instanceId || "");
  const slotIndex = Number.isInteger(message.payload.slotIndex)
    ? message.payload.slotIndex
    : matchPlayer.inventory.findIndex((item) => item && item.uid === instanceId);
  const result = Rules.discardSpecial(context.room.match, slotIndex);
  if (!result.ok) {
    sendError(session, message, result.code, ECONOMY_ERROR_MESSAGES[result.code] || "Não foi possível descartar o especial");
    return;
  }
  sendEconomyState(session, context.room, "special_discarded", message, {
    instanceId: result.instance.uid,
    name: result.instance.name,
    slot: result.slot
  });
}

const SPECIAL_TARGET_TYPES = {
  golden_pocket: "pocket",
  light_magnet: "pocket",
  shield_pocket: "pocket",
  magnetic_ball: "ball",
  position_swap: "ball",
  explosive_ball: "ball",
  ice_zone: "point",
  sticky_zone: "point",
  ghost_hand: "point",
  portal_pocket: "two-pockets"
};

function normalizeSpecialTarget(room, instance, rawTarget) {
  const targetType = SPECIAL_TARGET_TYPES[instance.defId] || null;
  if (!targetType) return { ok: true, target: null };

  if (targetType === "pocket") {
    const pocketId = Number(rawTarget && rawTarget.pocketId);
    if (!Number.isInteger(pocketId) || !room.world.getPockets().some((pocket) => pocket.id === pocketId)) {
      return { ok: false, code: "target_required" };
    }
    return { ok: true, target: { pocketId } };
  }

  if (targetType === "ball") {
    const ballId = Number(rawTarget && rawTarget.ballId);
    const ball = room.world.getActiveObjectBalls().find((item) => item.id === ballId);
    if (!ball) return { ok: false, code: "invalid_target" };
    return { ok: true, target: { ballId } };
  }

  if (targetType === "point") {
    const x = Number(rawTarget && rawTarget.x);
    const y = Number(rawTarget && rawTarget.y);
    const radius = instance.defId === "ghost_hand"
      ? CONFIG.balls.radius
      : CONFIG.arcane.specialEffects.zoneRadius;
    if (
      !Number.isFinite(x) || !Number.isFinite(y) ||
      x < radius || x > CONFIG.table.width - radius ||
      y < radius || y > CONFIG.table.height - radius
    ) {
      return { ok: false, code: "invalid_target" };
    }
    if (instance.defId === "ghost_hand" && !room.world.canPlaceCueAt(x, y)) {
      return { ok: false, code: "invalid_target" };
    }
    return { ok: true, target: { x, y } };
  }

  const pocketIds = rawTarget && rawTarget.pocketIds;
  if (
    !Array.isArray(pocketIds) || pocketIds.length !== 2 ||
    Number(pocketIds[0]) === Number(pocketIds[1]) ||
    pocketIds.some((id) => !room.world.getPockets().some((pocket) => pocket.id === Number(id)))
  ) {
    return { ok: false, code: "invalid_target" };
  }
  return { ok: true, target: { pocketIds: pocketIds.map(Number) } };
}

function handleRewindSpecial(session, message, context, instance) {
  const { room, player } = context;
  if (!room.lastResolvedShot || room.lastResolvedShot.shooterSeat === player.seat) {
    sendError(session, message, "no_opponent_shot", "Não há uma tacada adversária para rebobinar");
    return;
  }
  const result = Rules.rewindLastShot(
    room.match,
    room.lastResolvedShot.match,
    player.seat,
    instance.uid,
    Date.now()
  );
  if (!result.ok) {
    sendError(session, message, result.code, "Rebobinar indisponível nesta jogada");
    return;
  }

  room.world.loadSnapshot(room.lastResolvedShot.physics);
  room.lastResolvedShot = null;
  room.currentShotStart = null;
  room.currentShotEffects = {};
  let arcaneEvents = drainArcaneEvents(room);
  arcaneEvents = arcaneEvents.concat(maybeSpawnMagicBall(room));
  const effect = {
    defId: "rewind",
    name: instance.name,
    icon: instance.icon,
    sourceSeat: player.seat,
    sourceUid: instance.uid,
    target: null
  };
  sendEconomyState(session, room, "special_used", message, {
    effect,
    appliedToSeat: player.seat,
    immediate: true
  });
  broadcast(room, "special_effect_started", {
    effect,
    appliedToSeat: player.seat,
    immediate: true,
    match: Rules.publicSnapshot(room.match),
    physics: room.world.getSnapshot()
  });
  broadcastArcaneEvents(room, arcaneEvents);
  broadcastPublicPlayers(room);
  broadcast(room, "physics_snapshot", matchPayload(room));
  broadcast(room, "turn_started", {
    seat: room.match.currentSeat,
    reason: "rewind",
    match: Rules.publicSnapshot(room.match)
  });
  sendPrivateStates(room);
}

function handleUseSpecial(session, message) {
  const context = requireArcaneEconomyTurn(session, message);
  if (!context) return;
  const { room, player } = context;
  const matchPlayer = Rules.getPlayer(room.match, player.seat);
  const instanceId = String(message.payload.instanceId || "");
  const slotIndex = matchPlayer.inventory.findIndex((item) => item && item.uid === instanceId);
  const instance = matchPlayer.inventory[slotIndex];
  if (!instance) {
    sendError(session, message, "empty_slot", ECONOMY_ERROR_MESSAGES.empty_slot);
    return;
  }
  if (instance.defId === "rewind") {
    handleRewindSpecial(session, message, context, instance);
    return;
  }

  const targetResult = normalizeSpecialTarget(room, instance, message.payload.target || null);
  if (!targetResult.ok) {
    sendError(session, message, targetResult.code, ECONOMY_ERROR_MESSAGES[targetResult.code]);
    return;
  }
  const result = Rules.useSpecial(room.match, slotIndex, targetResult.target, { shotReady: true });
  if (!result.ok) {
    sendError(session, message, result.code, ECONOMY_ERROR_MESSAGES[result.code] || "Não foi possível usar o especial");
    return;
  }

  let immediate = false;
  if (result.effect.defId === "position_swap") {
    room.world.swapCueWithBall(result.effect.target.ballId);
    Rules.clearActiveEffect(room.match, player.seat, "position_swap");
    immediate = true;
  } else if (result.effect.defId === "ghost_hand") {
    room.world.moveCueTo(result.effect.target.x, result.effect.target.y);
    Rules.clearActiveEffect(room.match, player.seat, "ghost_hand");
    immediate = true;
  }

  sendEconomyState(session, room, "special_used", message, {
    effect: result.effect,
    appliedToSeat: result.appliedToSeat,
    remainingUses: result.remainingUses,
    immediate
  });
  broadcast(room, "special_effect_started", {
    effect: result.effect,
    appliedToSeat: result.appliedToSeat,
    immediate,
    match: Rules.publicSnapshot(room.match),
    physics: immediate ? room.world.getSnapshot() : null
  });
  sendPrivateStates(room);
}

function requireActiveFreeze(session, message) {
  const context = requireRoomPlayer(session, message);
  if (!context) return null;
  const { room, player } = context;
  const freeze = room.world && room.world.getTimeFreezeState();
  if (
    room.status !== "playing" || !room.simulating ||
    room.match.currentSeat !== player.seat || !freeze || !freeze.active
  ) {
    sendError(session, message, "freeze_unavailable", "Não há Tempo Congelado ativo");
    return null;
  }
  return { room, player, freeze };
}

function handleFrozenDirection(session, message) {
  const context = requireActiveFreeze(session, message);
  if (!context) return;
  const angle = Number(message.payload.angle);
  if (!Number.isFinite(angle)) {
    sendError(session, message, "invalid_direction", "Direção inválida");
    return;
  }
  context.room.world.setFrozenCueDirection(angle);
}

function handleReleaseTimeFreeze(session, message) {
  const context = requireActiveFreeze(session, message);
  if (!context) return;
  context.room.world.releaseTimeFreeze();
}

function finishByAbandonment(room, disconnectedSeat) {
  if (!room.match || room.status !== "playing") return;
  const winner = room.players.find((player) => player.seat !== disconnectedSeat);
  room.status = "finished";
  room.simulating = false;
  room.match.phase = "gameover";
  room.match.winnerSeat = winner ? winner.seat : null;
  room.match.gameEndReason = "Vitória por abandono";
  room.rematchRequestedBy = null;
  room.rematchVotes.clear();
  broadcast(room, "match_finished", {
    winnerSeat: room.match.winnerSeat,
    reason: room.match.gameEndReason,
    ...matchPayload(room)
  });
}

function detachPlayer(session, explicit = false) {
  const room = getRoomForSession(session);
  const player = getPlayerForSession(session, room);
  if (!room || !player) return;

  player.connected = false;
  player.disconnectedAt = Date.now();
  player.socket = null;
  session.roomCode = null;
  session.seat = null;

  if (explicit) {
    if (room.status === "playing") finishByAbandonment(room, player.seat);
    room.players = room.players.filter((item) => item !== player);
    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostSeat === player.seat) room.hostSeat = room.players[0].seat;
    broadcast(room, "lobby_state", publicLobby(room));
    return;
  }

  const reconnectDeadlineAt = player.disconnectedAt + RECONNECT_WINDOW_MS;
  broadcast(room, "player_disconnected", { seat: player.seat, reconnectDeadlineAt });
  broadcast(room, "lobby_state", publicLobby(room));

  player.disconnectTimer = setTimeout(() => {
    if (player.connected) return;
    if (room.status === "playing") finishByAbandonment(room, player.seat);
    if (room.status === "lobby") {
      room.players = room.players.filter((item) => item !== player);
      if (room.players.length === 0) {
        rooms.delete(room.code);
      } else {
        if (room.hostSeat === player.seat) room.hostSeat = room.players[0].seat;
        broadcast(room, "lobby_state", publicLobby(room));
      }
    }
  }, RECONNECT_WINDOW_MS);
}

function resolveRoomShot(room) {
  const shotState = room.world.consumeShotState();
  if (!shotState) return;

  const worldMagicBall = room.world.getMagicBall();
  if (worldMagicBall && room.match.magicBall) {
    room.match.magicBall.x = worldMagicBall.x;
    room.match.magicBall.y = worldMagicBall.y;
  }

  const remainingObjectBalls = room.world.getActiveObjectBalls().filter(
    (ball) => ball.kind === "object" && ball.number !== 8
  );
  const outcome = Rules.resolveShot(room.match, shotState, {
    remainingObjectBalls: remainingObjectBalls.length,
    hasClearShot: room.world.hasClearShot(CONFIG.arcane.defense.clearancePadding),
    shotEffects: room.currentShotEffects,
    now: Date.now()
  });

  if (shotState.cuePocketed) room.world.respawnCue();
  room.simulating = false;
  room.lastResolvedShot = room.currentShotStart;
  room.currentShotStart = null;
  const finishedEffectIds = Object.keys(room.currentShotEffects || {}).filter(
    (id) => id !== "table_zones"
  );
  room.currentShotEffects = {};

  let arcaneEvents = drainArcaneEvents(room);
  if (!outcome.gameOver) arcaneEvents = arcaneEvents.concat(maybeSpawnMagicBall(room));
  broadcastArcaneEvents(room, arcaneEvents);
  for (const defId of finishedEffectIds) {
    broadcast(room, "special_effect_finished", { defId });
  }

  broadcast(room, "physics_snapshot", matchPayload(room));
  broadcast(room, "shot_resolved", {
    outcome: {
      foul: outcome.foul,
      foulReason: outcome.foulReason,
      scoreGained: outcome.scoreGained,
      scoreEvents: outcome.scoreEvents,
      arcanaEvents: outcome.arcanaEvents,
      magicBallCollected: outcome.magicBallCollected,
      continueTurn: outcome.continueTurn,
      doubleShotGranted: outcome.doubleShotGranted,
      turnChanged: outcome.turnChanged,
      gameOver: outcome.gameOver,
      winnerSeat: outcome.winnerSeat,
      gameEndReason: outcome.gameEndReason
    },
    ...matchPayload(room)
  });

  if (outcome.scoreEvents.length > 0 || outcome.arcanaEvents.length > 0) {
    broadcast(room, "points_updated", { players: Rules.publicSnapshot(room.match).players });
  }
  sendPrivateStates(room);

  if (outcome.gameOver) {
    room.status = "finished";
    room.rematchRequestedBy = null;
    room.rematchVotes.clear();
    broadcast(room, "match_finished", {
      winnerSeat: outcome.winnerSeat,
      reason: outcome.gameEndReason,
      ...matchPayload(room)
    });
  } else {
    broadcast(room, "turn_started", {
      seat: room.match.currentSeat,
      match: Rules.publicSnapshot(room.match)
    });
  }
}

function tickRooms() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status !== "playing" || !room.match || !room.world) continue;

    if (room.pause) {
      if (now >= room.pause.deadlineAt) resumeRoomPause(room, "timeout");
      continue;
    }

    if (room.simulating) {
      room.world.step(CONFIG.physics.fixedDt);
      room.world.step(CONFIG.physics.fixedDt);
      room.snapshotTick += 1;

      if (room.snapshotTick % 2 === 0) broadcast(room, "physics_snapshot", matchPayload(room));
      if (!room.world.ballsMoving()) resolveRoomShot(room);
      continue;
    }

    if (Rules.isTurnExpired(room.match, now)) {
      const result = Rules.timeoutTurn(room.match, now);
      if (result.ok) {
        let arcaneEvents = drainArcaneEvents(room);
        arcaneEvents = arcaneEvents.concat(maybeSpawnMagicBall(room));
        broadcastArcaneEvents(room, arcaneEvents);
        sendPrivateStates(room);
        broadcast(room, "turn_started", {
          seat: result.nextSeat,
          reason: "timeout",
          match: Rules.publicSnapshot(room.match)
        });
      }
    }
  }
}

wss.on("connection", (socket) => {
  const session = createSession(socket);
  sessions.set(socket, session);

  send(session, "welcome", {
    connectionId: session.connectionId,
    protocolVersion: Protocol.VERSION,
    capabilities: ["transport", "ping", "rooms", "classic_multiplayer", "arcane_multiplayer"],
    projectPhase: 8,
    multiplayerEnabled: true
  });

  socket.on("message", (raw) => {
    const parsed = Protocol.parse(raw, ACTIVE_CLIENT_TYPES);
    if (!parsed.ok) {
      send(session, "error", {
        code: parsed.code || "invalid_message",
        message: parsed.message || "Mensagem rejeitada"
      });
      return;
    }

    const message = parsed.message;
    if (message.requestId && session.requestCache.has(message.requestId)) {
      sendSerialized(socket, session.requestCache.get(message.requestId));
      return;
    }

    if (message.type === "hello") {
      reply(session, message, "welcome", {
        connectionId: session.connectionId,
        protocolVersion: Protocol.VERSION,
        capabilities: ["transport", "ping", "rooms", "classic_multiplayer", "arcane_multiplayer"],
        projectPhase: 8,
        multiplayerEnabled: true
      });
    } else if (message.type === "ping") {
      reply(session, message, "pong", {
        clientTime: message.payload.clientTime || null,
        serverTime: Date.now()
      });
    } else if (message.type === "create_room") {
      handleCreateRoom(session, message);
    } else if (message.type === "join_room") {
      handleJoinRoom(session, message);
    } else if (message.type === "resume_session") {
      handleResumeSession(session, message);
    } else if (message.type === "set_ready") {
      handleSetReady(session, message);
    } else if (message.type === "start_match") {
      handleStartMatch(session, message);
    } else if (message.type === "request_rematch") {
      handleRequestRematch(session, message);
    } else if (message.type === "pause_match") {
      handlePauseMatch(session, message);
    } else if (message.type === "resume_match") {
      handleResumeMatch(session, message);
    } else if (message.type === "shoot") {
      handleShoot(session, message);
    } else if (message.type === "request_snapshot") {
      handleRequestSnapshot(session, message);
    } else if (message.type === "open_shop") {
      handleOpenShop(session, message);
    } else if (message.type === "close_shop") {
      handleCloseShop(session, message);
    } else if (message.type === "reroll_shop") {
      handleRerollShop(session, message);
    } else if (message.type === "buy_special") {
      handleBuySpecial(session, message);
    } else if (message.type === "discard_special") {
      handleDiscardSpecial(session, message);
    } else if (message.type === "use_special" || message.type === "select_special_target") {
      handleUseSpecial(session, message);
    } else if (message.type === "set_frozen_direction") {
      handleFrozenDirection(session, message);
    } else if (message.type === "release_time_freeze") {
      handleReleaseTimeFreeze(session, message);
    } else if (message.type === "leave_room") {
      detachPlayer(session, true);
    }
  });

  socket.on("close", () => detachPlayer(session, false));
});

const roomTicker = setInterval(tickRooms, 1000 / 60);
server.on("close", () => clearInterval(roomTicker));

server.listen(PORT, HOST, () => {
  const address = server.address();
  const actualPort = address && typeof address === "object" ? address.port : PORT;
  console.log(`Arcane Pool disponível em http://localhost:${actualPort}`);
  console.log(`Protocolo WebSocket v${Protocol.VERSION}; Fase 10 de polimento final completa.`);
});

module.exports = { server, wss, rooms };
