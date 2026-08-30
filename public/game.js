(() => {
  let canvas = null;
  let ctx = null;
  let tableTexture = null;

  const view = {
    w: 0,
    h: 0
  };

  const mouse = {
    x: 0,
    y: 0,
    inside: false
  };

  const aim = {
    angle: 0
  };

  const drag = {
    active: false,
    startX: 0,
    startY: 0,
    angle: 0,
    power: 0
  };

  const breakPlacement = {
    active: false
  };

  const spin = {
    x: 0,
    y: 0
  };

  const particles = [];
  const PARTICLE_POOL_SIZE = 420;

  let shotActive = false;
  let currentShotEffects = {};
  let pendingSpecialTarget = null;
  let softTrailAccumulator = 0;
  let magicTrailAccumulator = 0;
  let currentShotStart = null;
  let lastResolvedShot = null;
  let messageUntil = 0;

  let lastBallSoundAt = 0;
  let lastCushionSoundAt = 0;
  let countdownTurnToken = "";
  let lastCountdownSecond = null;

  let accumulator = 0;
  let lastTime = performance.now();
  let networkPhysicsTarget = null;

  const dom = {};

  const game = Rules.createMatch("classic", Date.now());

  const networkMatch = {
    active: false,
    seat: null,
    roomCode: null,
    sendShot: null,
    sendCommand: null,
    freezeActive: false,
    freezeAngle: 0,
    lastFreezeDirectionAt: 0,
    requestRematch: null,
    leave: null
  };

  const aiMatch = {
    enabled: false,
    seat: 2,
    difficulty: "normal",
    timer: null,
    turnToken: null,
    thinking: false,
    lastPlan: null
  };

  const focusPause = {
    active: false
  };

  let lastHelpFocus = null;

  const KEY_ACTIONS = new Map([
    ["Escape", "cancel"],
    ["l", "toggle-shop"],
    ["L", "toggle-shop"],
    ["r", "reset-match"],
    ["R", "reset-match"]
  ]);

  const ICON_EMOJI = {
    eye: "👁",
    target: "🎯",
    feather: "🍃",
    binocular: "🔭",
    balance: "⚖",
    ghost: "👻",
    coin: "🪙",
    heartbeat: "💗",
    magnet: "🧲",
    double: "×2",
    attract: "◎",
    rewind: "⏪",
    shield: "🛡",
    snowflake: "❄",
    slime: "◎",
    swap: "⇄",
    hourglass: "⏳",
    hand: "✋",
    portal: "◎",
    bomb: "💣"
  };

  function init() {
    cacheDom();
    setHudPanelCollapsed(dom.spinPanel, dom.spinToggle, true);
    setHudPanelCollapsed(dom.inventoryPanel, dom.inventoryToggle, true);
    initParticles();

    Physics.init();
    Physics.setCallbacks({
      onBallCollision,
      onCushion,
      onPocket,
      onShot,
      onShotStarted,
      onFirstContact,
      onSpecialPhysicsEvent
    });

    setupCanvas();
    bindEvents();
    resetSpinUI();
    renderHelpGuide();
    updateAudioUI();
    setOpponent(dom.opponentSelect.value);
    setMode("classic");
    updateScoreboard();
    updateTurnUI();
    setStateLabel("Arraste a branca ↕ antes da saída");

    lastTime = performance.now();
    requestAnimationFrame(frame);
  }

  function cacheDom() {
    dom.canvas = document.getElementById("gameCanvas");
    dom.resetButton = document.getElementById("resetButton");
    dom.audioButton = document.getElementById("audioButton");
    dom.musicButton = document.getElementById("musicButton");
    dom.turnLabel = document.getElementById("turnLabel");
    dom.stateLabel = document.getElementById("stateLabel");
    dom.forceFill = document.getElementById("forceFill");
    dom.forceText = document.getElementById("forceText");
    dom.forcePanel = document.getElementById("forcePanel");
    dom.forceIdealZone = document.getElementById("forceIdealZone");
    dom.spinPanel = document.getElementById("spinPanel");
    dom.spinBall = document.getElementById("spinBall");
    dom.spinDot = document.getElementById("spinDot");
    dom.spinInfo = document.getElementById("spinInfo");
    dom.spinReset = document.getElementById("spinReset");
    dom.spinToggle = document.getElementById("spinToggle");
    dom.spinContent = document.getElementById("spinContent");
    dom.shotTimer = document.getElementById("shotTimer");
    dom.scoreboard = document.getElementById("scoreboard");
    dom.playerCards = document.querySelectorAll(".playerCard");
    dom.toastContainer = document.getElementById("toastContainer");
    dom.gameOverOverlay = document.getElementById("gameOverOverlay");
    dom.gameOverTitle = document.getElementById("gameOverTitle");
    dom.gameOverReason = document.getElementById("gameOverReason");
    dom.gameOverScores = document.getElementById("gameOverScores");
    dom.gameOverButton = document.getElementById("gameOverButton");
    dom.gameOverExitButton = document.getElementById("gameOverExitButton");
    dom.gameOverRematchStatus = document.getElementById("gameOverRematchStatus");
    dom.modeSelect = document.getElementById("modeSelect");
    dom.opponentSelect = document.getElementById("opponentSelect");
    dom.controls = document.getElementById("controls");
    dom.gameMenuButton = document.getElementById("gameMenuButton");
    dom.gameMenuSummary = document.getElementById("gameMenuSummary");
    dom.gameMenu = document.getElementById("gameMenu");
    dom.audioMenuButton = document.getElementById("audioMenuButton");
    dom.audioMenuSummary = document.getElementById("audioMenuSummary");
    dom.audioMenu = document.getElementById("audioMenu");
    dom.helpButton = document.getElementById("helpButton");
    dom.helpOverlay = document.getElementById("helpOverlay");
    dom.helpCloseButton = document.getElementById("helpCloseButton");
    dom.specialGuide = document.getElementById("specialGuide");
    dom.multiplayerButton = document.getElementById("multiplayerButton");
    dom.shopButton = document.getElementById("shopButton");
    dom.shopOverlay = document.getElementById("shopOverlay");
    dom.shopOffers = document.getElementById("shopOffers");
    dom.shopArcanaValue = document.getElementById("shopArcanaValue");
    dom.shopInventorySpace = document.getElementById("shopInventorySpace");
    dom.shopRerollButton = document.getElementById("shopRerollButton");
    dom.shopCloseButton = document.getElementById("shopCloseButton");
    dom.rerollCostValue = document.getElementById("rerollCostValue");
    dom.inventoryPanel = document.getElementById("inventoryPanel");
    dom.inventoryToggle = document.getElementById("inventoryToggle");
    dom.inventoryCount = document.getElementById("inventoryCount");
    dom.inventorySlots = document.getElementById("inventorySlots");
    dom.activeEffectsPanel = document.getElementById("activeEffectsPanel");
    dom.magicBallPanel = document.getElementById("magicBallPanel");
    dom.magicBallLabel = document.getElementById("magicBallLabel");
    dom.magicBallTurns = document.getElementById("magicBallTurns");
    dom.targetPrompt = document.getElementById("targetPrompt");
    dom.targetPromptText = document.getElementById("targetPromptText");
    dom.targetCancelButton = document.getElementById("targetCancelButton");
  }

  function initParticles() {
    particles.length = 0;

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: "#ffffff"
      });
    }
  }

  function setupCanvas() {
    canvas = dom.canvas;
    ctx = canvas.getContext("2d");

    view.w = CONFIG.table.width + CONFIG.table.rail * 2;
    view.h = CONFIG.table.height + CONFIG.table.rail * 2;

    tableTexture = buildTableTexture();

    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.parentElement.clientWidth;

    canvas.style.width = "100%";
    canvas.style.height = "auto";

    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssWidth * (view.h / view.w) * dpr));

    ctx.setTransform(canvas.width / view.w, 0, 0, canvas.height / view.h, 0, 0);
  }

  function bindEvents() {
    dom.resetButton.addEventListener("click", () => {
      AudioSys.ensure();
      AudioSys.playClick();
      if (networkMatch.active && networkMatch.leave) {
        networkMatch.leave();
        return;
      }
      startNewMatch();
    });

    dom.audioButton.addEventListener("click", () => {
      const shouldEnable = !AudioSys.isEnabled();
      const enabled = AudioSys.setEnabled(shouldEnable);
      updateAudioUI();
      if (enabled) AudioSys.playClick();
    });

    dom.musicButton.addEventListener("click", () => {
      const shouldEnable = !AudioSys.isAmbientEnabled();
      const enabled = AudioSys.setAmbient(shouldEnable);
      updateAudioUI();
      if (enabled && AudioSys.isEnabled()) AudioSys.playClick();
    });

    dom.spinReset.addEventListener("click", () => {
      AudioSys.ensure();
      AudioSys.playClick();
      resetSpinUI();
    });

    dom.spinToggle.addEventListener("click", () => {
      setHudPanelCollapsed(
        dom.spinPanel,
        dom.spinToggle,
        !dom.spinPanel.classList.contains("collapsed")
      );
      AudioSys.ensure();
      AudioSys.playClick();
    });

    dom.inventoryToggle.addEventListener("click", () => {
      setHudPanelCollapsed(
        dom.inventoryPanel,
        dom.inventoryToggle,
        !dom.inventoryPanel.classList.contains("collapsed")
      );
      AudioSys.ensure();
      AudioSys.playClick();
    });

    dom.gameOverButton.addEventListener("click", () => {
      AudioSys.ensure();
      AudioSys.playClick();
      if (networkMatch.active && networkMatch.requestRematch) {
        const result = networkMatch.requestRematch();
        if (!result || !result.ok) showToast("Não foi possível pedir a revanche", "error");
        return;
      }
      hideGameOver();
      startNewMatch();
    });

    dom.gameOverExitButton.addEventListener("click", () => {
      AudioSys.ensure();
      AudioSys.playClick();
      if (networkMatch.active && networkMatch.leave) networkMatch.leave();
    });

    dom.modeSelect.addEventListener("change", (e) => {
      AudioSys.ensure();
      AudioSys.playClick();
      setMode(e.target.value);
      startNewMatch();
    });

    dom.opponentSelect.addEventListener("change", (e) => {
      AudioSys.ensure();
      AudioSys.playClick();
      setOpponent(e.target.value);
      startNewMatch();
    });

    dom.gameMenuButton.addEventListener("click", () => {
      AudioSys.ensure();
      AudioSys.playClick();
      toggleControlMenu(dom.gameMenu, dom.gameMenuButton);
    });

    dom.audioMenuButton.addEventListener("click", () => {
      AudioSys.ensure();
      AudioSys.playClick();
      toggleControlMenu(dom.audioMenu, dom.audioMenuButton);
    });

    dom.helpButton.addEventListener("click", openHelp);
    dom.helpCloseButton.addEventListener("click", closeHelp);
    dom.helpOverlay.addEventListener("pointerdown", (e) => {
      if (e.target === dom.helpOverlay) closeHelp();
    });

    dom.multiplayerButton.addEventListener("click", () => closeControlMenus());

    dom.shopButton.addEventListener("click", () => {
      AudioSys.ensure();
      toggleShop();
    });

    dom.shopCloseButton.addEventListener("click", () => {
      AudioSys.ensure();
      AudioSys.playClick();
      if (networkMatch.active) toggleShop();
      else closeShop();
    });

    dom.shopRerollButton.addEventListener("click", () => {
      AudioSys.ensure();
      rerollShop();
    });

    dom.targetCancelButton.addEventListener("click", () => {
      AudioSys.ensure();
      AudioSys.playClick();
      cancelSpecialTarget();
    });

    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".controlMenuWrap")) closeControlMenus();
    });

    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointerup", onCanvasPointerUp);
    canvas.addEventListener("pointerleave", onCanvasPointerLeave);

    let spinDragging = false;

    dom.spinBall.addEventListener("pointerdown", (e) => {
      spinDragging = true;
      dom.spinBall.setPointerCapture(e.pointerId);
      updateSpinFromPointer(e);
    });

    dom.spinBall.addEventListener("pointermove", (e) => {
      if (!spinDragging) return;
      updateSpinFromPointer(e);
    });

    dom.spinBall.addEventListener("pointerup", () => {
      spinDragging = false;
    });

    dom.spinBall.addEventListener("pointercancel", () => {
      spinDragging = false;
    });

    window.addEventListener("keydown", (e) => {
      const target = e.target;
      if (
        target &&
        (target.matches("input, select, textarea") || target.isContentEditable)
      ) {
        return;
      }

      const action = KEY_ACTIONS.get(e.key);

      if (action === "cancel") {
        if (!dom.helpOverlay.classList.contains("hidden")) {
          closeHelp();
        } else if (isControlMenuOpen()) {
          closeControlMenus(true);
        } else if (pendingSpecialTarget) {
          cancelSpecialTarget();
        } else if (game.players[game.currentSeat - 1].shop.open) {
          closeShop();
        } else {
          cancelDrag();
        }
      }

      if (action === "reset-match") {
        startNewMatch();
      }

      if (action === "toggle-shop" && game.mode === "arcane") {
        e.preventDefault();
        toggleShop();
      }
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  function toggleControlMenu(menu, button) {
    const shouldOpen = menu.classList.contains("hidden");
    closeControlMenus();
    if (!shouldOpen) return;
    menu.classList.remove("hidden");
    button.setAttribute("aria-expanded", "true");
  }

  function closeControlMenus(restoreFocus = false) {
    const openButton = [dom.gameMenuButton, dom.audioMenuButton]
      .find((button) => button && button.getAttribute("aria-expanded") === "true");
    [
      [dom.gameMenu, dom.gameMenuButton],
      [dom.audioMenu, dom.audioMenuButton]
    ].forEach(([menu, button]) => {
      if (menu) menu.classList.add("hidden");
      if (button) button.setAttribute("aria-expanded", "false");
    });
    if (restoreFocus && openButton) openButton.focus();
  }

  function isControlMenuOpen() {
    return !dom.gameMenu.classList.contains("hidden")
      || !dom.audioMenu.classList.contains("hidden");
  }

  function updateAudioUI() {
    const effectsEnabled = AudioSys.isEnabled();
    const musicEnabled = AudioSys.isAmbientEnabled();
    dom.audioButton.setAttribute("aria-pressed", String(effectsEnabled));
    dom.musicButton.setAttribute("aria-pressed", String(musicEnabled));
    dom.audioButton.textContent = effectsEnabled ? "Efeitos: ligados" : "Efeitos: desligados";
    dom.musicButton.textContent = musicEnabled ? "Música: ligada" : "Música: desligada";
    dom.audioMenuSummary.textContent = effectsEnabled && musicEnabled
      ? "tudo ligado"
      : effectsEnabled
        ? "efeitos"
        : musicEnabled
          ? "música"
          : "desligado";
  }

  function updateGameMenuSummary() {
    const mode = dom.modeSelect.value === "arcane" ? "Arcano" : "Clássico";
    const opponents = {
      local: "local",
      ai_easy: "IA fácil",
      ai_normal: "IA normal",
      ai_hard: "IA difícil"
    };
    dom.gameMenuSummary.textContent = `${mode} · ${opponents[dom.opponentSelect.value] || "local"}`;
  }

  function openHelp() {
    closeControlMenus();
    lastHelpFocus = document.activeElement;
    dom.helpOverlay.classList.remove("hidden");
    dom.helpCloseButton.focus();
  }

  function closeHelp() {
    if (dom.helpOverlay.classList.contains("hidden")) return;
    dom.helpOverlay.classList.add("hidden");
    if (lastHelpFocus && typeof lastHelpFocus.focus === "function") lastHelpFocus.focus();
    lastHelpFocus = null;
  }

  function renderHelpGuide() {
    const usage = {
      ghost_aim: "Ative no inventário antes de mirar; a prévia ampliada vale para a próxima tacada.",
      perfect_force: "Ative no inventário e solte a força dentro da faixa verde.",
      soft_touch: "Ative antes da tacada; o efeito é aplicado automaticamente à bola branca.",
      expanded_vision: "Ative antes de mirar para estender a linha de previsão.",
      stabilizer: "Ative antes da tacada; ele reduz automaticamente o efeito lateral.",
      ghost_ball: "Ative antes de jogar; a primeira bola atingida recebe o efeito fantasma.",
      golden_pocket: "Clique em Usar e depois escolha na mesa a caçapa que dará o bônus.",
      pressure: "Ative no seu turno; a força da próxima tacada do adversário ficará instável.",
      light_magnet: "Clique em Usar e escolha uma caçapa; uma bola próxima será puxada para ela.",
      double_shot: "Ative antes da tacada; se não encaçapar, você ganha uma tentativa extra mais fraca.",
      magnetic_ball: "Clique em Usar e selecione a bola que será atraída pela caçapa mais próxima.",
      rewind: "Use no começo do seu turno para desfazer a última tacada válida do adversário.",
      shield_pocket: "Clique em Usar e escolha uma caçapa; ela bloqueia as bolas do adversário durante o próximo turno dele.",
      ice_zone: "Clique em Usar e marque uma área da mesa; bolas ali deslizam mais por dois turnos.",
      sticky_zone: "Clique em Usar e marque uma área; bolas ali perdem velocidade por dois turnos.",
      position_swap: "Clique em Usar e selecione uma bola para trocar de lugar com a branca.",
      time_freeze: "Ative antes da tacada; após o primeiro contato, mova a mira durante a breve pausa.",
      ghost_hand: "Clique em Usar e escolha uma posição livre para recolocar a bola branca.",
      portal_pocket: "Clique em Usar e selecione duas caçapas para conectá-las durante um turno.",
      explosive_ball: "Clique em Usar e escolha uma bola; ela empurrará as vizinhas quando for atingida."
    };

    const groups = Specials.getCatalog().reduce((result, special) => {
      if (!result[special.rarity]) result[special.rarity] = [];
      result[special.rarity].push(special);
      return result;
    }, {});

    dom.specialGuide.innerHTML = ["common", "uncommon", "rare", "legendary"]
      .map((rarity, index) => {
        const items = groups[rarity] || [];
        const name = Specials.RARITY_NAMES[rarity] || rarity;
        return `
          <details class="specialGuideGroup ${rarity}" ${index === 0 ? "open" : ""}>
            <summary><span>${name}</span><small>${items.length} efeitos</small></summary>
            <div class="specialGuideGrid">
              ${items.map((special) => `
                <article class="guideSpecialCard">
                  <div class="guideSpecialIcon">${ICON_EMOJI[special.icon] || "✦"}</div>
                  <div>
                    <h4>${special.name}</h4>
                    <span class="guideUseType">${getUseTypeLabel(special.useType, special.maxUses, special.cooldownTurns)}</span>
                    <p>${special.description}</p>
                    <small><b>Como usar:</b> ${usage[special.id] || "Ative pelo inventário antes da tacada."}</small>
                  </div>
                </article>
              `).join("")}
            </div>
          </details>
        `;
      }).join("");
  }

  function handleVisibilityChange() {
    if (networkMatch.active || !game.turn || !game.turn.timer) return;

    if (document.hidden) {
      if (
        game.phase === "playing"
        && !game.turn.timer.paused
        && !shotActive
        && !Physics.ballsMoving()
      ) {
        Rules.pauseTurnTimer(game, Date.now());
        focusPause.active = true;
        cancelDrag();
        if (isAITurn()) cancelAITurn();
        setStateLabel("Partida pausada");
      }
      return;
    }

    if (!focusPause.active) return;
    focusPause.active = false;
    Rules.resumeTurnTimer(game, Date.now());
    updateShotTimer();
    setStateLabel(isAITurn() ? "IA retomando…" : "Sua vez");
    showToast("Partida retomada", "info");
  }

  function setMode(mode) {
    if (mode !== "classic" && mode !== "arcane") {
      mode = "classic";
    }

    game.mode = mode;

    if (mode === "arcane") {
      dom.shopButton.classList.remove("hidden");
      dom.inventoryPanel.classList.remove("hidden");
      document.querySelectorAll(".playerArcana").forEach((el) => {
        el.classList.remove("hidden");
      });
    } else {
      dom.shopButton.classList.add("hidden");
      dom.inventoryPanel.classList.add("hidden");
      document.querySelectorAll(".playerArcana").forEach((el) => {
        el.classList.add("hidden");
      });
    }

    updateScoreboard();
    updateInventoryUI();
    updateActiveEffectsUI();
    updateGameMenuSummary();
  }

  function onCanvasPointerMove(e) {
    updateMouse(e);

    if (networkMatch.active && networkMatch.freezeActive && networkMatch.seat === game.currentSeat) {
      const cue = Physics.getCueBall();
      if (cue) {
        networkMatch.freezeAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x);
        const now = performance.now();
        if (now - networkMatch.lastFreezeDirectionAt >= 45) {
          networkMatch.lastFreezeDirectionAt = now;
          networkMatch.sendCommand("set_frozen_direction", { angle: networkMatch.freezeAngle });
        }
      }
      return;
    }

    if (breakPlacement.active) {
      updateOpeningCuePosition();
      return;
    }

    const freeze = Physics.getTimeFreezeState();
    if (freeze && freeze.active) {
      const cue = Physics.getCueBall();
      if (cue) {
        Physics.setFrozenCueDirection(Math.atan2(mouse.y - cue.y, mouse.x - cue.x));
      }
      return;
    }

    if (pendingSpecialTarget) return;

    if (!drag.active && canShoot()) {
      updateAimAngle();
    }

    if (drag.active) {
      updateDragPower();
    }
  }

  function onCanvasPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;

    AudioSys.ensure();

    updateMouse(e);

    if (networkMatch.active && networkMatch.freezeActive && networkMatch.seat === game.currentSeat) {
      networkMatch.sendCommand("release_time_freeze");
      return;
    }

    const freeze = Physics.getTimeFreezeState();
    if (freeze && freeze.active) {
      Physics.releaseTimeFreeze();
      return;
    }

    if (pendingSpecialTarget) {
      selectPendingSpecialTarget();
      return;
    }

    const cue = Physics.getCueBall();
    if (
      canPlaceOpeningCue() &&
      cue &&
      Math.hypot(mouse.x - cue.x, mouse.y - cue.y) <= cue.radius * 2.2
    ) {
      breakPlacement.active = true;
      updateOpeningCuePosition();
      setStateLabel("Posicionando a branca para a saída");
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (!canShoot()) return;
    updateAimAngle();

    drag.active = true;
    drag.startX = mouse.x;
    drag.startY = mouse.y;
    drag.angle = aim.angle;
    drag.power = 0;

    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(e.pointerId);
    }
  }

  function onCanvasPointerUp() {
    if (breakPlacement.active) {
      breakPlacement.active = false;
      updateAimAngle();
      setStateLabel("Branca posicionada — mire para a saída");
      return;
    }

    if (!drag.active) return;

    if (drag.power >= CONFIG.input.minPower) {
      const openingBreak = isOpeningBreak();
      const cue = Physics.getCueBall();
      if (networkMatch.active) {
        const request = networkMatch.sendShot && networkMatch.sendShot({
          direction: {
            x: Math.cos(drag.angle),
            y: Math.sin(drag.angle)
          },
          power: drag.power,
          spin: { ...spin },
          cueY: openingBreak && cue ? cue.y : null
        });

        if (request && request.ok) {
          shotActive = true;
          setStateLabel("Aguardando servidor");
          AudioSys.playShot(drag.power);
        } else {
          setStateLabel("Falha ao enviar tacada");
        }
        cancelDrag();
        return;
      }

      executeLocalShot(drag.angle, drag.power, spin, { openingBreak });
    }

    cancelDrag();
  }

  function onCanvasPointerLeave() {
    mouse.inside = false;

    if (breakPlacement.active) {
      breakPlacement.active = false;
      setStateLabel("Branca posicionada — mire para a saída");
      return;
    }

    if (!drag.active) {
      return;
    }

    cancelDrag();
  }

  function updateMouse(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = view.w / rect.width;
    const scaleY = view.h / rect.height;

    mouse.x = (e.clientX - rect.left) * scaleX - CONFIG.table.rail;
    mouse.y = (e.clientY - rect.top) * scaleY - CONFIG.table.rail;
    mouse.inside = true;
  }

  function updateAimAngle() {
    const cue = Physics.getCueBall();

    if (!cue || !cue.active) return;

    aim.angle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x);
  }

  function updateDragPower() {
    const dist = Math.hypot(mouse.x - drag.startX, mouse.y - drag.startY);
    drag.power = Math.max(0, Math.min(1, dist / CONFIG.input.maxDrag));
  }

  function cancelDrag() {
    drag.active = false;
    drag.power = 0;
  }

  function isOpeningBreak() {
    return Rules.isOpeningBreak(game);
  }

  function canPlaceOpeningCue() {
    return isOpeningBreak() && canShoot();
  }

  function updateOpeningCuePosition() {
    const cue = Physics.getCueBall();
    if (!cue) return false;
    const padding = CONFIG.input.openingBreak.cueVerticalPadding;
    const y = clamp(mouse.y, padding, CONFIG.table.height - padding);
    return Physics.moveCueTo(cue.x, y);
  }

  function canShoot() {
    if (game.phase !== "playing") return false;
    if (shotActive) return false;
    if (pendingSpecialTarget) return false;
    if (networkMatch.active && networkMatch.seat !== game.currentSeat) return false;
    if (isAITurn()) return false;
    const currentPlayer = game.players[game.currentSeat - 1];
    if (currentPlayer.shop.open) return false;
    const cue = Physics.getCueBall();
    return !!cue && cue.active && !Physics.ballsMoving();
  }

  function executeLocalShot(angle, power, shotSpin, options = {}) {
    if (networkMatch.active || game.phase !== "playing" || shotActive || Physics.ballsMoving()) {
      return false;
    }

    currentShotStart = {
      match: JSON.parse(JSON.stringify(game)),
      physics: Physics.getSnapshot(),
      shooterSeat: game.currentSeat
    };
    const idealPower = calculateIdealPower(angle);
    const prepared = Rules.prepareShot(game, power, shotSpin, { idealPower });

    Physics.setShotModifiers({
      softTouch: Boolean(prepared.effects.soft_touch),
      ghostBallArmed: Boolean(prepared.effects.ghost_ball),
      lightMagnetPocketId: prepared.effects.light_magnet
        ? prepared.effects.light_magnet.target.pocketId
        : null,
      magneticBallId: prepared.effects.magnetic_ball
        ? prepared.effects.magnetic_ball.target.ballId
        : null,
      shieldPocketId: prepared.effects.shield_pocket
        ? prepared.effects.shield_pocket.target.pocketId
        : null,
      zones: prepared.effects.table_zones || [],
      timeFreezeArmed: Boolean(prepared.effects.time_freeze),
      portalPocketIds: prepared.effects.portal_pocket
        ? prepared.effects.portal_pocket.target.pocketIds
        : null,
      explosiveBallId: prepared.effects.explosive_ball
        ? prepared.effects.explosive_ball.target.ballId
        : null
    });

    const ok = Physics.shoot(
      angle,
      prepared.power,
      prepared.spin,
      { openingBreak: Boolean(options.openingBreak) }
    );

    if (!ok) {
      Physics.setShotModifiers();
      currentShotStart = null;
      return false;
    }

    if (options.openingBreak) Rules.consumeOpeningBreak(game);
    currentShotEffects = prepared.effects;
    shotActive = true;
    Rules.pauseTurnTimer(game, Date.now());
    setStateLabel("Simulando");
    AudioSys.playShot(prepared.power);
    AudioSys.playArcaneShot(Object.keys(prepared.effects));
    showPreparedShotNotices(prepared.notices);
    updateInventoryUI();
    updateActiveEffectsUI();
    return true;
  }

  function startNewMatch() {
    cancelAITurn();
    focusPause.active = false;
    Rules.resetMatch(game, game.mode, Date.now());
    configureLocalPlayers();

    Physics.reset();
    breakPlacement.active = false;
    shotActive = false;
    currentShotEffects = {};
    pendingSpecialTarget = null;
    softTrailAccumulator = 0;
    magicTrailAccumulator = 0;
    currentShotStart = null;
    lastResolvedShot = null;
    if (currentShotStart) {
      lastResolvedShot = currentShotStart;
      currentShotStart = null;
    }
    dom.targetPrompt.classList.add("hidden");
    cancelDrag();
    clearParticles();
    closeShop();
    trySpawnMagicBall();
    hideGameOver();
    updateScoreboard();
    updateTurnUI();
    updateInventoryUI();
    updateActiveEffectsUI();
    updateMagicBallUI();
    setStateLabel(aiMatch.enabled
      ? "Sua saída — arraste a branca ↕ antes da tacada"
      : "Arraste a branca ↕ antes da saída");
  }

  function applyNetworkMatchSnapshot(snapshot) {
    if (!snapshot) return;

    game.mode = snapshot.mode === "arcane" ? "arcane" : "classic";
    game.phase = snapshot.phase || "playing";
    game.currentSeat = Number(snapshot.currentSeat) || 1;
    game.openingBreakPending = typeof snapshot.openingBreakPending === "boolean"
      ? snapshot.openingBreakPending
      : Boolean(snapshot.turn && snapshot.turn.number === 1 && snapshot.turn.shotNumber === 1);
    game.winnerSeat = snapshot.winnerSeat || null;
    game.gameEndReason = snapshot.gameEndReason || "";
    game.zones = Array.isArray(snapshot.zones)
      ? JSON.parse(JSON.stringify(snapshot.zones))
      : [];
    game.magicBall = snapshot.magicBall
      ? JSON.parse(JSON.stringify(snapshot.magicBall))
      : null;

    if (snapshot.turn) {
      const remainingMs = Math.max(0, Number(snapshot.turn.remainingMs) || 0);
      game.turn = {
        number: snapshot.turn.number,
        seat: snapshot.turn.seat,
        shotNumber: snapshot.turn.shotNumber,
        doubleShotLimited: false,
        timer: {
          durationMs: CONFIG.turn.durationMs,
          remainingMs,
          deadlineAt: Date.now() + remainingMs,
          paused: false
        }
      };
    }

    for (const source of snapshot.players || []) {
      const player = game.players[source.seat - 1];
      if (!player) continue;
      player.name = source.name;
      player.score = source.score;
      player.arcanaPoints = Number(source.arcanaPoints) || 0;
      player.shop.open = Boolean(source.shopOpen);
      for (const publicDefId of ["pressure", "double_shot"]) {
        if (!(source.visibleEffects || []).includes(publicDefId)) {
          delete player.activeEffects[publicDefId];
        }
      }
      for (const defId of source.visibleEffects || []) {
        if (player.activeEffects[defId]) continue;
        const definition = Specials.getById(defId);
        if (definition) {
          player.activeEffects[defId] = {
            defId,
            name: definition.name,
            icon: definition.icon,
            sourceSeat: null,
            target: null
          };
        }
      }
    }

    syncNetworkModeUI();
    updateScoreboard();
    updateTurnUI();
    updateMagicBallUI();
  }

  function getHudPlayer() {
    const seat = networkMatch.active
      ? networkMatch.seat
      : (aiMatch.enabled ? 1 : game.currentSeat);
    return game.players.find((player) => player.seat === seat) || game.players[0];
  }

  function syncNetworkModeUI() {
    if (!networkMatch.active) return;
    const arcane = game.mode === "arcane";
    dom.modeSelect.value = game.mode;
    dom.shopButton.classList.toggle("hidden", !arcane);
    dom.inventoryPanel.classList.toggle("hidden", !arcane);
    document.querySelectorAll(".playerArcana").forEach((element) => {
      element.classList.toggle("hidden", !arcane);
    });
    updateInventoryUI();
    updateActiveEffectsUI();
    updateGameMenuSummary();
  }

  function setOpponent(value) {
    const match = /^ai_(easy|normal|hard)$/.exec(String(value || ""));
    aiMatch.enabled = Boolean(match);
    aiMatch.difficulty = match ? ArcaneAI.normalizeDifficulty(match[1]) : "normal";
    dom.opponentSelect.value = aiMatch.enabled
      ? `ai_${aiMatch.difficulty}`
      : "local";
    cancelAITurn();
    updateGameMenuSummary();
  }

  function configureLocalPlayers() {
    const first = game.players[0];
    const second = game.players[1];
    if (first) first.name = aiMatch.enabled ? "Você" : "Jogador 1";
    if (second) {
      const difficulty = ArcaneAI.DIFFICULTIES[aiMatch.difficulty];
      second.name = aiMatch.enabled
        ? `Arcana IA · ${difficulty.label}`
        : "Jogador 2";
    }
  }

  function isAITurn() {
    return Boolean(
      aiMatch.enabled
      && !networkMatch.active
      && game.phase === "playing"
      && game.currentSeat === aiMatch.seat
    );
  }

  function cancelAITurn() {
    if (aiMatch.timer) clearTimeout(aiMatch.timer);
    aiMatch.timer = null;
    aiMatch.turnToken = null;
    aiMatch.thinking = false;
    aiMatch.lastPlan = null;
    document.body.classList.remove("ai-thinking");
  }

  function setNetworkPhysicsSnapshot(snapshot, moving) {
    if (!Array.isArray(snapshot)) return;

    const localBalls = Physics.getBalls();
    const localIds = new Set(localBalls.map((ball) => ball.id));
    const sameStructure = localBalls.length === snapshot.length && snapshot.every(
      (source) => localIds.has(Number(source.id))
    );

    if (!moving || !sameStructure) {
      Physics.loadSnapshot(snapshot);
      networkPhysicsTarget = null;
      return;
    }

    const targets = new Map(snapshot.map((source) => [Number(source.id), source]));
    for (const ball of localBalls) {
      const source = targets.get(ball.id);
      if (!source) continue;

      const sourceActive = source.active !== false;
      if (ball.active !== sourceActive) {
        ball.x = Number(source.x);
        ball.y = Number(source.y);
      }
      ball.active = sourceActive;
      ball.pocketed = source.pocketed === true;
      ball.vx = Number(source.vx) || 0;
      ball.vy = Number(source.vy) || 0;
      ball.spinX = Number(source.spinX) || 0;
      ball.spinY = Number(source.spinY) || 0;
    }

    networkPhysicsTarget = {
      receivedAt: performance.now(),
      balls: targets
    };
  }

  function updateNetworkPhysics(dt) {
    if (!networkMatch.active || !shotActive || !networkPhysicsTarget) return;

    const elapsed = Math.min(0.045, (performance.now() - networkPhysicsTarget.receivedAt) / 1000);
    const blend = 1 - Math.exp(-28 * dt);

    for (const ball of Physics.getBalls()) {
      const target = networkPhysicsTarget.balls.get(ball.id);
      if (!target || !ball.active || target.active === false) continue;

      const targetX = Number(target.x) + (Number(target.vx) || 0) * elapsed;
      const targetY = Number(target.y) + (Number(target.vy) || 0) * elapsed;
      const distance = Math.hypot(targetX - ball.x, targetY - ball.y);

      ball.prevX = ball.x;
      ball.prevY = ball.y;
      if (distance > 90) {
        ball.x = targetX;
        ball.y = targetY;
      } else {
        ball.x += (targetX - ball.x) * blend;
        ball.y += (targetY - ball.y) * blend;
      }
      ball.rotation += ((Number(target.rotation) || 0) - ball.rotation) * blend;
    }
  }

  function enterMultiplayer(options) {
    cancelAITurn();
    focusPause.active = false;
    aiMatch.enabled = false;
    dom.opponentSelect.value = "local";
    updateGameMenuSummary();
    networkMatch.active = true;
    networkMatch.seat = Number(options.seat) || null;
    networkMatch.roomCode = options.roomCode || null;
    networkMatch.sendShot = options.sendShot;
    networkMatch.sendCommand = options.sendCommand;
    networkMatch.freezeActive = false;
    networkMatch.freezeAngle = 0;
    networkMatch.lastFreezeDirectionAt = 0;
    networkMatch.requestRematch = options.requestRematch;
    networkMatch.leave = options.leave;
    networkPhysicsTarget = null;

    document.body.classList.add("network-match");
    dom.modeSelect.disabled = true;
    dom.opponentSelect.disabled = true;
    dom.resetButton.textContent = "Sair da sala";
    dom.gameOverExitButton.classList.remove("hidden");
    dom.gameOverRematchStatus.classList.add("hidden");
    dom.gameOverButton.disabled = false;
    hideGameOver();
    cancelDrag();
    clearParticles();
    currentShotEffects = {};
    pendingSpecialTarget = null;
    shotActive = Boolean(options.moving);

    applyNetworkMatchSnapshot(options.match);
    if (options.privatePlayer) applyMultiplayerPrivateState(options.privatePlayer);
    if (Array.isArray(options.physics)) Physics.loadSnapshot(options.physics);
    setStateLabel(
      networkMatch.seat === game.currentSeat
        ? (isOpeningBreak() ? "Arraste a branca ↕ antes da saída" : "Sua vez online")
        : "Vez do adversário"
    );
  }

  function applyMultiplayerPhysics(payload) {
    if (!networkMatch.active || !payload) return;
    if (Array.isArray(payload.physics)) {
      setNetworkPhysicsSnapshot(payload.physics, Boolean(payload.moving));
    }
    if (payload.match) applyNetworkMatchSnapshot(payload.match);
    if (payload.privatePlayer) applyMultiplayerPrivateState(payload.privatePlayer);
    shotActive = Boolean(payload.moving);
    if (shotActive) setStateLabel("Tacada em andamento");
  }

  function applyMultiplayerPlayers(payload) {
    if (!networkMatch.active || !payload || !Array.isArray(payload.players)) return;
    for (const source of payload.players) {
      const player = game.players.find((item) => item.seat === Number(source.seat));
      if (!player) continue;
      if (typeof source.name === "string") player.name = source.name;
      if (Number.isFinite(Number(source.score))) player.score = Number(source.score);
      if (Number.isFinite(Number(source.arcanaPoints))) {
        player.arcanaPoints = Number(source.arcanaPoints);
      }
      if (typeof source.shopOpen === "boolean") player.shop.open = source.shopOpen;
    }
    updateScoreboard();
    updateInventoryUI();
    if (getHudPlayer().shop.open) renderShop();
  }

  function applyMultiplayerPrivateState(payload) {
    if (!networkMatch.active || !payload) return;
    const privatePlayer = payload.privatePlayer || payload;
    const player = game.players.find((item) => item.seat === Number(privatePlayer.seat));
    if (!player || player.seat !== networkMatch.seat) return;

    player.arcanaPoints = Number(privatePlayer.arcanaPoints) || 0;
    player.inventory = Array.isArray(privatePlayer.inventory)
      ? JSON.parse(JSON.stringify(privatePlayer.inventory))
      : player.inventory;
    player.shop.offers = Array.isArray(privatePlayer.shopOffers)
      ? JSON.parse(JSON.stringify(privatePlayer.shopOffers))
      : player.shop.offers;
    player.shop.open = Boolean(privatePlayer.shopOpen);
    player.boughtHistory = privatePlayer.boughtHistory
      ? Object.assign({}, privatePlayer.boughtHistory)
      : player.boughtHistory;
    player.activeEffects = privatePlayer.activeEffects
      ? JSON.parse(JSON.stringify(privatePlayer.activeEffects))
      : player.activeEffects;
    player.legendaryPurchased = Boolean(privatePlayer.legendaryPurchased);

    updateScoreboard();
    updateInventoryUI();
    updateActiveEffectsUI();
    if (player.shop.open) renderShop();
  }

  function applyMultiplayerShopOpened(payload) {
    if (!networkMatch.active || !payload) return;
    const player = game.players.find((item) => item.seat === Number(payload.seat));
    if (!player) return;
    player.shop.open = true;
    if (game.turn && game.turn.timer) {
      game.turn.timer.remainingMs = Math.max(0, Number(payload.remainingMs) || 0);
      game.turn.timer.deadlineAt = null;
      game.turn.timer.paused = true;
    }
    if (player.seat !== networkMatch.seat) {
      setStateLabel(`${player.name} está na Loja Arcana`);
    }
  }

  function applyMultiplayerShopClosed(payload) {
    if (!networkMatch.active || !payload) return;
    const player = game.players.find((item) => item.seat === Number(payload.seat));
    if (player) player.shop.open = false;
    if (game.turn && game.turn.timer) {
      const remainingMs = Math.max(0, Number(payload.remainingMs) || game.turn.timer.remainingMs || 0);
      game.turn.timer.remainingMs = remainingMs;
      game.turn.timer.deadlineAt = Date.now() + remainingMs;
      game.turn.timer.paused = false;
    }
    if (Number(payload.seat) === networkMatch.seat) {
      dom.shopOverlay.classList.add("hidden");
    }
    updateInventoryUI();
    setStateLabel(networkMatch.seat === game.currentSeat ? "Sua vez online" : "Vez do adversário");
  }

  function applyMultiplayerShopState(payload) {
    if (!networkMatch.active) return;
    applyMultiplayerPrivateState(payload);
    dom.shopOverlay.classList.remove("hidden");
    AudioSys.playShopOpen();
    renderShop();
    setStateLabel("Loja aberta");
    window.setTimeout(() => dom.shopCloseButton.focus(), 0);
  }

  function applyMultiplayerShopRerolled(payload) {
    if (!networkMatch.active || !payload) return;
    applyMultiplayerPrivateState(payload);
    AudioSys.playReroll();
    showToast(`Loja rolada por ${Number(payload.cost) || CONFIG.arcane.rerollCost} ✦`, "info");
    renderShop();
  }

  function applyMultiplayerSpecialBought(payload) {
    if (!networkMatch.active || !payload) return;
    applyMultiplayerPrivateState(payload);
    AudioSys.playBuy();
    showToast(`${payload.instance ? payload.instance.name : "Especial"} comprado!`, "success");
    renderShop();
  }

  function applyMultiplayerSpecialDiscarded(payload) {
    if (!networkMatch.active || !payload) return;
    applyMultiplayerPrivateState(payload);
    AudioSys.playDiscard();
    showToast(`${payload.name || "Especial"} descartado`, "info");
    if (getHudPlayer().shop.open) renderShop();
  }

  function applyMultiplayerSpecialUsed(payload) {
    if (!networkMatch.active || !payload) return;
    applyMultiplayerPrivateState(payload);
    updateInventoryUI();
    updateActiveEffectsUI();
  }

  function applyMultiplayerSpecialEffectStarted(payload) {
    if (!networkMatch.active || !payload || !payload.effect) return;
    if (payload.match) applyNetworkMatchSnapshot(payload.match);
    if (Array.isArray(payload.physics)) setNetworkPhysicsSnapshot(payload.physics, false);

    const effect = payload.effect;
    const appliedPlayer = game.players.find((player) => player.seat === Number(payload.appliedToSeat));
    if (appliedPlayer && !payload.immediate && !["ice_zone", "sticky_zone"].includes(effect.defId)) {
      appliedPlayer.activeEffects[effect.defId] = JSON.parse(JSON.stringify(effect));
    }

    AudioSys.playArcaneEffect(effect.defId);
    const suffix = effect.defId === "pressure"
      ? ` — ${appliedPlayer ? appliedPlayer.name : "adversário"} está sob pressão`
      : (["ice_zone", "sticky_zone"].includes(effect.defId) ? " — zona criada" :
        (effect.defId === "rewind" ? " — jogada desfeita" : " — efeito armado"));
    showToast(`${effect.name}${suffix}`, "arcana");
    updateInventoryUI();
    updateActiveEffectsUI();
    if (payload.immediate) setStateLabel(effect.defId === "rewind" ? "Jogada rebobinada" : "Mesa alterada");
  }

  function applyMultiplayerSpecialEffectFinished(payload) {
    if (!networkMatch.active || !payload || !payload.defId) return;
    for (const player of game.players) delete player.activeEffects[payload.defId];
    updateActiveEffectsUI();
  }

  function applyMultiplayerSpecialPhysicsEvent(payload) {
    if (!networkMatch.active || !payload) return;
    const eventType = payload.eventType;
    if (eventType === "time_freeze_started") {
      networkMatch.freezeActive = Number(payload.shooterSeat) === networkMatch.seat;
      const cue = Physics.getCueBall();
      networkMatch.freezeAngle = cue ? Math.atan2(cue.vy, cue.vx) : aim.angle;
    } else if (eventType === "time_freeze_finished") {
      networkMatch.freezeActive = false;
    }
    onSpecialPhysicsEvent(eventType, payload.detail || {});
  }

  function applyMultiplayerArcaneEvent(eventType, payload) {
    if (!networkMatch.active || !payload) return;
    if (eventType === "arcane_ball_spawned") {
      game.magicBall = JSON.parse(JSON.stringify(payload));
      const ball = Physics.getMagicBall() || Physics.addMagicBall(payload);
      if (ball) spawnParticles(ball.x, ball.y, ball.color, 44, 180);
      const rarityName = Specials.RARITY_NAMES[payload.rarity] || payload.rarity;
      showToast(`Uma Bola Mágica ${rarityName} surgiu!`, "arcana");
      AudioSys.playArcaneEffect("arcane_ball_spawned");
    } else if (eventType === "arcane_ball_touched") {
      if (game.magicBall) game.magicBall.touched = true;
      const ball = Physics.getMagicBall();
      if (ball) spawnParticles(ball.x, ball.y, ball.color, 38, 230);
      showToast(`${game.players[Number(payload.seat) - 1].name}: +${payload.arcanaGranted} ✦ pela Bola Mágica`, "arcana");
      AudioSys.playArcaneEffect("magic_ball_touch");
    } else if (eventType === "arcane_ball_potted") {
      Physics.removeMagicBall(payload.id);
      game.magicBall = null;
      AudioSys.playArcaneEffect("arcane_ball_potted");
    } else if (eventType === "arcane_ball_expired") {
      Physics.removeMagicBall(payload.id);
      game.magicBall = null;
      showToast("A Bola Mágica expirou", "info");
      AudioSys.playArcaneEffect("arcane_ball_expired");
    } else if (eventType === "arcane_reward_granted") {
      showToast(`${payload.reward.name} recebido por ${game.players[Number(payload.seat) - 1].name}!`, "success");
      AudioSys.playArcaneEffect("magic_reward");
    } else if (eventType === "arcane_reward_converted") {
      showToast(`${payload.reward.name} convertido em ${payload.arcanaGranted} ✦`, "arcana");
      AudioSys.playArcanaGain();
    }
    updateMagicBallUI();
    updateScoreboard();
    updateInventoryUI();
  }

  function applyMultiplayerShotAccepted(payload = {}) {
    if (!networkMatch.active) return;
    if (payload.openingBreak) game.openingBreakPending = false;
    shotActive = true;
    currentShotEffects = payload.effects ? JSON.parse(JSON.stringify(payload.effects)) : {};
    networkMatch.freezeActive = false;
    AudioSys.playArcaneShot(payload.effectIds || []);
    showPreparedShotNotices(payload.notices || []);
    updateInventoryUI();
    updateActiveEffectsUI();
    setStateLabel("Tacada em andamento");
  }

  function setMultiplayerShotActive(active) {
    if (!networkMatch.active) return;
    shotActive = Boolean(active);
    if (shotActive) setStateLabel("Tacada em andamento");
  }

  function applyMultiplayerTurn(payload) {
    if (!networkMatch.active || !payload) return;
    if (payload.match) applyNetworkMatchSnapshot(payload.match);
    shotActive = false;
    networkMatch.freezeActive = false;
    cancelDrag();
    updateInventoryUI();
    if (payload.reason === "timeout") {
      showToast("Tempo esgotado: turno alterado pelo servidor", "error");
    }
    setStateLabel(
      networkMatch.seat === game.currentSeat
        ? (isOpeningBreak() ? "Arraste a branca ↕ antes da saída" : "Sua vez online")
        : "Vez do adversário"
    );
  }

  function applyMultiplayerShotResult(payload) {
    if (!networkMatch.active || !payload) return;
    if (Array.isArray(payload.physics)) setNetworkPhysicsSnapshot(payload.physics, false);
    if (payload.match) applyNetworkMatchSnapshot(payload.match);
    shotActive = false;

    const outcome = payload.outcome || {};
    for (const scoreEvent of outcome.scoreEvents || []) {
      showToast(
        `Bola ${scoreEvent.ballNumber}: +${scoreEvent.points} (${scoreEvent.type})`,
        "success"
      );
    }
    if (outcome.scoreEvents && outcome.scoreEvents.length > 0) AudioSys.playScore();
    if (outcome.foul) {
      showToast(`Falta: ${outcome.foulReason}`, "error");
      AudioSys.playFoul();
    }
    for (const arcanaEvent of outcome.arcanaEvents || []) {
      const owner = game.players[Number(arcanaEvent.seat) - 1];
      showToast(`${owner.name}: +${arcanaEvent.amount} ✦ — ${arcanaEvent.reason}`, "arcana");
    }
    if ((outcome.arcanaEvents || []).length > 0) AudioSys.playArcanaGain();
    if (outcome.doubleShotGranted) {
      showToast("Tacada Dupla ativada: jogue novamente!", "arcana");
      AudioSys.playArcaneEffect("double_shot");
    }
    currentShotEffects = {};
    networkMatch.freezeActive = false;
  }

  function finishMultiplayer(payload) {
    if (!networkMatch.active || !payload) return;
    if (Array.isArray(payload.physics)) setNetworkPhysicsSnapshot(payload.physics, false);
    if (payload.match) applyNetworkMatchSnapshot(payload.match);
    shotActive = false;

    const winner = game.players.find((player) => player.seat === payload.winnerSeat);
    const loser = game.players.find((player) => player.seat !== payload.winnerSeat);
    if (winner && loser) {
      AudioSys.playWin();
      showGameOver(winner, loser, payload.reason || game.gameEndReason);
      const lost = networkMatch.seat !== payload.winnerSeat;
      dom.gameOverButton.textContent = lost ? "Pedir revanche" : "Aguardando revanche";
      dom.gameOverButton.disabled = !lost;
      dom.gameOverExitButton.classList.remove("hidden");
      dom.gameOverRematchStatus.textContent = lost
        ? "A revanche começa quando o adversário aceitar."
        : "O adversário pode pedir uma revanche.";
      dom.gameOverRematchStatus.classList.remove("hidden");
    }
  }

  function applyMultiplayerRematchState(payload) {
    if (!networkMatch.active || !payload) return;
    const acceptedSeats = Array.isArray(payload.acceptedSeats) ? payload.acceptedSeats : [];
    const localAccepted = acceptedSeats.includes(networkMatch.seat);
    const requester = game.players.find((player) => player.seat === payload.requestedBySeat);

    dom.gameOverButton.disabled = localAccepted;
    dom.gameOverButton.textContent = localAccepted ? "Aguardando adversário…" : "Aceitar revanche";
    dom.gameOverRematchStatus.textContent = requester
      ? `${requester.name} pediu revanche — falta a confirmação do outro jogador.`
      : "Aguardando confirmação para a revanche.";
    dom.gameOverRematchStatus.classList.remove("hidden");
  }

  function leaveMultiplayer() {
    networkMatch.active = false;
    networkMatch.seat = null;
    networkMatch.roomCode = null;
    networkMatch.sendShot = null;
    networkMatch.sendCommand = null;
    networkMatch.freezeActive = false;
    networkMatch.freezeAngle = 0;
    networkMatch.lastFreezeDirectionAt = 0;
    networkMatch.requestRematch = null;
    networkMatch.leave = null;
    networkPhysicsTarget = null;
    document.body.classList.remove("network-match");
    dom.modeSelect.disabled = false;
    dom.opponentSelect.disabled = false;
    dom.modeSelect.value = "classic";
    dom.resetButton.textContent = "Nova partida";
    dom.gameOverButton.textContent = "Nova partida";
    dom.gameOverButton.disabled = false;
    dom.gameOverExitButton.classList.add("hidden");
    dom.gameOverRematchStatus.classList.add("hidden");
    setMode("classic");
    startNewMatch();
  }

  function calculateIdealPower(angle) {
    const impact = Physics.raycastAim(angle, 1600);
    const settings = CONFIG.arcane.specialEffects.perfectForce;

    if (!impact || !impact.ball) {
      return 0.56;
    }

    let pocketDistance = Infinity;
    for (const pocket of Physics.getPockets()) {
      pocketDistance = Math.min(
        pocketDistance,
        Math.hypot(impact.ball.x - pocket.x, impact.ball.y - pocket.y)
      );
    }

    const travel = impact.t + pocketDistance;
    return clamp(0.26 + travel / 1900 * 0.58, settings.minPower, settings.maxPower);
  }

  function showPreparedShotNotices(notices) {
    for (const notice of notices) {
      if (notice.type === "perfect_force") {
        showToast("Força Perfeita ajustada!", "arcana");
        const cue = Physics.getCueBall();
        if (cue) spawnParticles(cue.x, cue.y, "#f4d06f", 22, 145);
      } else if (notice.type === "pressure") {
        const pct = Math.round(Math.abs(notice.variation) * 100);
        showToast(`Pressão alterou a força em ${notice.variation >= 0 ? "+" : "-"}${pct}%`, "error");
      } else if (notice.type === "double_shot_limit") {
        showToast("Tacada extra: força limitada a 70%", "info");
      }
    }
  }

  function resetSpinUI() {
    spin.x = 0;
    spin.y = 0;

    const rect = dom.spinBall.getBoundingClientRect();
    const fallbackSize = window.matchMedia("(max-width: 600px)").matches ? 78 : 94;
    const size = rect.width || fallbackSize;
    const cx = size / 2;
    const cy = size / 2;

    dom.spinDot.style.left = `${cx - 8}px`;
    dom.spinDot.style.top = `${cy - 8}px`;
    dom.spinInfo.textContent = "Efeito: 0.00, 0.00";
  }

  function updateSpinFromPointer(e) {
    const rect = dom.spinBall.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    let dx = e.clientX - rect.left - cx;
    let dy = e.clientY - rect.top - cy;

    const max = rect.width / 2 - 10;
    const len = Math.hypot(dx, dy);

    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }

    dom.spinDot.style.left = `${cx + dx - 8}px`;
    dom.spinDot.style.top = `${cy + dy - 8}px`;

    spin.x = clamp(dx / max, -1, 1);
    spin.y = clamp(-dy / max, -1, 1);

    dom.spinInfo.textContent = `Efeito: ${spin.x.toFixed(2)}, ${spin.y.toFixed(2)}`;
  }

  function frame(now) {
    const frameDt = Math.min((now - lastTime) / 1000, CONFIG.physics.maxFrameDt);
    lastTime = now;

    accumulator += frameDt;

    if (networkMatch.active) {
      accumulator = 0;
      updateNetworkPhysics(frameDt);
    } else {
      while (accumulator >= CONFIG.physics.fixedDt) {
        Physics.step(CONFIG.physics.fixedDt);
        accumulator -= CONFIG.physics.fixedDt;
      }
    }

    updateGame(frameDt);
    render();

    requestAnimationFrame(frame);
  }

  function updateGame(dt) {
    if (shotActive && currentShotEffects.soft_touch) {
      softTrailAccumulator += dt;
      if (softTrailAccumulator >= 0.045) {
        softTrailAccumulator = 0;
        const cue = Physics.getCueBall();
        if (cue && cue.active && Math.hypot(cue.vx, cue.vy) > 20) {
          spawnParticles(cue.x, cue.y, "#b9f5ff", 2, 24);
        }
      }
    }

    const magicBall = Physics.getMagicBall();
    if (magicBall && game.mode === "arcane") {
      magicTrailAccumulator += dt;
      if (magicTrailAccumulator >= 0.075) {
        magicTrailAccumulator = 0;
        spawnParticles(magicBall.x, magicBall.y, magicBall.color, 1, 22);
      }
    } else {
      magicTrailAccumulator = 0;
    }

    if (!networkMatch.active && shotActive && !Physics.ballsMoving()) {
      shotActive = false;
      resolveShot();
    }

    if (messageUntil && performance.now() > messageUntil && !shotActive) {
      setStateLabel(game.phase === "playing" ? "Sua vez" : "");
      messageUntil = 0;
    }

    updateParticles(dt);
    updateForceUI();
    updateShotTimer();
    maybeScheduleAITurn();
  }

  function maybeScheduleAITurn() {
    if (!isAITurn()) {
      if (aiMatch.timer) clearTimeout(aiMatch.timer);
      aiMatch.timer = null;
      aiMatch.turnToken = null;
      aiMatch.thinking = false;
      document.body.classList.remove("ai-thinking");
      return;
    }

    if (
      shotActive || Physics.ballsMoving() || pendingSpecialTarget
      || game.players[aiMatch.seat - 1].shop.open
    ) return;

    const token = `${game.turn ? game.turn.number : 0}:${game.turn ? game.turn.shotNumber : 0}`;
    if (aiMatch.turnToken === token) return;
    aiMatch.turnToken = token;
    aiMatch.thinking = true;
    document.body.classList.add("ai-thinking");
    setStateLabel("IA analisando a mesa…");

    const settings = ArcaneAI.DIFFICULTIES[aiMatch.difficulty];
    aiMatch.timer = setTimeout(() => {
      aiMatch.timer = null;
      runAITurn(token);
    }, settings.thinkMs);
  }

  function runAITurn(token) {
    if (!isAITurn() || aiMatch.turnToken !== token || shotActive || Physics.ballsMoving()) {
      cancelAITurn();
      return;
    }

    const world = {
      balls: Physics.getSnapshot(),
      pockets: Physics.getPockets().map((pocket) => ({ ...pocket }))
    };
    let plan = ArcaneAI.planShot(world, {
      difficulty: aiMatch.difficulty,
      openingBreak: isOpeningBreak()
    });

    if (!plan) {
      aiMatch.thinking = false;
      document.body.classList.remove("ai-thinking");
      setStateLabel("IA sem tacada disponível");
      return;
    }

    if (game.mode === "arcane") {
      prepareAIArcaneTurn(plan, world);
      plan = ArcaneAI.planShot({
        balls: Physics.getSnapshot(),
        pockets: world.pockets
      }, {
        difficulty: aiMatch.difficulty,
        openingBreak: isOpeningBreak()
      }) || plan;
      const aiPlayer = game.players[aiMatch.seat - 1];
      if (aiPlayer.activeEffects.perfect_force) {
        plan.power = calculateIdealPower(plan.angle);
      }
    }

    aiMatch.lastPlan = plan;
    aiMatch.thinking = false;
    document.body.classList.remove("ai-thinking");
    aim.angle = plan.angle;
    setStateLabel(plan.type === "pot" ? "IA tenta a caçapa" : "IA joga com segurança");
    executeLocalShot(plan.angle, plan.power, plan.spin, {
      openingBreak: isOpeningBreak()
    });
  }

  function prepareAIArcaneTurn(plan, world) {
    const player = game.players[aiMatch.seat - 1];
    const offer = ArcaneAI.chooseOffer(player);
    if (offer) {
      Rules.openShop(game, Date.now());
      const purchase = Rules.buySpecial(game, offer.offerId);
      Rules.closeShop(game, Date.now());
      if (purchase.ok) {
        showToast(`${player.name} comprou ${purchase.instance.name}`, "arcana");
        AudioSys.playBuy();
      }
    }

    const special = ArcaneAI.chooseSpecial(player, plan, world, {
      difficulty: aiMatch.difficulty
    });
    if (special) activateSpecial(special.slotIndex, special.target);
    updateScoreboard();
    updateInventoryUI();
    updateActiveEffectsUI();
    updateGameMenuSummary();
  }

  function updateShotTimer() {
    const remainingMs = Rules.getTurnRemainingMs(game, Date.now());
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    dom.shotTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    dom.shotTimer.classList.toggle("warning", remainingMs <= CONFIG.turn.warningMs);
    updateCountdownSound(totalSeconds, remainingMs);

    if (networkMatch.active) return;

    const currentPlayer = game.players[game.currentSeat - 1];
    if (
      !shotActive &&
      !Physics.ballsMoving() &&
      !currentPlayer.shop.open &&
      Rules.isTurnExpired(game, Date.now())
    ) {
      const result = Rules.timeoutTurn(game, Date.now());
      if (result.ok) {
        AudioSys.playTurnChange();
        showToast(`Tempo esgotado. Vez de Jogador ${result.nextSeat}`, "error");
        cancelDrag();
        updateScoreboard();
        updateTurnUI();
        updateInventoryUI();
        processArcaneEvents();
        trySpawnMagicBall();
      }
    }
  }

  function updateForceUI() {
    const power = drag.active ? drag.power : 0;
    const pct = Math.round(power * 100);
    const effects = Rules.getActiveEffects(game);
    const hasPerfectForce = Boolean(effects.perfect_force) && canShoot();

    dom.forceFill.style.width = `${pct}%`;
    dom.forceText.textContent = `Força: ${pct}%`;

    if (hasPerfectForce) {
      const ideal = calculateIdealPower(drag.active ? drag.angle : aim.angle);
      const half = CONFIG.arcane.specialEffects.perfectForce.zoneHalfWidth;
      dom.forcePanel.classList.add("perfect-force-active");
      dom.forceIdealZone.style.left = `${Math.max(0, ideal - half) * 100}%`;
      dom.forceIdealZone.style.width = `${Math.min(1, half * 2) * 100}%`;
    } else {
      dom.forcePanel.classList.remove("perfect-force-active");
    }
  }

  function setStateLabel(text) {
    dom.stateLabel.textContent = text;
  }

  function onBallCollision(a, b, strength) {
    if (strength < 25) return;

    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;

    spawnParticles(
      x,
      y,
      "#ffffff",
      Math.min(16, Math.floor(strength / 80) + 3),
      Math.min(280, strength * 0.55)
    );

    const now = performance.now();

    if (now - lastBallSoundAt > 45) {
      AudioSys.playCollision(strength);
      lastBallSoundAt = now;
    }
  }

  function onCushion(ball, strength) {
    if (strength < 35) return;

    spawnParticles(ball.x, ball.y, "#a7ffd2", 4, 95);

    const now = performance.now();

    if (now - lastCushionSoundAt > 70) {
      AudioSys.playCushion(strength);
      lastCushionSoundAt = now;
    }
  }

  function onPocket(ball, pocket) {
    spawnParticles(
      pocket.x,
      pocket.y,
      ball.kind === "cue" ? "#ffffff" : ball.color,
      ball.kind === "magic" ? 52 : 26,
      ball.kind === "magic" ? 320 : 230
    );

    AudioSys.playPocket();
    AudioSys.playBallReturn(ball.kind);
  }

  function updateCountdownSound(totalSeconds, remainingMs) {
    const turnToken = game.turn
      ? `${game.currentSeat}:${game.turn.number}:${game.turn.shotNumber}`
      : "";

    if (turnToken !== countdownTurnToken) {
      countdownTurnToken = turnToken;
      lastCountdownSecond = null;
    }

    const warningSeconds = Math.ceil(CONFIG.turn.warningMs / 1000);
    if (remainingMs > CONFIG.turn.warningMs || totalSeconds <= 0) {
      lastCountdownSecond = null;
      return;
    }

    const timerPaused = Boolean(game.turn && game.turn.timer && game.turn.timer.paused);
    const currentPlayer = game.players[game.currentSeat - 1];
    const shouldAlert = AudioSys.isEnabled()
      && !document.hidden
      && !timerPaused
      && !shotActive
      && !Physics.ballsMoving()
      && !(currentPlayer && currentPlayer.shop.open)
      && !isAITurn()
      && (!networkMatch.active || networkMatch.seat === game.currentSeat);

    if (
      shouldAlert
      && totalSeconds <= warningSeconds
      && totalSeconds !== lastCountdownSecond
    ) {
      lastCountdownSecond = totalSeconds;
      AudioSys.playCountdownTick(totalSeconds);
    }
  }

  function onShot() {}

  function onShotStarted() {}

  function onFirstContact() {}

  function onSpecialPhysicsEvent(type, detail) {
    if (type === "ghost_pass" && detail.ball) {
      spawnParticles(detail.ball.x, detail.ball.y, "#ba8cff", 28, 190);
    } else if (type === "shield_block" && detail.pocket) {
      spawnParticles(detail.pocket.x, detail.pocket.y, "#77d7ff", 34, 210);
      showToast("Escudo de Caçapa bloqueou a bola!", "info");
    } else if (type === "portal" && detail.exit) {
      spawnParticles(detail.pocket.x, detail.pocket.y, "#b36cff", 26, 180);
      spawnParticles(detail.exit.x, detail.exit.y, "#6edcff", 30, 210);
    } else if (type === "explosion" && detail.ball) {
      spawnParticles(detail.ball.x, detail.ball.y, "#ff714f", 70, 430);
      showToast("Bola Explosiva detonada!", "error");
    } else if (type === "time_freeze_started") {
      showToast("Tempo Congelado: mova a mira e clique para liberar", "arcana");
      setStateLabel("Tempo congelado");
    } else if (type === "time_freeze_finished") {
      showToast("O tempo voltou a correr", "info");
      setStateLabel("Simulando");
    } else if (type === "magic_ball_touch" && detail.ball) {
      spawnParticles(detail.ball.x, detail.ball.y, detail.ball.color, 38, 230);
      showToast("Bola Mágica tocada: +1 ✦ ao fim da tacada", "arcana");
    } else {
      return;
    }
    AudioSys.playArcaneEffect(type);
  }

  function resolveShot() {
    const shotState = Physics.consumeShotState();

    if (!shotState) {
      setStateLabel("Sua vez");
      return;
    }

    const remainingObjectBalls = Physics.getActiveObjectBalls().filter(
      (ball) => ball.kind === "object" && ball.number !== 8
    );
    const hasClearShot = Physics.hasClearShot(CONFIG.arcane.defense.clearancePadding);

    const outcome = Rules.resolveShot(game, shotState, {
      remainingObjectBalls: remainingObjectBalls.length,
      hasClearShot,
      shotEffects: currentShotEffects,
      now: Date.now()
    });

    processArcaneEvents();

    currentShotEffects = {};
    softTrailAccumulator = 0;

    for (const scoreEvent of outcome.scoreEvents) {
      showToast(
        `Bola ${scoreEvent.ballNumber}: +${scoreEvent.points} (${scoreEvent.type})`,
        "success"
      );
      AudioSys.playScore();
    }

    if (outcome.arcanaEvents.length > 0) {
      for (const arcanaEvent of outcome.arcanaEvents) {
        const owner = game.players[arcanaEvent.seat - 1];
        showToast(
          `${owner.name}: +${arcanaEvent.amount} ✦ — ${arcanaEvent.reason}`,
          "arcana"
        );
      }
      AudioSys.playArcanaGain();
    }

    if (outcome.foul) {
      showToast(`Falta: ${outcome.foulReason}`, "error");
      AudioSys.playFoul();
      setStateLabel("Falta");
      messageUntil = performance.now() + 2400;
    }

    if (shotState.cuePocketed) {
      Physics.respawnCue();
    }

    if (outcome.gameOver) {
      endGame(outcome.winnerSeat, outcome.gameEndReason);
      return;
    }

    if (outcome.doubleShotGranted) {
      AudioSys.playArcaneEffect("double_shot");
      showToast("Tacada Dupla ativada: jogue novamente!", "arcana");
      setStateLabel("Tacada extra");
      messageUntil = performance.now() + 1800;
    }

    if (outcome.doubleShotGranted) {
      // O feedback específico da tacada extra já foi exibido acima.
    } else if (outcome.continueTurn) {
      setStateLabel("Sua vez (continua)");
      messageUntil = performance.now() + 1200;
    } else {
      AudioSys.playTurnChange();
      showToast(`Vez de ${game.players[game.currentSeat - 1].name}`, "info");
    }

    updateScoreboard();
    updateTurnUI();
    updateInventoryUI();
    updateActiveEffectsUI();
    trySpawnMagicBall();
    updateMagicBallUI();

    if (!outcome.continueTurn && !outcome.foul) {
      setStateLabel("Sua vez");
    }

    const objectsAfterShot = Physics.getActiveObjectBalls().filter(
      (b) => b.kind === "object" && b.number !== 8
    );

    if (objectsAfterShot.length === 0) {
      showToast("Encaçape a bola 8 para vencer!", "info");
    }
  }

  function trySpawnMagicBall() {
    if (!Rules.isMagicBallSpawnDue(game) || shotActive || Physics.ballsMoving()) return false;
    const position = Physics.findMagicBallSpawnPosition();
    if (!position) return false;
    const result = Rules.spawnMagicBall(game, position);
    if (!result.ok) return false;
    processArcaneEvents();
    return true;
  }

  function processArcaneEvents() {
    const events = Rules.drainArcaneEvents(game);
    for (const event of events) {
      const payload = event.payload || {};
      window.dispatchEvent(new CustomEvent("arcane-pool:event", { detail: event }));

      if (event.type === "arcane_ball_spawned") {
        const ball = Physics.addMagicBall(payload);
        if (ball) spawnParticles(ball.x, ball.y, ball.color, 44, 180);
        const rarityName = Specials.RARITY_NAMES[payload.rarity] || payload.rarity;
        showToast(`Uma Bola Mágica ${rarityName} surgiu!`, "arcana");
        AudioSys.playArcaneEffect("arcane_ball_spawned");
      } else if (event.type === "arcane_ball_expired") {
        const ball = Physics.getMagicBall();
        if (ball) spawnParticles(ball.x, ball.y, ball.color, 34, 150);
        Physics.removeMagicBall(payload.id);
        showToast("A Bola Mágica expirou", "info");
        AudioSys.playArcaneEffect("arcane_ball_expired");
      } else if (event.type === "arcane_ball_potted") {
        Physics.removeMagicBall(payload.id);
        AudioSys.playArcaneEffect("arcane_ball_potted");
      } else if (event.type === "arcane_reward_granted") {
        const reward = payload.reward;
        showToast(`${reward.name} recebido no inventário!`, "success");
        AudioSys.playArcaneEffect("magic_reward");
      } else if (event.type === "arcane_reward_converted") {
        const reward = payload.reward;
        showToast(
          `${reward.name} convertido em ${payload.arcanaGranted} ✦`,
          "arcana"
        );
        AudioSys.playArcanaGain();
      }
    }

    if (events.length > 0) {
      updateScoreboard();
      updateInventoryUI();
      updateMagicBallUI();
    }
    return events;
  }

  function updateMagicBallUI() {
    const magicBall = game.magicBall;
    if (game.mode !== "arcane" || !magicBall) {
      dom.magicBallPanel.classList.add("hidden");
      return;
    }

    const rarityName = Specials.RARITY_NAMES[magicBall.rarity] || magicBall.rarity;
    const turns = Rules.getMagicBallTurnsRemaining(game);
    dom.magicBallPanel.style.setProperty("--magic-color", magicBall.color);
    dom.magicBallPanel.classList.toggle("touched", magicBall.touched);
    dom.magicBallLabel.textContent = `Bola Mágica ${rarityName}`;
    dom.magicBallTurns.textContent = `${turns} ${turns === 1 ? "turno" : "turnos"}${magicBall.touched ? " · toque coletado" : ""}`;
    dom.magicBallPanel.classList.remove("hidden");
  }

  function endGame(winnerSeat, reason) {
    game.phase = "gameover";

    const winner = game.players.find((p) => p.seat === winnerSeat);
    const loser = game.players.find((p) => p.seat !== winnerSeat);

    AudioSys.playWin();

    showGameOver(winner, loser, reason);
  }

  function showGameOver(winner, loser, reason) {
    dom.gameOverTitle.textContent = `${winner.name} venceu!`;
    dom.gameOverReason.textContent = reason;

    dom.gameOverScores.innerHTML = `
      <div class="finalPlayerCard winner">
        <div class="finalPlayerName">${winner.name}</div>
        <div class="finalPlayerScore">${winner.score}</div>
        <div class="finalPlayerTag">Vencedor</div>
      </div>
      <div class="finalPlayerCard">
        <div class="finalPlayerName">${loser.name}</div>
        <div class="finalPlayerScore">${loser.score}</div>
      </div>
    `;

    if (!networkMatch.active) {
      dom.gameOverButton.textContent = "Nova partida";
      dom.gameOverButton.disabled = false;
      dom.gameOverExitButton.classList.add("hidden");
      dom.gameOverRematchStatus.classList.add("hidden");
    }

    dom.gameOverOverlay.classList.remove("hidden");
    window.setTimeout(() => dom.gameOverButton.focus(), 0);
  }

  function hideGameOver() {
    dom.gameOverOverlay.classList.add("hidden");
  }

  function updateScoreboard() {
    dom.playerCards.forEach((card) => {
      const seat = parseInt(card.getAttribute("data-seat"), 10);
      const player = game.players.find((p) => p.seat === seat);

      if (!player) return;

      const scoreEl = card.querySelector(".playerScore");
      const nameEl = card.querySelector(".playerName");
      const badgeEl = card.querySelector(".playerBadge");
      const arcanaEl = card.querySelector(".arcanaValue");

      if (nameEl) {
        nameEl.textContent = player.name;
      }

      if (scoreEl) {
        scoreEl.textContent = player.score;
      }

      if (arcanaEl) {
        arcanaEl.textContent = player.arcanaPoints;
      }

      if (badgeEl) {
        if (seat === game.currentSeat && game.phase === "playing") {
          badgeEl.classList.remove("hidden");
          card.classList.add("active");
        } else {
          badgeEl.classList.add("hidden");
          card.classList.remove("active");
        }
      }

      card.classList.toggle("pressured", Boolean(player.activeEffects.pressure));
    });
  }

  function updateTurnUI() {
    const currentPlayer = game.players.find((p) => p.seat === game.currentSeat);

    if (currentPlayer) {
      dom.turnLabel.textContent = `Vez de: ${currentPlayer.name}`;
    }

    updateScoreboard();
  }

  // ===================== SISTEMA DE LOJA ARCANA =====================

  function toggleShop() {
    if (game.mode !== "arcane") {
      showToast("Loja Arcana só está disponível no Modo Arcano", "error");
      return;
    }

    if (game.phase !== "playing") {
      showToast("Não é possível abrir a loja agora", "error");
      return;
    }

    const currentPlayer = getHudPlayer();

    if (networkMatch.active) {
      if (networkMatch.seat !== game.currentSeat) {
        showToast("A loja só pode ser usada no seu turno", "error");
        return;
      }
      if (shotActive || Physics.ballsMoving() || drag.active) {
        showToast("Aguarde o fim da tacada para abrir a loja", "error");
        return;
      }
      networkMatch.sendCommand(currentPlayer.shop.open ? "close_shop" : "open_shop");
      return;
    }

    if (currentShotStart) {
      lastResolvedShot = currentShotStart;
      currentShotStart = null;
    }

    if (isAITurn()) {
      showToast("Aguarde a jogada da IA", "info");
      return;
    }

    if (currentPlayer.shop.open) {
      closeShop();
    } else {
      if (shotActive || Physics.ballsMoving() || drag.active) {
        showToast("Aguarde o fim da tacada para abrir a loja", "error");
        return;
      }
      openShop();
    }
  }

  function openShop() {
    const result = Rules.openShop(game, Date.now());
    if (!result.ok) {
      showToast("Não é possível abrir a loja agora", "error");
      return;
    }

    dom.shopOverlay.classList.remove("hidden");

    AudioSys.playShopOpen();
    renderShop();
    setStateLabel("Loja aberta");
    window.setTimeout(() => dom.shopCloseButton.focus(), 0);
  }

  function closeShop() {
    if (networkMatch.active) {
      if (networkMatch.sendCommand) networkMatch.sendCommand("close_shop");
      return;
    }

    Rules.closeShop(game, Date.now());
    dom.shopOverlay.classList.add("hidden");
    if (document.activeElement && dom.shopOverlay.contains(document.activeElement)) {
      dom.shopButton.focus();
    }

    if (game.phase === "playing") {
      setStateLabel("Sua vez");
    }
  }

  function rerollShop() {
    if (networkMatch.active) {
      networkMatch.sendCommand("reroll_shop");
      return;
    }

    const result = Rules.rerollShop(game);

    if (!result.ok) {
      const message = result.code === "insufficient_points"
        ? `Pontos arcana insuficientes (precisa de ${CONFIG.arcane.rerollCost} ✦)`
        : "Abra a loja antes de rolar as ofertas";
      showToast(message, "error");
      return;
    }

    AudioSys.playReroll();
    showToast(`Loja rolada por ${result.cost} ✦`, "info");
    renderShop();
    updateScoreboard();
  }

  function renderShop() {
    const currentPlayer = getHudPlayer();
    const offers = currentPlayer.shop.offers;

    dom.shopArcanaValue.textContent = currentPlayer.arcanaPoints;

    const usedSlots = currentPlayer.inventory.filter((s) => s !== null).length;
    dom.shopInventorySpace.textContent = `${usedSlots}/${CONFIG.arcane.inventoryMax}`;

    dom.rerollCostValue.textContent = CONFIG.arcane.rerollCost;

    dom.shopOffers.innerHTML = "";

    for (let i = 0; i < offers.length; i++) {
      const offer = offers[i];
      const def = Specials.getById(offer.defId);

      if (!def) continue;

      const card = document.createElement("div");
      card.className = "specialCard";
      card.setAttribute("data-rarity", def.rarity);

      const rarityName = Specials.RARITY_NAMES[def.rarity] || def.rarity;
      const validation = Rules.canBuySpecial(currentPlayer, offer);
      const canBuy = validation.ok;
      const boughtCount = currentPlayer.boughtHistory[def.id] || 0;

      const useTypeLabel = getUseTypeLabel(def.useType, def.maxUses, def.cooldownTurns);

      card.innerHTML = `
        <div class="specialIcon">${ICON_EMOJI[def.icon] || "✦"}</div>
        <div class="specialName">${def.name}</div>
        <div class="specialRarity ${def.rarity}">${rarityName}</div>
        <div class="specialDesc">${def.description}</div>
        <div class="specialHistory">${boughtCount > 0 ? `Comprado antes: ${boughtCount}x` : "Ainda não comprado"}</div>
        <div class="specialMeta">
          <span class="specialCost">✦ ${offer.cost}</span>
          <span class="specialUseType">${useTypeLabel}</span>
        </div>
        <button class="specialBuyBtn ${canBuy ? "" : "disabled"}" data-offer-id="${offer.offerId}" ${canBuy ? "" : "disabled"}>
          ${canBuy ? "Comprar" : getBuyBlockReason(validation.code)}
        </button>
      `;

      dom.shopOffers.appendChild(card);
    }

    dom.shopOffers.querySelectorAll(".specialBuyBtn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        buySpecial(e.currentTarget.getAttribute("data-offer-id"));
      });
    });
  }

  function getUseTypeLabel(useType, maxUses, cooldownTurns) {
    switch (useType) {
      case "single":
        return "Uso único";
      case "limited":
        return `${maxUses} usos`;
      case "cooldown":
        return `CD ${cooldownTurns} turnos`;
      case "passive":
        return "Passivo";
      default:
        return "";
    }
  }

  function getBuyBlockReason(code) {
    const labels = {
      insufficient_points: "Sem pontos",
      inventory_full: "Inventário cheio",
      legendary_limit: "Limite lendário",
      offer_unavailable: "Oferta indisponível",
      unknown_special: "Especial inválido"
    };
    return labels[code] || "Indisponível";
  }

  function buySpecial(offerId) {
    if (networkMatch.active) {
      networkMatch.sendCommand("buy_special", { offerId });
      return;
    }

    const result = Rules.buySpecial(game, offerId);

    if (!result.ok) {
      showToast(getBuyBlockReason(result.code), "error");
      return;
    }

    AudioSys.playBuy();
    showToast(`${result.instance.name} comprado!`, "success");
    renderShop();
    updateScoreboard();
    updateInventoryUI();
  }

  function updateInventoryUI() {
    if (game.mode !== "arcane") {
      dom.inventoryPanel.classList.add("hidden");
      return;
    }

    dom.inventoryPanel.classList.remove("hidden");

    const currentPlayer = getHudPlayer();
    const usedSlots = currentPlayer.inventory.filter((slot) => slot !== null).length;
    dom.inventoryCount.textContent = `${usedSlots}/${CONFIG.arcane.inventoryMax}`;
    dom.inventoryCount.setAttribute(
      "aria-label",
      `${usedSlots} de ${CONFIG.arcane.inventoryMax} espaços ocupados`
    );
    dom.inventorySlots.innerHTML = "";

    for (let i = 0; i < CONFIG.arcane.inventoryMax; i++) {
      const slot = document.createElement("div");
      slot.className = "inventorySlot";
      slot.setAttribute("data-slot", i);

      const instance = currentPlayer.inventory[i];

      if (!instance) {
        slot.classList.add("empty");
        slot.innerHTML = `<div class="slotLabel">Vazio</div>`;
      } else {
        slot.setAttribute("data-rarity", instance.rarity);
        const definition = Specials.getById(instance.defId);
        const phaseAvailable = Boolean(definition);
        const activeEffects = currentPlayer.activeEffects || {};
        const alreadyActive = Boolean(activeEffects[instance.defId]);
        const readyToUse = phaseAvailable
          && instance.cooldownTurns === 0
          && !alreadyActive
          && !shotActive
          && !Physics.ballsMoving()
          && !currentPlayer.shop.open
          && !isAITurn()
          && (!networkMatch.active || networkMatch.seat === game.currentSeat);

        let usesText = "";
        if (instance.useType === "limited") {
          usesText = `Usos: ${instance.usesLeft}/${instance.maxUses}`;
        } else if (instance.useType === "single") {
          usesText = "Uso único";
        } else if (instance.useType === "cooldown") {
          usesText = instance.cooldownTurns > 0
            ? `CD: ${instance.cooldownTurns} turnos`
            : "Pronto";
        } else if (instance.useType === "passive") {
          usesText = "Ativo";
        }

        slot.innerHTML = `
          <div>
            <span class="slotIcon">${ICON_EMOJI[instance.icon] || "✦"}</span>
            <span class="slotName">${instance.name}</span>
          </div>
          <div class="slotMeta">${usesText}</div>
          <div class="slotActions">
            <button class="use" data-slot-index="${i}" ${readyToUse ? "" : "disabled"}>
              ${alreadyActive ? "Armado" : "Usar"}
            </button>
            <button class="discard" data-slot-index="${i}" ${(isAITurn() || (networkMatch.active && networkMatch.seat !== game.currentSeat)) ? "disabled" : ""}>Descartar</button>
          </div>
        `;
      }

      dom.inventorySlots.appendChild(slot);
    }

    dom.inventorySlots.querySelectorAll(".discard").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.currentTarget.getAttribute("data-slot-index"), 10);
        discardSpecial(index);
      });
    });

    dom.inventorySlots.querySelectorAll(".use").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.currentTarget.getAttribute("data-slot-index"), 10);
        useSpecialFromSlot(index);
      });
    });

  }

  function setHudPanelCollapsed(panel, toggle, collapsed) {
    const panelName = panel.getAttribute("aria-label") || "painel";
    const action = collapsed ? "Abrir" : "Recolher";

    panel.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", `${action} ${panelName.toLowerCase()}`);
    toggle.title = `${action} ${panelName.toLowerCase()}`;
  }

  function useSpecialFromSlot(slotIndex) {
    if (isAITurn()) {
      showToast("Aguarde a jogada da IA", "info");
      return;
    }
    const player = getHudPlayer();
    const instance = player.inventory[slotIndex];
    if (!instance) return;

    if (networkMatch.active && networkMatch.seat !== game.currentSeat) {
      showToast("Use especiais somente no seu turno", "error");
      return;
    }

    if (shotActive || Physics.ballsMoving() || drag.active || player.shop.open) {
      showToast("Use especiais antes de preparar a tacada", "error");
      return;
    }

    if (instance.defId === "rewind") {
      if (networkMatch.active) {
        networkMatch.sendCommand("use_special", { instanceId: instance.uid });
      } else {
        activateRewind(slotIndex, instance);
      }
      return;
    }

    const pocketTargets = ["golden_pocket", "light_magnet", "shield_pocket"];
    const ballTargets = ["magnetic_ball", "position_swap", "explosive_ball"];
    const pointTargets = ["ice_zone", "sticky_zone", "ghost_hand"];
    let targetType = null;
    if (pocketTargets.includes(instance.defId)) targetType = "pocket";
    if (ballTargets.includes(instance.defId)) targetType = "ball";
    if (pointTargets.includes(instance.defId)) targetType = "point";
    if (instance.defId === "portal_pocket") targetType = "two-pockets";

    if (targetType) {
      pendingSpecialTarget = {
        slotIndex,
        defId: instance.defId,
        name: instance.name,
        targetType,
        selectedPocketIds: []
      };
      const labels = {
        pocket: "selecione uma caçapa",
        ball: "selecione uma bola",
        point: "selecione uma posição livre",
        "two-pockets": "selecione a primeira caçapa"
      };
      dom.targetPromptText.textContent = `${instance.name}: ${labels[targetType]}`;
      dom.targetPrompt.classList.remove("hidden");
      canvas.style.cursor = "crosshair";
      setStateLabel("Escolha o alvo");
      cancelDrag();
      return;
    }

    activateSpecial(slotIndex, null);
  }

  function selectPendingSpecialTarget() {
    if (!pendingSpecialTarget) return;

    const pending = pendingSpecialTarget;

    if (pending.targetType === "point") {
      const radius = pending.defId === "ghost_hand"
        ? CONFIG.balls.radius
        : CONFIG.arcane.specialEffects.zoneRadius;
      const x = clamp(mouse.x, radius, CONFIG.table.width - radius);
      const y = clamp(mouse.y, radius, CONFIG.table.height - radius);
      if (pending.defId === "ghost_hand" && !Physics.canPlaceCueAt(x, y)) {
        showToast("Escolha uma posição livre, longe de bolas e caçapas", "error");
        return;
      }
      const slotIndex = pending.slotIndex;
      cancelSpecialTarget(false);
      activateSpecial(slotIndex, { x, y });
      return;
    }

    if (pending.targetType === "ball") {
      let nearestBall = null;
      let ballDistance = Infinity;
      for (const ball of Physics.getActiveObjectBalls()) {
        const distance = Math.hypot(mouse.x - ball.x, mouse.y - ball.y);
        if (distance < ballDistance) {
          nearestBall = ball;
          ballDistance = distance;
        }
      }
      if (!nearestBall || ballDistance > 52) {
        showToast("Clique sobre uma bola válida", "error");
        return;
      }
      const slotIndex = pending.slotIndex;
      cancelSpecialTarget(false);
      activateSpecial(slotIndex, { ballId: nearestBall.id });
      return;
    }

    let nearest = null;
    let nearestDistance = Infinity;

    for (const pocket of Physics.getPockets()) {
      const distance = Math.hypot(mouse.x - pocket.x, mouse.y - pocket.y);
      if (distance < nearestDistance) {
        nearest = pocket;
        nearestDistance = distance;
      }
    }

    if (!nearest || nearestDistance > 105) {
      showToast("Clique próximo da caçapa desejada", "error");
      return;
    }

    if (pending.targetType === "two-pockets") {
      if (pending.selectedPocketIds.includes(nearest.id)) {
        showToast("Escolha outra caçapa", "error");
        return;
      }
      pending.selectedPocketIds.push(nearest.id);
      if (pending.selectedPocketIds.length === 1) {
        dom.targetPromptText.textContent = `${pending.name}: selecione a segunda caçapa`;
        return;
      }
      const slotIndex = pending.slotIndex;
      const pocketIds = [...pending.selectedPocketIds];
      cancelSpecialTarget(false);
      activateSpecial(slotIndex, { pocketIds });
      return;
    }

    const slotIndex = pending.slotIndex;
    cancelSpecialTarget(false);
    activateSpecial(slotIndex, { pocketId: nearest.id });
  }

  function activateRewind(slotIndex, instance) {
    if (!lastResolvedShot || lastResolvedShot.shooterSeat === game.currentSeat) {
      showToast("Não há uma tacada adversária para rebobinar", "error");
      return;
    }

    const ownerSeat = game.currentSeat;
    const result = Rules.rewindLastShot(
      game,
      lastResolvedShot.match,
      ownerSeat,
      instance.uid,
      Date.now()
    );
    if (!result.ok) {
      showToast("Rebobinar indisponível nesta jogada", "error");
      return;
    }

    Physics.loadSnapshot(lastResolvedShot.physics);
    lastResolvedShot = null;
    currentShotEffects = {};
    currentShotStart = null;
    AudioSys.playArcaneEffect("rewind");
    showToast(`Jogada rebobinada. Jogador ${result.shooterSeat} joga novamente.`, "arcana");
    updateScoreboard();
    updateTurnUI();
    updateInventoryUI();
    updateActiveEffectsUI();
  }

  function cancelSpecialTarget(restoreState = true) {
    pendingSpecialTarget = null;
    dom.targetPrompt.classList.add("hidden");
    canvas.style.cursor = "";
    if (restoreState && game.phase === "playing") {
      setStateLabel("Sua vez");
    }
  }

  function activateSpecial(slotIndex, target) {
    if (networkMatch.active) {
      const player = getHudPlayer();
      const instance = player.inventory[slotIndex];
      if (!instance) return;
      const type = target ? "select_special_target" : "use_special";
      networkMatch.sendCommand(type, { instanceId: instance.uid, target });
      setStateLabel("Validando magia no servidor");
      return;
    }

    const result = Rules.useSpecial(game, slotIndex, target, {
      shotReady: !shotActive && !Physics.ballsMoving() && !drag.active
    });

    if (!result.ok) {
      const errors = {
        already_active: "Este especial já está armado",
        cooldown: "Especial em cooldown",
        target_required: "Selecione uma caçapa válida",
        phase_unavailable: "Este especial será liberado em uma fase futura",
        shot_in_progress: "Aguarde o fim da tacada"
      };
      showToast(errors[result.code] || "Não foi possível usar o especial", "error");
      return;
    }

    AudioSys.playArcaneEffect(result.effect.defId);
    if (result.effect.defId === "position_swap") {
      if (!Physics.swapCueWithBall(result.effect.target.ballId)) {
        showToast("Não foi possível trocar essas posições", "error");
      }
      Rules.clearActiveEffect(game, game.currentSeat, "position_swap");
    } else if (result.effect.defId === "ghost_hand") {
      if (!Physics.moveCueTo(result.effect.target.x, result.effect.target.y)) {
        showToast("Posição inválida para a bola branca", "error");
      }
      Rules.clearActiveEffect(game, game.currentSeat, "ghost_hand");
    }
    const suffix = result.effect.defId === "pressure"
      ? ` — Jogador ${result.appliedToSeat} está sob pressão`
      : (result.effect.defId === "ice_zone" || result.effect.defId === "sticky_zone")
        ? " — zona criada"
        : " — efeito armado";
    showToast(`${result.effect.name}${suffix}`, "arcana");
    updateInventoryUI();
    updateActiveEffectsUI();
    updateScoreboard();
    setStateLabel("Especial preparado");
    messageUntil = performance.now() + 1500;
  }

  function updateActiveEffectsUI() {
    if (game.mode !== "arcane") {
      dom.activeEffectsPanel.classList.add("hidden");
      return;
    }

    const player = getHudPlayer();
    const effects = Object.values(player.activeEffects);

    if (effects.length === 0) {
      dom.activeEffectsPanel.classList.add("hidden");
      dom.activeEffectsPanel.innerHTML = "";
      return;
    }

    dom.activeEffectsPanel.innerHTML = effects.map((effect) => `
      <span class="activeEffectChip" data-effect="${effect.defId}">
        ${ICON_EMOJI[effect.icon] || "✦"} ${effect.name}
      </span>
    `).join("");
    dom.activeEffectsPanel.classList.remove("hidden");
  }

  function discardSpecial(slotIndex) {
    if (networkMatch.active) {
      const player = getHudPlayer();
      const instance = player.inventory[slotIndex];
      if (instance) networkMatch.sendCommand("discard_special", { instanceId: instance.uid });
      return;
    }

    const result = Rules.discardSpecial(game, slotIndex);
    if (!result.ok) return;

    AudioSys.playDiscard();
    showToast(`${result.instance.name} descartado`, "info");
    updateInventoryUI();
    if (game.players[game.currentSeat - 1].shop.open) renderShop();
  }

  function showToast(message, type = "info") {
    AudioSys.playNotification(type);
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("out");
      setTimeout(() => {
        toast.remove();
      }, 280);
    }, 2200);
  }

  function render() {
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.drawImage(tableTexture, 0, 0, view.w, view.h);

    ctx.save();
    ctx.translate(CONFIG.table.rail, CONFIG.table.rail);

    drawSpecialTableEffects();
    drawParticles();
    drawOpeningBreakGuide();
    drawBalls();
    drawAim();
    drawTimeFreezeAim();

    ctx.restore();
  }

  function drawBalls() {
    const activeBalls = Physics.getBalls().filter((ball) => ball.active);
    for (const ball of activeBalls.filter((ball) => ball.kind !== "magic")) {
      drawBall(ball);
    }
    for (const ball of activeBalls.filter((ball) => ball.kind === "magic")) {
      if (!ball.active) continue;
      drawBall(ball);
    }
  }

  function drawOpeningBreakGuide() {
    if (!canPlaceOpeningCue()) return;
    const cue = Physics.getCueBall();
    if (!cue) return;
    const padding = CONFIG.input.openingBreak.cueVerticalPadding;

    ctx.save();
    ctx.strokeStyle = "rgba(104, 200, 255, 0.36)";
    ctx.fillStyle = "rgba(190, 230, 255, 0.82)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(cue.x, padding);
    ctx.lineTo(cue.x, CONFIG.table.height - padding);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ARRASTE ↕", cue.x, cue.y - cue.radius - 13);
    ctx.restore();
  }

  function drawBall(ball) {
    const r = ball.radius;

    if (ball.kind === "magic") {
      drawMagicBall(ball);
      return;
    }

    // --- Sombra estática (não gira com a bola) ---
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.ellipse(ball.x + 3, ball.y + 5, r * 0.94, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Corpo da bola com rotação ---
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rotation);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    if (ball.kind === "cue") {
      ctx.fillStyle = "#f8f5ef";
      ctx.fillRect(-r, -r, r * 2, r * 2);
    } else if (ball.stripe) {
      ctx.fillStyle = "#f8f5ef";
      ctx.fillRect(-r, -r, r * 2, r * 2);

      ctx.fillStyle = ball.color;
      ctx.fillRect(-r, -r * 0.44, r * 2, r * 0.88);
    } else {
      ctx.fillStyle = ball.color;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }

    // Número (gira junto com a bola)
    if (ball.number > 0) {
      ctx.fillStyle = "#f8f5ef";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#171717";
      ctx.font = `${Math.round(r * 0.72)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ball.number), 0, 0.5);
    }

    ctx.restore();

    // --- Brilho estático (luz sempre vem do mesmo lado, não gira) ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.clip();

    const glow = ctx.createRadialGradient(
      ball.x - r * 0.35,
      ball.y - r * 0.42,
      r * 0.08,
      ball.x,
      ball.y,
      r
    );

    glow.addColorStop(0, "rgba(255,255,255,0.82)");
    glow.addColorStop(0.24, "rgba(255,255,255,0.22)");
    glow.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = glow;
    ctx.fillRect(ball.x - r, ball.y - r, r * 2, r * 2);
    ctx.restore();

    const physicsEffects = Physics.getShotModifiers();
    const armedEffects = Rules.getActiveEffects(game);

    if (ball.id === physicsEffects.ghostBallId) {
      ctx.save();
      ctx.strokeStyle = "rgba(190, 135, 255, 0.92)";
      ctx.shadowColor = "#a96dff";
      ctx.shadowBlur = 18;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (ball.kind === "cue" && armedEffects.stabilizer) {
      ctx.save();
      ctx.strokeStyle = "rgba(88, 214, 141, 0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (ball.kind === "cue" && currentShotEffects.soft_touch) {
      ctx.save();
      ctx.strokeStyle = "rgba(185, 245, 255, 0.72)";
      ctx.shadowColor = "#8de9ff";
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const selectedMagneticId = currentShotEffects.magnetic_ball
      ? currentShotEffects.magnetic_ball.target.ballId
      : armedEffects.magnetic_ball && armedEffects.magnetic_ball.target.ballId;
    const selectedExplosiveId = currentShotEffects.explosive_ball
      ? currentShotEffects.explosive_ball.target.ballId
      : armedEffects.explosive_ball && armedEffects.explosive_ball.target.ballId;

    if (ball.id === selectedMagneticId || ball.id === selectedExplosiveId) {
      const explosive = ball.id === selectedExplosiveId;
      ctx.save();
      ctx.strokeStyle = explosive ? "rgba(255, 84, 60, 0.95)" : "rgba(85, 194, 255, 0.95)";
      ctx.shadowColor = explosive ? "#ff3d28" : "#45bfff";
      ctx.shadowBlur = 20;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMagicBall(ball) {
    const r = ball.radius;
    const time = performance.now() * 0.004;
    const pulse = 1 + Math.sin(time * 1.7) * 0.08;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    ctx.beginPath();
    ctx.ellipse(ball.x + 4, ball.y + 7, r, r * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(ball.x, ball.y);
    ctx.shadowColor = ball.color;
    ctx.shadowBlur = 22;
    const core = ctx.createRadialGradient(-r * 0.34, -r * 0.42, 1, 0, 0, r * 1.15);
    core.addColorStop(0, "#ffffff");
    core.addColorStop(0.28, ball.color);
    core.addColorStop(1, "#24133f");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 9;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = `bold ${Math.round(r * 1.05)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✦", 0, 0.5);

    ctx.rotate(time * 0.38);
    ctx.strokeStyle = ball.color;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(0, 0, r + 7, r + 3, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate(-time * 0.82);
    ctx.globalAlpha = 0.44;
    ctx.beginPath();
    ctx.ellipse(0, 0, r + 4, r + 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpecialTableEffects() {
    const effects = Object.assign({}, Rules.getActiveEffects(game), currentShotEffects);
    const pulse = 0.72 + Math.sin(performance.now() * 0.006) * 0.18;

    for (const zone of game.zones || []) {
      ctx.save();
      const ice = zone.type === "ice";
      ctx.fillStyle = ice ? "rgba(110, 220, 255, 0.14)" : "rgba(76, 128, 54, 0.18)";
      ctx.strokeStyle = ice ? "rgba(145, 235, 255, 0.68)" : "rgba(112, 190, 76, 0.72)";
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (pendingSpecialTarget && (
      pendingSpecialTarget.targetType === "pocket" ||
      pendingSpecialTarget.targetType === "two-pockets"
    )) {
      for (const pocket of Physics.getPockets()) {
        drawPocketAura(pocket, "rgba(214, 190, 255, 0.92)", 12, pulse);
      }
    }

    if (pendingSpecialTarget && pendingSpecialTarget.targetType === "point") {
      const radius = pendingSpecialTarget.defId === "ghost_hand"
        ? CONFIG.balls.radius + 6
        : CONFIG.arcane.specialEffects.zoneRadius;
      ctx.save();
      ctx.strokeStyle = "rgba(214, 190, 255, 0.88)";
      ctx.fillStyle = "rgba(139, 92, 246, 0.10)";
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (effects.golden_pocket) {
      const pocket = Physics.getPockets().find(
        (item) => item.id === effects.golden_pocket.target.pocketId
      );
      if (pocket) drawPocketAura(pocket, "rgba(244, 208, 92, 0.95)", 16, pulse);
    }

    if (effects.light_magnet) {
      const pocket = Physics.getPockets().find(
        (item) => item.id === effects.light_magnet.target.pocketId
      );
      if (pocket) drawPocketAura(pocket, "rgba(83, 194, 255, 0.92)", 22, pulse);
    }

    if (effects.shield_pocket) {
      const pocket = Physics.getPockets().find(
        (item) => item.id === effects.shield_pocket.target.pocketId
      );
      if (pocket) drawPocketAura(pocket, "rgba(100, 210, 255, 0.98)", 18, pulse);
    }

    if (effects.portal_pocket) {
      const colors = ["rgba(190, 92, 255, 0.96)", "rgba(90, 220, 255, 0.96)"];
      effects.portal_pocket.target.pocketIds.forEach((id, index) => {
        const pocket = Physics.getPockets().find((item) => item.id === id);
        if (pocket) drawPocketAura(pocket, colors[index], 20, pulse);
      });
    }
  }

  function drawTimeFreezeAim() {
    const freeze = Physics.getTimeFreezeState();
    const networkFreeze = networkMatch.active && networkMatch.freezeActive;
    if ((!freeze || !freeze.active) && !networkFreeze) return;
    const cue = Physics.getCueBall();
    if (!cue) return;
    const cueDirection = networkFreeze ? networkMatch.freezeAngle : freeze.cueDirection;

    ctx.save();
    ctx.strokeStyle = "rgba(170, 240, 255, 0.94)";
    ctx.shadowColor = "#78e8ff";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(
      cue.x + Math.cos(cueDirection) * 220,
      cue.y + Math.sin(cueDirection) * 220
    );
    ctx.stroke();
    ctx.restore();
  }

  function drawPocketAura(pocket, color, extraRadius, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, CONFIG.table.pocketRadius + extraRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawAim() {
    if (!canShoot()) return;
    if (!mouse.inside && !drag.active) return;

    const cue = Physics.getCueBall();
    if (!cue || !cue.active) return;

    const angle = drag.active ? drag.angle : aim.angle;
    const effects = Rules.getActiveEffects(game);
    const expandedVision = Boolean(effects.expanded_vision);
    const ghostAim = Boolean(effects.ghost_aim);
    const traceLength = 1500 * (expandedVision
      ? CONFIG.arcane.specialEffects.expandedVisionLengthMultiplier
      : 1);
    const trace = expandedVision
      ? Physics.traceAim(
          angle,
          traceLength,
          CONFIG.arcane.specialEffects.expandedVisionBounces
        )
      : [];
    const finalSegment = trace.length > 0 ? trace[trace.length - 1] : null;
    const impact = expandedVision && finalSegment
      ? {
          x: finalSegment.endX,
          y: finalSegment.endY,
          ball: finalSegment.ball,
          t: trace.reduce((sum, segment) => sum + segment.distance, 0)
        }
      : Physics.raycastAim(angle, traceLength);

    if (!impact) return;

    const dirX = finalSegment
      ? (finalSegment.endX - finalSegment.startX) / Math.max(1, finalSegment.distance)
      : Math.cos(angle);
    const dirY = finalSegment
      ? (finalSegment.endY - finalSegment.startY) / Math.max(1, finalSegment.distance)
      : Math.sin(angle);

    ctx.save();

    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = drag.active
      ? "rgba(255, 220, 120, 0.88)"
      : "rgba(0, 255, 255, 0.70)";

    if (expandedVision && trace.length > 0) {
      for (const segment of trace) {
        ctx.beginPath();
        ctx.moveTo(segment.startX, segment.startY);
        ctx.lineTo(segment.endX, segment.endY);
        ctx.stroke();

        if (segment.wall) {
          ctx.fillStyle = "rgba(116, 220, 255, 0.92)";
          ctx.beginPath();
          ctx.arc(segment.endX, segment.endY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(cue.x, cue.y);
      ctx.lineTo(impact.x, impact.y);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    if (impact.ball) {
      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, cue.radius, 0, Math.PI * 2);
      ctx.stroke();

      const targetDx = impact.ball.x - impact.x;
      const targetDy = impact.ball.y - impact.y;
      const targetLen = Math.hypot(targetDx, targetDy) || 1;
      const nx = targetDx / targetLen;
      const ny = targetDy / targetLen;

      ctx.strokeStyle = "rgba(80, 255, 140, 0.76)";
      ctx.lineWidth = 2;
      if (ghostAim) ctx.setLineDash([9, 8]);
      ctx.beginPath();
      ctx.moveTo(impact.ball.x, impact.ball.y);
      const targetLength = ghostAim ? 290 : 86;
      ctx.lineTo(
        impact.ball.x + nx * targetLength,
        impact.ball.y + ny * targetLength
      );
      ctx.stroke();

      if (ghostAim) {
        const dot = dirX * nx + dirY * ny;
        const cueAfterX = dirX - nx * dot;
        const cueAfterY = dirY - ny * dot;
        const cueAfterLength = Math.hypot(cueAfterX, cueAfterY);

        if (cueAfterLength > 0.03) {
          ctx.strokeStyle = "rgba(126, 220, 255, 0.82)";
          ctx.beginPath();
          ctx.moveTo(impact.x, impact.y);
          ctx.lineTo(
            impact.x + cueAfterX / cueAfterLength * 230,
            impact.y + cueAfterY / cueAfterLength * 230
          );
          ctx.stroke();
        }
      }

      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    drawCueStick(cue, Math.cos(angle), Math.sin(angle));

    ctx.restore();
  }

  function drawCueStick(cue, dirX, dirY) {
    const pull = drag.active ? drag.power * 72 : 16;
    const offset = cue.radius + 11 + pull;
    const length = 215;

    const startX = cue.x - dirX * offset;
    const startY = cue.y - dirY * offset;
    const endX = cue.x - dirX * (offset + length);
    const endY = cue.y - dirY * (offset + length);

    const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
    gradient.addColorStop(0, "#d8a25e");
    gradient.addColorStop(0.72, "#8e5a2b");
    gradient.addColorStop(1, "#553218");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(startX - dirY * 1.5, startY + dirX * 1.5);
    ctx.lineTo(endX - dirY * 1.5, endY + dirX * 1.5);
    ctx.stroke();
  }

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const p = getInactiveParticle();
      if (!p) return;

      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.9);

      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.maxLife = 0.32 + Math.random() * 0.34;
      p.life = p.maxLife;
      p.size = 1.4 + Math.random() * 2.3;
      p.color = color;
    }
  }

  function getInactiveParticle() {
    for (const p of particles) {
      if (!p.active) return p;
    }

    return null;
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;

      p.life -= dt;

      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const damping = Math.exp(-2.6 * dt);
      p.vx *= damping;
      p.vy *= damping;
      p.vy += 26 * dt;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      if (!p.active) continue;

      const alpha = Math.max(0, p.life / p.maxLife);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function clearParticles() {
    for (const p of particles) {
      p.active = false;
    }
  }

  function buildTableTexture() {
    const supportsOffscreenCanvas = typeof OffscreenCanvas === "function";
    const c = supportsOffscreenCanvas
      ? new OffscreenCanvas(view.w * 2, view.h * 2)
      : document.createElement("canvas");

    if (!supportsOffscreenCanvas) {
      c.width = view.w * 2;
      c.height = view.h * 2;
    }

    const g = c.getContext("2d");
    g.scale(2, 2);

    const rail = CONFIG.table.rail;
    const W = CONFIG.table.width;
    const H = CONFIG.table.height;

    roundRect(g, 0, 0, view.w, view.h, 30);

    const wood = g.createLinearGradient(0, 0, view.w, view.h);
    wood.addColorStop(0, "#62381f");
    wood.addColorStop(0.45, "#7c4c2b");
    wood.addColorStop(1, "#492513");

    g.fillStyle = wood;
    g.fill();

    g.save();
    g.clip();

    for (let i = 0; i < 170; i++) {
      g.strokeStyle = `rgba(32, 16, 7, ${0.028 + Math.random() * 0.05})`;
      g.lineWidth = 1 + Math.random() * 3.4;

      const y = Math.random() * view.h;

      g.beginPath();
      g.moveTo(0, y + rand(-14, 14));
      g.bezierCurveTo(
        view.w * 0.28,
        y + rand(-30, 30),
        view.w * 0.72,
        y + rand(-30, 30),
        view.w,
        y + rand(-14, 14)
      );
      g.stroke();
    }

    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255, 224, 170, ${Math.random() * 0.025})`;
      g.fillRect(
        Math.random() * view.w,
        Math.random() * view.h,
        1 + Math.random() * 2,
        1 + Math.random() * 2
      );
    }

    g.restore();

    roundRect(g, rail - 10, rail - 10, W + 20, H + 20, 22);
    g.fillStyle = "#094430";
    g.fill();

    roundRect(g, rail, rail, W, H, 14);

    const felt = g.createRadialGradient(
      view.w / 2,
      view.h / 2,
      70,
      view.w / 2,
      view.h / 2,
      W * 0.74
    );

    felt.addColorStop(0, "#158556");
    felt.addColorStop(1, "#0a4c34");

    g.fillStyle = felt;
    g.fill();

    g.save();
    roundRect(g, rail, rail, W, H, 14);
    g.clip();

    for (let i = 0; i < 9200; i++) {
      const x = rail + Math.random() * W;
      const y = rail + Math.random() * H;

      if (Math.random() > 0.5) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.028})`;
      } else {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`;
      }

      g.fillRect(x, y, 1.1, 1.1);
    }

    const vignette = g.createRadialGradient(
      view.w / 2,
      view.h / 2,
      H * 0.18,
      view.w / 2,
      view.h / 2,
      W * 0.78
    );

    vignette.addColorStop(0, "rgba(255,255,255,0.022)");
    vignette.addColorStop(1, "rgba(0,0,0,0.19)");

    g.fillStyle = vignette;
    g.fillRect(rail, rail, W, H);

    g.restore();

    g.save();
    g.lineWidth = 10;
    g.strokeStyle = "rgba(2, 43, 27, 0.76)";
    roundRect(g, rail + 5, rail + 5, W - 10, H - 10, 12);
    g.stroke();
    g.restore();

    for (const pocket of Physics.getPockets()) {
      const px = pocket.x + rail;
      const py = pocket.y + rail;
      const pr = CONFIG.table.pocketRadius;

      const hole = g.createRadialGradient(px, py, pr * 0.14, px, py, pr * 1.26);
      hole.addColorStop(0, "#000000");
      hole.addColorStop(0.72, "#080808");
      hole.addColorStop(1, "rgba(0,0,0,0)");

      g.fillStyle = hole;
      g.beginPath();
      g.arc(px, py, pr * 1.26, 0, Math.PI * 2);
      g.fill();

      g.strokeStyle = "rgba(228, 196, 124, 0.62)";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(px, py, pr * 0.97, 0, Math.PI * 2);
      g.stroke();
    }

    g.fillStyle = "rgba(244, 226, 178, 0.82)";

    const xMarks = [0.125, 0.25, 0.375, 0.625, 0.75, 0.875];

    for (const fx of xMarks) {
      drawDiamond(g, rail + W * fx, rail * 0.52, 4);
      drawDiamond(g, rail + W * fx, view.h - rail * 0.52, 4);
    }

    const yMarks = [0.25, 0.5, 0.75];

    for (const fy of yMarks) {
      drawDiamond(g, rail * 0.52, rail + H * fy, 4);
      drawDiamond(g, view.w - rail * 0.52, rail + H * fy, 4);
    }

    return c;
  }

  function drawDiamond(g, x, y, size) {
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI / 4);
    g.fillRect(-size / 2, -size / 2, size, size);
    g.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();

    if (g.roundRect) {
      g.roundRect(x, y, w, h, r);
      return;
    }

    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  window.ArcaneGame = {
    enterMultiplayer,
    applyMultiplayerPhysics,
    applyMultiplayerPlayers,
    applyMultiplayerPrivateState,
    applyMultiplayerShopOpened,
    applyMultiplayerShopClosed,
    applyMultiplayerShopState,
    applyMultiplayerShopRerolled,
    applyMultiplayerSpecialBought,
    applyMultiplayerSpecialDiscarded,
    applyMultiplayerSpecialUsed,
    applyMultiplayerSpecialEffectStarted,
    applyMultiplayerSpecialEffectFinished,
    applyMultiplayerSpecialPhysicsEvent,
    applyMultiplayerArcaneEvent,
    applyMultiplayerShotAccepted,
    setMultiplayerShotActive,
    applyMultiplayerTurn,
    applyMultiplayerShotResult,
    finishMultiplayer,
    applyMultiplayerRematchState,
    leaveMultiplayer,
    notify: showToast
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
