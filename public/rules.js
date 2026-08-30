const RulesDependencies = typeof module === "object" && module.exports
  ? { CONFIG: require("./config.js"), Specials: require("./specials.js") }
  : { CONFIG, Specials };

const Rules = ((CONFIG, Specials) => {
  function normalizeMode(mode) {
    return mode === "arcane" ? "arcane" : "classic";
  }

  function createPlayer(seat, mode) {
    return {
      seat,
      name: `Jogador ${seat}`,
      score: 0,
      arcanaPoints: mode === "arcane" ? CONFIG.arcane.arcanaPoints.start : 0,
      inventory: Array(CONFIG.arcane.inventoryMax).fill(null),
      shop: {
        offers: [],
        open: false,
        rotation: 0
      },
      boughtHistory: {},
      legendaryPurchased: false,
      activeEffects: {},
      rewindUsed: false,
      turnHadSuccessfulPot: false
    };
  }

  function createMatch(mode = "classic", now = Date.now(), random = Math.random) {
    const normalizedMode = normalizeMode(mode);
    const match = {
      mode: normalizedMode,
      phase: "playing",
      currentSeat: 1,
      players: [createPlayer(1, normalizedMode), createPlayer(2, normalizedMode)],
      turn: null,
      zones: [],
      magicBall: null,
      nextMagicBallTurn: normalizedMode === "arcane" ? 1 : null,
      arcaneEventSequence: 0,
      arcaneEventQueue: [],
      exchangeCandidateSeat: null,
      openingBreakPending: true,
      winnerSeat: null,
      gameEndReason: ""
    };

    startTurn(match, 1, now, random);
    return match;
  }

  function resetMatch(match, mode = match.mode, now = Date.now(), random = Math.random) {
    const fresh = createMatch(mode, now, random);

    for (const key of Object.keys(match)) {
      delete match[key];
    }

    Object.assign(match, fresh);
    return match;
  }

  function getPlayer(match, seat) {
    return match.players.find((player) => player.seat === seat) || null;
  }

  function getOpponentSeat(seat) {
    return seat === 1 ? 2 : 1;
  }

  function decrementCooldowns(player) {
    for (const instance of player.inventory) {
      if (!instance || instance.useType !== "cooldown") continue;
      instance.cooldownTurns = Math.max(0, instance.cooldownTurns - 1);
    }
  }

  function rotateShop(player, random = Math.random) {
    const legendaryBlocked = player.legendaryPurchased;
    player.shop.offers = Specials.rollShopOffers(legendaryBlocked, [], random);
    player.shop.rotation += 1;
    return player.shop.offers;
  }

  function createTurnTimer(now) {
    return {
      durationMs: CONFIG.turn.durationMs,
      remainingMs: CONFIG.turn.durationMs,
      deadlineAt: now + CONFIG.turn.durationMs,
      paused: false
    };
  }

  function startTurn(match, seat, now = Date.now(), random = Math.random) {
    for (const player of match.players) {
      player.shop.open = false;
    }

    const player = getPlayer(match, seat);
    if (!player) return null;

    match.currentSeat = seat;
    match.turn = {
      number: match.turn ? match.turn.number + 1 : 1,
      seat,
      shotNumber: 1,
      doubleShotLimited: false,
      timer: createTurnTimer(now)
    };

    expireMagicBallIfNeeded(match);

    match.zones = match.zones.filter(
      (zone) => zone.expiresAfterTurn >= match.turn.number
    );

    player.turnHadSuccessfulPot = false;
    decrementCooldowns(player);

    if (match.mode === "arcane") {
      rotateShop(player, random);
    }

    return match.turn;
  }

  function restartShotWindow(match, now = Date.now()) {
    if (!match.turn) return null;
    match.turn.shotNumber += 1;
    match.turn.timer = createTurnTimer(now);
    return match.turn.timer;
  }

  function isOpeningBreak(match) {
    if (!match || match.phase !== "playing") return false;
    if (typeof match.openingBreakPending === "boolean") {
      return match.openingBreakPending;
    }
    return Boolean(
      match.turn && match.turn.number === 1 && match.turn.shotNumber === 1
    );
  }

  function consumeOpeningBreak(match) {
    if (!isOpeningBreak(match)) return false;
    match.openingBreakPending = false;
    return true;
  }

  function getTurnRemainingMs(match, now = Date.now()) {
    if (!match.turn || !match.turn.timer) return 0;
    const timer = match.turn.timer;
    return timer.paused
      ? Math.max(0, timer.remainingMs)
      : Math.max(0, timer.deadlineAt - now);
  }

  function pauseTurnTimer(match, now = Date.now()) {
    if (!match.turn || !match.turn.timer || match.turn.timer.paused) return;
    const timer = match.turn.timer;
    timer.remainingMs = getTurnRemainingMs(match, now);
    timer.deadlineAt = null;
    timer.paused = true;
  }

  function resumeTurnTimer(match, now = Date.now()) {
    if (!match.turn || !match.turn.timer || !match.turn.timer.paused) return;
    const timer = match.turn.timer;
    timer.deadlineAt = now + timer.remainingMs;
    timer.paused = false;
  }

  function isTurnExpired(match, now = Date.now()) {
    return match.phase === "playing" && getTurnRemainingMs(match, now) <= 0;
  }

  function awardArcana(match, seat, amount, reason, events) {
    if (match.mode !== "arcane" || amount <= 0) return 0;
    const player = getPlayer(match, seat);
    if (!player) return 0;

    const before = player.arcanaPoints;
    player.arcanaPoints = Math.min(CONFIG.arcane.arcanaPoints.max, before + amount);
    const granted = player.arcanaPoints - before;

    if (granted > 0 && events) {
      events.push({ seat, amount: granted, reason });
    }

    return granted;
  }

  function emitArcaneEvent(match, type, payload) {
    match.arcaneEventSequence = (match.arcaneEventSequence || 0) + 1;
    if (!Array.isArray(match.arcaneEventQueue)) match.arcaneEventQueue = [];
    const event = {
      type,
      seq: match.arcaneEventSequence,
      payload: Object.assign({}, payload)
    };
    match.arcaneEventQueue.push(event);
    return event;
  }

  function drainArcaneEvents(match) {
    const events = Array.isArray(match.arcaneEventQueue)
      ? match.arcaneEventQueue.slice()
      : [];
    match.arcaneEventQueue = [];
    return events;
  }

  function getMagicBallTurnsRemaining(match) {
    if (!match.magicBall || !match.turn) return 0;
    return Math.max(0, match.magicBall.expiresAfterTurn - match.turn.number + 1);
  }

  function isMagicBallSpawnDue(match) {
    return Boolean(
      match.mode === "arcane" &&
      match.phase === "playing" &&
      match.turn &&
      !match.magicBall &&
      Number.isInteger(match.nextMagicBallTurn) &&
      match.turn.number >= match.nextMagicBallTurn
    );
  }

  function spawnMagicBall(match, position, random = Math.random) {
    if (!isMagicBallSpawnDue(match)) {
      return { ok: false, code: match.magicBall ? "magic_ball_active" : "spawn_not_due" };
    }

    const x = position && Number(position.x);
    const y = position && Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, code: "invalid_position" };
    }

    const rarity = Specials.rollRarity(random);
    const rewardPool = Specials.getByRarity(rarity);
    const rewardDefinition = rewardPool[Math.floor(random() * rewardPool.length)];
    if (!rewardDefinition) return { ok: false, code: "reward_unavailable" };

    const lifetimeTurns = CONFIG.arcane.magicBall.lifetimeTurns;
    const magicBall = {
      id: `magic_${match.turn.number}_${Math.floor(random() * 1e9)}`,
      x,
      y,
      radius: CONFIG.arcane.magicBall.radius,
      rarity,
      color: CONFIG.arcane.magicBall.colors[rarity],
      rewardDefId: rewardDefinition.id,
      rewardName: rewardDefinition.name,
      spawnedTurn: match.turn.number,
      expiresAfterTurn: match.turn.number + lifetimeTurns - 1,
      touched: false,
      touchedBySeat: null
    };

    match.magicBall = magicBall;
    match.nextMagicBallTurn = null;
    emitArcaneEvent(match, "arcane_ball_spawned", {
      id: magicBall.id,
      x,
      y,
      radius: magicBall.radius,
      rarity,
      color: magicBall.color,
      spawnedTurn: magicBall.spawnedTurn,
      expiresAfterTurn: magicBall.expiresAfterTurn,
      turnsRemaining: lifetimeTurns
    });

    return { ok: true, magicBall };
  }

  function touchMagicBall(match, magicBallId, seat, arcanaEvents) {
    const magicBall = match.magicBall;
    if (!magicBall || magicBall.id !== magicBallId) {
      return { ok: false, code: "magic_ball_unavailable" };
    }
    if (magicBall.touched) return { ok: false, code: "already_touched" };

    magicBall.touched = true;
    magicBall.touchedBySeat = seat;
    const granted = awardArcana(
      match,
      seat,
      CONFIG.arcane.magicBall.touchArcana,
      "Toque na Bola Mágica",
      arcanaEvents
    );
    emitArcaneEvent(match, "arcane_ball_touched", {
      id: magicBall.id,
      seat,
      rarity: magicBall.rarity,
      arcanaGranted: granted
    });
    return { ok: true, granted };
  }

  function grantMagicBallReward(match, seat, magicBall, random, arcanaEvents) {
    const player = getPlayer(match, seat);
    const definition = Specials.getById(magicBall.rewardDefId);
    if (!player || !definition) return { ok: false, code: "reward_unavailable" };

    const emptySlot = player.inventory.findIndex((slot) => slot === null);
    const legendaryBlocked = definition.rarity === "legendary" && player.legendaryPurchased;

    if (emptySlot >= 0 && !legendaryBlocked) {
      const instance = Specials.createSpecialInstance({ defId: definition.id }, random);
      player.inventory[emptySlot] = instance;
      if (definition.rarity === "legendary") player.legendaryPurchased = true;
      emitArcaneEvent(match, "arcane_reward_granted", {
        id: magicBall.id,
        seat,
        slot: emptySlot,
        reward: {
          instanceUid: instance.uid,
          defId: definition.id,
          name: definition.name,
          rarity: definition.rarity
        }
      });
      return { ok: true, converted: false, instance, slot: emptySlot };
    }

    const conversionValue = CONFIG.arcane.conversionOnFullInventory[definition.rarity] || 0;
    const granted = awardArcana(
      match,
      seat,
      conversionValue,
      legendaryBlocked ? "Recompensa lendária convertida" : "Inventário cheio",
      arcanaEvents
    );
    emitArcaneEvent(match, "arcane_reward_converted", {
      id: magicBall.id,
      seat,
      reason: legendaryBlocked ? "legendary_limit" : "inventory_full",
      conversionValue,
      arcanaGranted: granted,
      reward: {
        defId: definition.id,
        name: definition.name,
        rarity: definition.rarity
      }
    });
    return {
      ok: true,
      converted: true,
      conversionValue,
      granted,
      reason: legendaryBlocked ? "legendary_limit" : "inventory_full",
      definition
    };
  }

  function collectMagicBall(match, magicBallId, seat, pocketId, random, arcanaEvents) {
    const magicBall = match.magicBall;
    if (!magicBall || magicBall.id !== magicBallId) {
      return { ok: false, code: "magic_ball_unavailable" };
    }

    emitArcaneEvent(match, "arcane_ball_potted", {
      id: magicBall.id,
      seat,
      pocketId,
      rarity: magicBall.rarity
    });
    const reward = grantMagicBallReward(match, seat, magicBall, random, arcanaEvents);
    match.magicBall = null;
    match.nextMagicBallTurn = match.turn.number + CONFIG.arcane.magicBall.respawnDelayTurns;
    return { ok: true, magicBall, reward };
  }

  function expireMagicBallIfNeeded(match) {
    const magicBall = match.magicBall;
    if (!magicBall || !match.turn || match.turn.number <= magicBall.expiresAfterTurn) {
      return false;
    }

    emitArcaneEvent(match, "arcane_ball_expired", {
      id: magicBall.id,
      rarity: magicBall.rarity,
      x: magicBall.x,
      y: magicBall.y,
      expiredAtTurn: match.turn.number
    });
    match.magicBall = null;
    match.nextMagicBallTurn = match.turn.number + CONFIG.arcane.magicBall.respawnDelayTurns;
    return true;
  }

  function scorePottedBall(potted) {
    if (potted.shotDistance >= CONFIG.classic.longShotDistance) {
      return { points: CONFIG.classic.points.long, type: "longa" };
    }

    if (potted.cushionAfterContact) {
      return { points: CONFIG.classic.points.cushion, type: "tabela" };
    }

    return { points: CONFIG.classic.points.normal, type: "normal" };
  }

  function arcanaForPottedBall(potted) {
    if (potted.shotDistance >= CONFIG.classic.longShotDistance) {
      return CONFIG.arcane.arcanaPoints.potLong;
    }

    if (potted.cushionAfterContact) {
      return CONFIG.arcane.arcanaPoints.potCushion;
    }

    return CONFIG.arcane.arcanaPoints.potNormal;
  }

  function resolveShot(match, shotState, context = {}) {
    const now = context.now || Date.now();
    const random = context.random || Math.random;
    const currentSeat = match.currentSeat;
    const opponentSeat = getOpponentSeat(currentSeat);
    const currentPlayer = getPlayer(match, currentSeat);
    const arcanaEvents = [];
    const scoreEvents = [];
    const notifications = [];

    let foul = false;
    const foulReasons = [];
    let scoreGained = 0;
    let gameOver = false;
    let winnerSeat = null;
    let gameEndReason = "";
    const pottedValidBalls = [];
    let magicBallCollected = false;
    const shotEffects = context.shotEffects || {};

    for (const magicBallId of shotState.magicBallsTouched || []) {
      touchMagicBall(match, magicBallId, currentSeat, arcanaEvents);
    }

    if (shotState.cuePocketed) {
      foul = true;
      foulReasons.push("Bola branca encaçapada");
      scoreGained += CONFIG.classic.points.cueFoul;
    }

    if (!shotState.firstContactBall) {
      foul = true;
      foulReasons.push("Nenhuma bola tocada");
    }

    for (const potted of shotState.pottedBalls) {
      if (potted.kind === "cue") continue;

      if (potted.kind === "magic") {
        const collected = collectMagicBall(
          match,
          potted.magicBallId,
          currentSeat,
          potted.pocketId,
          random,
          arcanaEvents
        );
        magicBallCollected = magicBallCollected || collected.ok;
        continue;
      }

      if (potted.kind === "eight") {
        if ((context.remainingObjectBalls || 0) === 0 && !foul) {
          gameOver = true;
          winnerSeat = currentSeat;
          gameEndReason = "Bola 8 encaçapada corretamente";
        } else {
          gameOver = true;
          winnerSeat = opponentSeat;
          gameEndReason = foul
            ? "Bola 8 encaçapada em jogada com falta"
            : "Bola 8 encaçapada antes da hora";
        }
        continue;
      }

      pottedValidBalls.push(potted);
      const scored = scorePottedBall(potted);
      scoreGained += scored.points;
      scoreEvents.push({
        seat: currentSeat,
        ballNumber: potted.ballNumber,
        points: scored.points,
        type: scored.type
      });

      awardArcana(
        match,
        currentSeat,
        arcanaForPottedBall(potted),
        `Bola ${potted.ballNumber} (${scored.type})`,
        arcanaEvents
      );
    }

    if (
      match.mode === "arcane" &&
      shotEffects.golden_pocket &&
      pottedValidBalls.some(
        (potted) => potted.pocketId === shotEffects.golden_pocket.target.pocketId
      )
    ) {
      awardArcana(match, currentSeat, 3, "Caçapa Dourada", arcanaEvents);
    }

    if (match.mode === "arcane" && pottedValidBalls.length >= 2) {
      awardArcana(
        match,
        currentSeat,
        CONFIG.arcane.arcanaPoints.multiPotBonus,
        "Múltiplas encaçapadas",
        arcanaEvents
      );
    }

    currentPlayer.score += scoreGained;

    const successfulPot = !foul && (pottedValidBalls.length > 0 || magicBallCollected);

    if (successfulPot) {
      currentPlayer.turnHadSuccessfulPot = true;
      if (match.exchangeCandidateSeat && match.exchangeCandidateSeat !== currentSeat) {
        match.exchangeCandidateSeat = null;
      }
    }

    let continueTurn = !gameOver && successfulPot && CONFIG.classic.continueTurnOnPot;
    const doubleShotGranted = Boolean(
      !gameOver &&
      !foul &&
      !successfulPot &&
      shotEffects.double_shot
    );

    if (doubleShotGranted) {
      continueTurn = true;
    }

    if (!gameOver && !continueTurn) {
      if (
        match.mode === "arcane" &&
        !successfulPot &&
        match.exchangeCandidateSeat &&
        match.exchangeCandidateSeat !== currentSeat
      ) {
        awardArcana(
          match,
          match.exchangeCandidateSeat,
          CONFIG.arcane.arcanaPoints.exchangeWin,
          "Troca de jogadas vencida",
          arcanaEvents
        );
      }

      if (
        match.mode === "arcane" &&
        !foul &&
        !successfulPot &&
        context.hasClearShot === false
      ) {
        awardArcana(
          match,
          currentSeat,
          CONFIG.arcane.arcanaPoints.goodDefense,
          "Boa defesa",
          arcanaEvents
        );
      }

      match.exchangeCandidateSeat = currentPlayer.turnHadSuccessfulPot ? currentSeat : null;
      startTurn(match, opponentSeat, now, random);
    } else if (!gameOver) {
      restartShotWindow(match, now);
      match.turn.doubleShotLimited = doubleShotGranted;
    }

    if (gameOver) {
      match.phase = "gameover";
      match.winnerSeat = winnerSeat;
      match.gameEndReason = gameEndReason;
    }

    if (foul) {
      notifications.push({ type: "foul", message: foulReasons.join(" + ") });
    }

    return {
      foul,
      foulReason: foulReasons.join(" + "),
      scoreGained,
      scoreEvents,
      arcanaEvents,
      notifications,
      pottedValidBalls,
      magicBallCollected,
      continueTurn,
      doubleShotGranted,
      turnChanged: !gameOver && !continueTurn,
      gameOver,
      winnerSeat,
      gameEndReason
    };
  }

  function openShop(match, now = Date.now()) {
    if (match.mode !== "arcane") return { ok: false, code: "wrong_mode" };
    if (match.phase !== "playing") return { ok: false, code: "wrong_phase" };

    const player = getPlayer(match, match.currentSeat);
    player.shop.open = true;
    pauseTurnTimer(match, now);
    return { ok: true, offers: player.shop.offers };
  }

  function closeShop(match, now = Date.now()) {
    for (const player of match.players) {
      player.shop.open = false;
    }
    resumeTurnTimer(match, now);
    return { ok: true };
  }

  function rerollShop(match, random = Math.random) {
    const player = getPlayer(match, match.currentSeat);
    const cost = CONFIG.arcane.rerollCost;

    if (!player || !player.shop.open) return { ok: false, code: "shop_closed" };
    if (player.arcanaPoints < cost) return { ok: false, code: "insufficient_points" };

    player.arcanaPoints -= cost;
    rotateShop(player, random);
    return { ok: true, cost, offers: player.shop.offers };
  }

  function canBuySpecial(player, offer) {
    if (!offer) return { ok: false, code: "offer_unavailable" };
    const definition = Specials.getById(offer.defId);
    if (!definition) return { ok: false, code: "unknown_special" };
    if (player.arcanaPoints < offer.cost) return { ok: false, code: "insufficient_points" };

    const usedSlots = player.inventory.filter(Boolean).length;
    if (usedSlots >= CONFIG.arcane.inventoryMax) return { ok: false, code: "inventory_full" };
    if (definition.rarity === "legendary" && player.legendaryPurchased) {
      return { ok: false, code: "legendary_limit" };
    }

    return { ok: true, definition };
  }

  function buySpecial(match, offerId, random = Math.random) {
    const player = getPlayer(match, match.currentSeat);
    if (!player || !player.shop.open) return { ok: false, code: "shop_closed" };

    const offerIndex = player.shop.offers.findIndex((offer) => offer.offerId === offerId);
    const offer = player.shop.offers[offerIndex];
    const validation = canBuySpecial(player, offer);
    if (!validation.ok) return validation;

    const instance = Specials.createSpecialInstance(offer, random);
    const emptySlot = player.inventory.findIndex((slot) => slot === null);
    player.arcanaPoints -= offer.cost;
    player.inventory[emptySlot] = instance;
    player.shop.offers.splice(offerIndex, 1);
    player.boughtHistory[offer.defId] = (player.boughtHistory[offer.defId] || 0) + 1;

    if (validation.definition.rarity === "legendary") {
      player.legendaryPurchased = true;
    }

    return {
      ok: true,
      offer,
      instance,
      slot: emptySlot,
      boughtCount: player.boughtHistory[offer.defId]
    };
  }

  function discardSpecial(match, slotIndex) {
    const player = getPlayer(match, match.currentSeat);
    if (!player || !Number.isInteger(slotIndex)) return { ok: false, code: "invalid_slot" };
    if (slotIndex < 0 || slotIndex >= player.inventory.length) return { ok: false, code: "invalid_slot" };

    const instance = player.inventory[slotIndex];
    if (!instance) return { ok: false, code: "empty_slot" };

    player.inventory[slotIndex] = null;
    return { ok: true, instance, slot: slotIndex };
  }

  const TARGETED_SPECIALS = new Set(["golden_pocket", "light_magnet"]);
  const SHOT_SPECIALS = new Set([
    "ghost_aim",
    "perfect_force",
    "soft_touch",
    "expanded_vision",
    "stabilizer",
    "ghost_ball",
    "golden_pocket",
    "pressure",
    "light_magnet",
    "double_shot",
    "magnetic_ball",
    "shield_pocket",
    "ice_zone",
    "sticky_zone",
    "position_swap",
    "time_freeze",
    "ghost_hand",
    "portal_pocket",
    "explosive_ball"
  ]);

  const POCKET_TARGETS = new Set([
    "golden_pocket",
    "light_magnet",
    "shield_pocket"
  ]);
  const BALL_TARGETS = new Set([
    "magnetic_ball",
    "position_swap",
    "explosive_ball"
  ]);
  const POINT_TARGETS = new Set(["ice_zone", "sticky_zone", "ghost_hand"]);

  function getActiveEffects(match, seat = match.currentSeat) {
    const player = getPlayer(match, seat);
    return player ? player.activeEffects : {};
  }

  function consumeInventoryUse(player, slotIndex, instance) {
    if (instance.useType === "limited") {
      instance.usesLeft = Math.max(0, instance.usesLeft - 1);
      if (instance.usesLeft === 0) {
        player.inventory[slotIndex] = null;
      }
      return;
    }

    if (instance.useType === "cooldown") {
      instance.cooldownTurns = instance.maxCooldown;
      return;
    }

    if (instance.useType === "single") {
      player.inventory[slotIndex] = null;
    }
  }

  function useSpecial(match, slotIndex, target = null, context = {}) {
    if (match.mode !== "arcane") return { ok: false, code: "wrong_mode" };
    if (match.phase !== "playing") return { ok: false, code: "wrong_phase" };
    if (!Number.isInteger(slotIndex)) return { ok: false, code: "invalid_slot" };

    const player = getPlayer(match, match.currentSeat);
    if (!player || player.shop.open) return { ok: false, code: "shop_open" };
    if (context.shotReady === false) return { ok: false, code: "shot_in_progress" };
    if (slotIndex < 0 || slotIndex >= player.inventory.length) {
      return { ok: false, code: "invalid_slot" };
    }

    const instance = player.inventory[slotIndex];
    if (!instance) return { ok: false, code: "empty_slot" };
    if (instance.cooldownTurns > 0) return { ok: false, code: "cooldown" };
    if (!SHOT_SPECIALS.has(instance.defId)) {
      return { ok: false, code: "phase_unavailable" };
    }

    if (POCKET_TARGETS.has(instance.defId)) {
      const pocketId = target && Number(target.pocketId);
      if (!Number.isInteger(pocketId) || pocketId < 0 || pocketId > 5) {
        return { ok: false, code: "target_required" };
      }
      target = { pocketId };
    }

    if (BALL_TARGETS.has(instance.defId)) {
      const ballId = target && Number(target.ballId);
      if (!Number.isInteger(ballId) || ballId <= 0) {
        return { ok: false, code: "target_required" };
      }
      target = { ballId };
    }

    if (POINT_TARGETS.has(instance.defId)) {
      const x = target && Number(target.x);
      const y = target && Number(target.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, code: "target_required" };
      }
      target = { x, y };
    }

    if (instance.defId === "portal_pocket") {
      const pocketIds = target && target.pocketIds;
      if (
        !Array.isArray(pocketIds) ||
        pocketIds.length !== 2 ||
        pocketIds[0] === pocketIds[1] ||
        pocketIds.some((id) => !Number.isInteger(Number(id)) || id < 0 || id > 5)
      ) {
        return { ok: false, code: "target_required" };
      }
      target = { pocketIds: pocketIds.map(Number) };
    }

    const owner = instance.defId === "pressure" || instance.defId === "shield_pocket"
      ? getPlayer(match, getOpponentSeat(match.currentSeat))
      : player;

    if (owner.activeEffects[instance.defId]) {
      return { ok: false, code: "already_active" };
    }

    const effect = {
      defId: instance.defId,
      name: instance.name,
      icon: instance.icon,
      sourceSeat: match.currentSeat,
      sourceUid: instance.uid,
      target
    };

    if (instance.defId === "ice_zone" || instance.defId === "sticky_zone") {
      match.zones.push({
        id: `zone_${Date.now()}_${instance.uid}`,
        type: instance.defId === "ice_zone" ? "ice" : "sticky",
        x: target.x,
        y: target.y,
        radius: CONFIG.arcane.specialEffects.zoneRadius,
        sourceSeat: match.currentSeat,
        expiresAfterTurn: match.turn.number + 1
      });
    } else {
      owner.activeEffects[instance.defId] = effect;
    }
    consumeInventoryUse(player, slotIndex, instance);

    return {
      ok: true,
      effect,
      slot: slotIndex,
      remainingUses: player.inventory[slotIndex]
        ? player.inventory[slotIndex].usesLeft
        : 0,
      appliedToSeat: owner.seat
    };
  }

  function prepareShot(match, power, spin = { x: 0, y: 0 }, context = {}) {
    const player = getPlayer(match, match.currentSeat);
    const random = context.random || Math.random;
    const effects = {};

    for (const [id, effect] of Object.entries(player.activeEffects)) {
      if (!SHOT_SPECIALS.has(id) && id !== "pressure") continue;
      effects[id] = effect;
      delete player.activeEffects[id];
    }

    effects.table_zones = match.zones.map((zone) => Object.assign({}, zone));

    let finalPower = Math.max(0, Math.min(1, Number(power) || 0));
    const finalSpin = {
      x: Math.max(-1, Math.min(1, Number(spin.x) || 0)),
      y: Math.max(-1, Math.min(1, Number(spin.y) || 0))
    };
    const notices = [];
    const settings = CONFIG.arcane.specialEffects;

    if (effects.perfect_force && Number.isFinite(context.idealPower)) {
      const idealPower = Math.max(
        settings.perfectForce.minPower,
        Math.min(settings.perfectForce.maxPower, context.idealPower)
      );
      if (Math.abs(finalPower - idealPower) <= settings.perfectForce.zoneHalfWidth) {
        finalPower = idealPower;
        notices.push({ type: "perfect_force", idealPower });
      }
    }

    if (effects.pressure) {
      const variation = (random() * 2 - 1) * settings.pressureMaxVariation;
      finalPower = Math.max(0, Math.min(1, finalPower * (1 + variation)));
      notices.push({ type: "pressure", variation });
    }

    const varianceMultiplier = effects.stabilizer
      ? settings.stabilizerVarianceMultiplier
      : 1;
    const sideVariance = (random() * 2 - 1)
      * settings.naturalSideSpinVariance
      * varianceMultiplier;
    finalSpin.x = Math.max(-1, Math.min(1, finalSpin.x + sideVariance));

    if (match.turn && match.turn.doubleShotLimited) {
      finalPower = Math.min(finalPower, settings.doubleShotMaxPower);
      match.turn.doubleShotLimited = false;
      notices.push({ type: "double_shot_limit", maxPower: settings.doubleShotMaxPower });
    }

    return { power: finalPower, spin: finalSpin, effects, notices };
  }

  function clearActiveEffect(match, seat, defId) {
    const player = getPlayer(match, seat);
    if (!player || !player.activeEffects[defId]) return false;
    delete player.activeEffects[defId];
    return true;
  }

  function rewindLastShot(match, savedMatch, ownerSeat, instanceUid, now = Date.now()) {
    const owner = getPlayer(match, ownerSeat);
    const instance = owner && owner.inventory.find((item) => item && item.uid === instanceUid);
    if (!owner || !instance || instance.defId !== "rewind") {
      return { ok: false, code: "rewind_unavailable" };
    }
    if (owner.rewindUsed) return { ok: false, code: "rewind_limit" };
    if (!savedMatch || savedMatch.currentSeat === ownerSeat) {
      return { ok: false, code: "no_opponent_shot" };
    }

    const shooterSeat = savedMatch.currentSeat;
    const eventSequence = match.arcaneEventSequence || 0;
    const restored = JSON.parse(JSON.stringify(savedMatch));
    for (const key of Object.keys(match)) delete match[key];
    Object.assign(match, restored);
    match.arcaneEventSequence = eventSequence;
    match.arcaneEventQueue = [];

    const restoredOwner = getPlayer(match, ownerSeat);
    const restoredSlot = restoredOwner.inventory.findIndex(
      (item) => item && item.uid === instanceUid
    );
    if (restoredSlot >= 0) restoredOwner.inventory[restoredSlot] = null;
    restoredOwner.rewindUsed = true;
    startTurn(match, shooterSeat, now);
    return { ok: true, shooterSeat, ownerSeat };
  }

  function timeoutTurn(match, now = Date.now(), random = Math.random) {
    if (!isTurnExpired(match, now)) return { ok: false, code: "timer_active" };
    const previousSeat = match.currentSeat;
    const nextSeat = getOpponentSeat(previousSeat);
    match.exchangeCandidateSeat = getPlayer(match, previousSeat).turnHadSuccessfulPot
      ? previousSeat
      : match.exchangeCandidateSeat;
    startTurn(match, nextSeat, now, random);
    return { ok: true, previousSeat, nextSeat };
  }

  function publicSnapshot(match) {
    return {
      mode: match.mode,
      phase: match.phase,
      currentSeat: match.currentSeat,
      openingBreakPending: isOpeningBreak(match),
      turn: match.turn
        ? {
            number: match.turn.number,
            seat: match.turn.seat,
            shotNumber: match.turn.shotNumber,
            remainingMs: getTurnRemainingMs(match)
          }
        : null,
      players: match.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        score: player.score,
        arcanaPoints: player.arcanaPoints,
        inventorySize: player.inventory.filter(Boolean).length,
        shopOpen: player.shop.open,
        visibleEffects: Object.keys(player.activeEffects).filter(
          (id) => id === "pressure" || id === "double_shot"
        )
      })),
      zones: (match.zones || []).map((zone) => Object.assign({}, zone)),
      magicBall: match.magicBall
        ? {
            id: match.magicBall.id,
            x: match.magicBall.x,
            y: match.magicBall.y,
            radius: match.magicBall.radius,
            rarity: match.magicBall.rarity,
            color: match.magicBall.color,
            spawnedTurn: match.magicBall.spawnedTurn,
            expiresAfterTurn: match.magicBall.expiresAfterTurn,
            turnsRemaining: getMagicBallTurnsRemaining(match),
            touched: match.magicBall.touched
          }
        : null,
      winnerSeat: match.winnerSeat,
      gameEndReason: match.gameEndReason
    };
  }

  function privatePlayerSnapshot(match, seat) {
    const player = getPlayer(match, seat);
    if (!player) return null;
    return {
      seat,
      arcanaPoints: player.arcanaPoints,
      inventory: player.inventory,
      shopOffers: player.shop.offers,
      shopOpen: player.shop.open,
      boughtHistory: player.boughtHistory,
      activeEffects: player.activeEffects,
      legendaryPurchased: player.legendaryPurchased
    };
  }

  return {
    createMatch,
    resetMatch,
    getPlayer,
    getOpponentSeat,
    startTurn,
    restartShotWindow,
    isOpeningBreak,
    consumeOpeningBreak,
    getTurnRemainingMs,
    pauseTurnTimer,
    resumeTurnTimer,
    isTurnExpired,
    timeoutTurn,
    openShop,
    closeShop,
    rerollShop,
    canBuySpecial,
    buySpecial,
    discardSpecial,
    useSpecial,
    prepareShot,
    getActiveEffects,
    clearActiveEffect,
    rewindLastShot,
    resolveShot,
    isMagicBallSpawnDue,
    spawnMagicBall,
    touchMagicBall,
    collectMagicBall,
    getMagicBallTurnsRemaining,
    drainArcaneEvents,
    rotateShop,
    publicSnapshot,
    privatePlayerSnapshot
  };
})(RulesDependencies.CONFIG, RulesDependencies.Specials);

if (typeof module === "object" && module.exports) {
  module.exports = Rules;
}
