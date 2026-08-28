const Net = (() => {
  const listeners = new Map();
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let manuallyClosed = false;
  let lastPingAt = 0;
  let pingMs = null;

  const state = {
    status: "offline",
    connectionId: null,
    protocolVersion: Protocol.VERSION,
    pingMs: null
  };

  function emit(type, payload) {
    const handlers = listeners.get(type);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }

  function on(type, handler) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    return () => listeners.get(type).delete(handler);
  }

  function setStatus(status) {
    state.status = status;
    emit("status", { ...state });
  }

  function defaultUrl() {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${location.host}`;
  }

  function connect(url = defaultUrl()) {
    manuallyClosed = false;

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setStatus("connecting");
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      reconnectAttempts = 0;
      setStatus("connected");
      send("hello", { clientVersion: CONFIG.version });
    });

    socket.addEventListener("message", (event) => {
      const parsed = Protocol.parse(event.data, Protocol.SERVER_TYPES);
      if (!parsed.ok) {
        emit("protocol_error", parsed);
        return;
      }

      const message = parsed.message;

      if (message.type === "welcome") {
        state.connectionId = message.payload.connectionId || null;
        state.protocolVersion = message.payload.protocolVersion || Protocol.VERSION;
      }

      if (message.type === "pong" && message.payload.clientTime) {
        pingMs = Math.max(0, Date.now() - message.payload.clientTime);
        state.pingMs = pingMs;
        emit("ping", pingMs);
      }

      emit(message.type, message);
    });

    socket.addEventListener("close", () => {
      socket = null;
      state.connectionId = null;
      setStatus("offline");
      if (!manuallyClosed) scheduleReconnect(url);
    });

    socket.addEventListener("error", () => {
      emit("connection_error", { status: state.status });
    });
  }

  function scheduleReconnect(url) {
    clearTimeout(reconnectTimer);
    reconnectAttempts += 1;
    const delay = Math.min(10000, 500 * 2 ** Math.min(reconnectAttempts, 5));
    reconnectTimer = setTimeout(() => connect(url), delay);
  }

  function disconnect() {
    manuallyClosed = true;
    clearTimeout(reconnectTimer);
    if (socket) socket.close(1000, "client_closed");
    socket = null;
    setStatus("offline");
  }

  function send(type, payload = {}, options = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return { ok: false, code: "not_connected" };
    }

    const envelope = Protocol.createEnvelope(type, payload, options);
    socket.send(JSON.stringify(envelope));
    return { ok: true, requestId: envelope.requestId };
  }

  function ping() {
    lastPingAt = Date.now();
    return send("ping", { clientTime: lastPingAt });
  }

  function getState() {
    return { ...state };
  }

  return {
    connect,
    disconnect,
    send,
    ping,
    on,
    getState
  };
})();

