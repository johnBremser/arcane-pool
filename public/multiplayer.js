const Multiplayer = (() => {
  const dom = {};
  let localSeat = null;
  let currentLobby = null;
  let inMatch = false;

  function init() {
    dom.openButton = document.getElementById("multiplayerButton");
    dom.overlay = document.getElementById("multiplayerOverlay");
    dom.closeButton = document.getElementById("multiplayerCloseButton");
    dom.status = document.getElementById("multiplayerStatus");
    dom.title = document.getElementById("multiplayerTitle");
    dom.entry = document.getElementById("multiplayerEntry");
    dom.lobby = document.getElementById("multiplayerLobby");
    dom.name = document.getElementById("multiplayerName");
    dom.codeInput = document.getElementById("roomCodeInput");
    dom.createButton = document.getElementById("createRoomButton");
    dom.joinButton = document.getElementById("joinRoomButton");
    dom.codeValue = document.getElementById("roomCodeValue");
    dom.players = document.getElementById("lobbyPlayers");
    dom.readyButton = document.getElementById("readyButton");
    dom.startButton = document.getElementById("startMatchButton");
    dom.leaveButton = document.getElementById("leaveRoomButton");

    bindDomEvents();
    bindNetworkEvents();
    setConnectionStatus("offline");
  }

  function bindDomEvents() {
    dom.openButton.addEventListener("click", open);
    dom.closeButton.addEventListener("click", close);
    dom.createButton.addEventListener("click", createRoom);
    dom.joinButton.addEventListener("click", joinRoom);
    dom.readyButton.addEventListener("click", toggleReady);
    dom.startButton.addEventListener("click", () => Net.send("start_match"));
    dom.leaveButton.addEventListener("click", leaveRoom);

    dom.codeInput.addEventListener("input", () => {
      dom.codeInput.value = dom.codeInput.value.replace(/[^a-z0-9]/gi, "").toUpperCase();
    });

    dom.codeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") joinRoom();
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dom.overlay.classList.contains("hidden") && !inMatch) {
        close();
      }
    });
  }

  function bindNetworkEvents() {
    Net.on("status", (state) => setConnectionStatus(state.status));

    Net.on("welcome", () => setConnectionStatus("connected"));

    Net.on("room_created", (message) => {
      localSeat = Number(message.payload.seat);
      showLobbyShell(message.payload.code);
    });

    Net.on("room_joined", (message) => {
      localSeat = Number(message.payload.seat);
      if (message.payload.lobby) renderLobby(message.payload.lobby);
    });

    Net.on("lobby_state", (message) => {
      renderLobby(message.payload);
    });

    Net.on("session_resumed", (message) => {
      localSeat = Number(message.payload.seat);
      if (message.payload.lobby) renderLobby(message.payload.lobby);
      if (message.payload.match && message.payload.physics) {
        startNetworkPresentation(message.payload);
      }
    });

    Net.on("session_lost", () => {
      localSeat = null;
      currentLobby = null;
      inMatch = false;
      showEntry();
      setStatus("Sessão anterior encerrada. Entre em uma sala novamente.");
      if (window.ArcaneGame) window.ArcaneGame.leaveMultiplayer();
    });

    Net.on("match_started", (message) => startNetworkPresentation(message.payload));

    Net.on("shot_accepted", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerShotAccepted(message.payload);
    });

    Net.on("shot_rejected", (message) => {
      if (window.ArcaneGame) {
        window.ArcaneGame.setMultiplayerShotActive(false);
        window.ArcaneGame.notify(message.payload.message || "Tacada recusada", "error");
      }
    });

    Net.on("physics_snapshot", (message) => {
      if (inMatch && window.ArcaneGame) {
        window.ArcaneGame.applyMultiplayerPhysics(message.payload);
      }
    });

    Net.on("shot_resolved", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerShotResult(message.payload);
    });

    Net.on("turn_started", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerTurn(message.payload);
    });

    Net.on("points_updated", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerPlayers(message.payload);
    });

    Net.on("shop_opened", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerShopOpened(message.payload);
    });

    Net.on("shop_closed", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerShopClosed(message.payload);
    });

    Net.on("shop_state", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerShopState(message.payload);
    });

    Net.on("shop_rerolled", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerShopRerolled(message.payload);
    });

    Net.on("special_bought", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerSpecialBought(message.payload);
    });

    Net.on("special_discarded", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerSpecialDiscarded(message.payload);
    });

    Net.on("special_used", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerSpecialUsed(message.payload);
    });

    Net.on("special_effect_started", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerSpecialEffectStarted(message.payload);
    });

    Net.on("special_effect_finished", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerSpecialEffectFinished(message.payload);
    });

    Net.on("special_physics_event", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerSpecialPhysicsEvent(message.payload);
    });

    Net.on("inventory_state", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerPrivateState(message.payload);
    });

    [
      "arcane_ball_spawned",
      "arcane_ball_touched",
      "arcane_ball_potted",
      "arcane_ball_expired",
      "arcane_reward_granted",
      "arcane_reward_converted"
    ].forEach((eventType) => {
      Net.on(eventType, (message) => {
        if (window.ArcaneGame) {
          window.ArcaneGame.applyMultiplayerArcaneEvent(eventType, message.payload);
        }
      });
    });

    Net.on("match_finished", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.finishMultiplayer(message.payload);
    });

    Net.on("rematch_state", (message) => {
      if (window.ArcaneGame) window.ArcaneGame.applyMultiplayerRematchState(message.payload);
    });

    Net.on("player_disconnected", (message) => {
      if (window.ArcaneGame) {
        window.ArcaneGame.notify(`Jogador ${message.payload.seat} desconectou — aguardando reconexão`, "error");
      }
    });

    Net.on("player_reconnected", (message) => {
      if (window.ArcaneGame) {
        window.ArcaneGame.notify(`Jogador ${message.payload.seat} reconectou`, "success");
      }
    });

    Net.on("error", (message) => {
      setStatus(message.payload.message || "O servidor recusou a operação");
      if (inMatch && window.ArcaneGame) {
        window.ArcaneGame.notify(message.payload.message || "Erro de rede", "error");
      }
    });
  }

  function open() {
    dom.overlay.classList.remove("hidden");
    if (Net.getState().status === "offline") Net.connect();
    if (currentLobby) renderLobby(currentLobby);
    window.setTimeout(() => dom.name.focus(), 0);
  }

  function close() {
    dom.overlay.classList.add("hidden");
    dom.openButton.focus();
  }

  function setStatus(text) {
    dom.status.textContent = text;
  }

  function setConnectionStatus(status) {
    const connected = status === "connected";
    dom.createButton.disabled = !connected;
    dom.joinButton.disabled = !connected;
    const labels = {
      offline: "Abra o multiplayer para conectar",
      connecting: "Conectando ao servidor…",
      connected: "Servidor online — escolha como jogar"
    };
    if (!currentLobby && !inMatch) setStatus(labels[status] || status);
  }

  function playerName() {
    return dom.name.value.replace(/\s+/g, " ").trim().slice(0, 24) || "Jogador";
  }

  function createRoom() {
    const modeSelect = document.getElementById("modeSelect");
    const mode = modeSelect && modeSelect.value === "arcane" ? "arcane" : "classic";
    const result = Net.send("create_room", { name: playerName(), mode });
    if (!result.ok) setStatus("Ainda conectando ao servidor…");
  }

  function joinRoom() {
    const code = dom.codeInput.value.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (code.length !== 6) {
      setStatus("Digite o código de 6 caracteres da sala");
      return;
    }
    const result = Net.send("join_room", { code, name: playerName() });
    if (!result.ok) setStatus("Ainda conectando ao servidor…");
  }

  function showEntry() {
    dom.entry.classList.remove("hidden");
    dom.lobby.classList.add("hidden");
  }

  function showLobbyShell(code) {
    dom.entry.classList.add("hidden");
    dom.lobby.classList.remove("hidden");
    dom.codeValue.textContent = code || "------";
    setStatus("Aguardando o segundo jogador");
  }

  function renderLobby(lobby) {
    if (!lobby) return;
    currentLobby = lobby;
    dom.title.textContent = lobby.mode === "arcane" ? "Multiplayer Arcano" : "Multiplayer clássico";
    showLobbyShell(lobby.code);
    dom.players.replaceChildren();

    for (let seat = 1; seat <= 2; seat += 1) {
      const player = lobby.players.find((item) => item.seat === seat);
      const row = document.createElement("div");
      row.className = "lobbyPlayer";

      const identity = document.createElement("div");
      const name = document.createElement("strong");
      const meta = document.createElement("small");
      const status = document.createElement("span");
      status.className = "lobbyPlayerStatus";

      if (player) {
        name.textContent = player.name;
        meta.textContent = `Jogador ${player.seat}${player.host ? " · anfitrião" : ""}`;
        status.textContent = player.connected ? (player.ready ? "Pronto" : "Aguardando") : "Desconectado";
        row.classList.toggle("ready", player.ready && player.connected);
        row.classList.toggle("disconnected", !player.connected);
      } else {
        name.textContent = "Espaço disponível";
        meta.textContent = `Jogador ${seat}`;
        status.textContent = "Aguardando";
      }

      identity.append(name, meta);
      row.append(identity, status);
      dom.players.appendChild(row);
    }

    const me = lobby.players.find((player) => player.seat === localSeat);
    const everyoneReady = lobby.players.length === 2 && lobby.players.every(
      (player) => player.ready && player.connected
    );
    const amHost = localSeat === lobby.hostSeat;

    dom.readyButton.textContent = me && me.ready ? "Cancelar prontidão" : "Estou pronto";
    dom.readyButton.disabled = !me || !me.connected;
    dom.startButton.disabled = !amHost || !everyoneReady;
    dom.startButton.title = amHost
      ? (everyoneReady ? "Iniciar partida" : "Aguarde os dois jogadores ficarem prontos")
      : "Somente o anfitrião pode iniciar";
    setStatus(lobby.players.length < 2 ? "Compartilhe o código da sala" : "Definam a prontidão para começar");
  }

  function toggleReady() {
    if (!currentLobby) return;
    const me = currentLobby.players.find((player) => player.seat === localSeat);
    Net.send("set_ready", { ready: !(me && me.ready) });
  }

  function startNetworkPresentation(payload) {
    const state = Net.getState();
    localSeat = localSeat || state.seat;
    inMatch = true;
    close();
    if (window.ArcaneGame) {
      window.ArcaneGame.enterMultiplayer({
        seat: localSeat,
        roomCode: state.roomCode,
        match: payload.match,
        privatePlayer: payload.privatePlayer,
        physics: payload.physics,
        moving: payload.moving,
        sendShot: (shot) => Net.send("shoot", shot),
        sendCommand: (type, payload = {}) => Net.send(type, payload),
        requestRematch: () => Net.send("request_rematch"),
        leave: leaveRoom
      });
      if (payload.match && payload.match.phase === "gameover") {
        window.ArcaneGame.finishMultiplayer({
          ...payload,
          winnerSeat: payload.match.winnerSeat,
          reason: payload.match.gameEndReason
        });
        if (payload.rematch) {
          window.ArcaneGame.applyMultiplayerRematchState(payload.rematch);
        }
      }
    }
  }

  function leaveRoom() {
    if (Net.getState().roomCode) Net.leaveRoom();
    localSeat = null;
    currentLobby = null;
    inMatch = false;
    showEntry();
    close();
    if (window.ArcaneGame) window.ArcaneGame.leaveMultiplayer();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { open, leaveRoom };
})();
