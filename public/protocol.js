const Protocol = (() => {
  const VERSION = 1;
  const MAX_MESSAGE_BYTES = 32768;

  const CLIENT_TYPES = Object.freeze([
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
    "use_special",
    "discard_special",
    "select_special_target",
    "set_frozen_direction",
    "release_time_freeze"
  ]);

  const SERVER_TYPES = Object.freeze([
    "welcome",
    "pong",
    "session_resumed",
    "error",
    "room_created",
    "room_joined",
    "lobby_state",
    "player_disconnected",
    "player_reconnected",
    "match_started",
    "shot_accepted",
    "shot_rejected",
    "physics_snapshot",
    "shot_resolved",
    "turn_started",
    "points_updated",
    "match_finished",
    "rematch_state",
    "match_paused",
    "match_resumed",
    "shop_state",
    "shop_rerolled",
    "shop_opened",
    "shop_closed",
    "special_bought",
    "special_used",
    "special_discarded",
    "special_ready",
    "special_cooldown",
    "special_effect_started",
    "special_effect_finished",
    "special_physics_event",
    "inventory_state",
    "arcana_points_updated",
    "arcane_ball_spawned",
    "arcane_ball_touched",
    "arcane_ball_potted",
    "arcane_ball_expired",
    "arcane_reward_granted",
    "arcane_reward_converted"
  ]);

  function makeId(prefix = "req", random = Math.random) {
    const time = Date.now().toString(36);
    const suffix = Math.floor(random() * 0x7fffffff).toString(36);
    return `${prefix}_${time}_${suffix}`;
  }

  function createEnvelope(type, payload = {}, options = {}) {
    return {
      v: VERSION,
      type,
      requestId: options.requestId || makeId("req", options.random),
      roomCode: options.roomCode || null,
      seq: Number.isInteger(options.seq) ? options.seq : null,
      payload: payload && typeof payload === "object" ? payload : {}
    };
  }

  function validateEnvelope(message, allowedTypes) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return { ok: false, code: "invalid_envelope", message: "Envelope inválido" };
    }

    if (message.v !== VERSION) {
      return { ok: false, code: "unsupported_version", message: "Versão de protocolo incompatível" };
    }

    if (typeof message.type !== "string" || !message.type) {
      return { ok: false, code: "invalid_type", message: "Tipo de mensagem ausente" };
    }

    if (allowedTypes && !allowedTypes.includes(message.type)) {
      return { ok: false, code: "unsupported_type", message: "Mensagem não disponível nesta fase" };
    }

    if (message.requestId !== null && message.requestId !== undefined && typeof message.requestId !== "string") {
      return { ok: false, code: "invalid_request_id", message: "requestId inválido" };
    }

    if (message.payload !== undefined && (!message.payload || typeof message.payload !== "object" || Array.isArray(message.payload))) {
      return { ok: false, code: "invalid_payload", message: "Payload inválido" };
    }

    return { ok: true };
  }

  function parse(raw, allowedTypes) {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");

    if (text.length > MAX_MESSAGE_BYTES) {
      return { ok: false, code: "message_too_large", message: "Mensagem excede o limite" };
    }

    let message;
    try {
      message = JSON.parse(text);
    } catch (error) {
      return { ok: false, code: "invalid_json", message: "JSON inválido" };
    }

    const validation = validateEnvelope(message, allowedTypes);
    return validation.ok ? { ok: true, message } : validation;
  }

  return {
    VERSION,
    MAX_MESSAGE_BYTES,
    CLIENT_TYPES,
    SERVER_TYPES,
    createEnvelope,
    validateEnvelope,
    parse,
    makeId
  };
})();

if (typeof module === "object" && module.exports) {
  module.exports = Protocol;
}

