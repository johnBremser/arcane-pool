const PhysicsCore = (() => {
  function createWorld(CONFIG, options = {}) {
  const random = typeof options.random === "function" ? options.random : Math.random;
  let balls = [];
  let pockets = [];
  let pocketJaws = [];
  let callbacks = {};
  let ballIdCounter = 0;

  let shotState = null;
  let shotModifiers = createDefaultShotModifiers();

  function createDefaultShotModifiers() {
    return {
      softTouch: false,
      ghostBallArmed: false,
      ghostBallId: null,
      ghostCollisionAvailable: false,
      ghostIgnoreBallId: null,
      lightMagnetPocketId: null,
      lightMagnetBallId: null,
      magneticBallId: null,
      shieldPocketId: null,
      zones: [],
      timeFreezeArmed: false,
      timeFreezeState: null,
      portalPocketIds: null,
      portalCooldownBallId: null,
      explosiveBallId: null,
      explosionTriggered: false
    };
  }

  const BALL_COLORS = {
    1: "#ffd400",
    2: "#1f6dff",
    3: "#ff3b30",
    4: "#8e2de2",
    5: "#ff8c00",
    6: "#0fa35e",
    7: "#a31621",
    8: "#111111",
    9: "#ffd400",
    10: "#1f6dff",
    11: "#ff3b30",
    12: "#8e2de2",
    13: "#ff8c00",
    14: "#0fa35e",
    15: "#a31621"
  };

  function init() {
    pockets = createPockets();
    pocketJaws = createPocketJaws();
    reset();
  }

  function createPockets() {
    const W = CONFIG.table.width;
    const H = CONFIG.table.height;

    return [
      { id: 0, type: "corner", x: 0, y: 0 },
      { id: 1, type: "side", x: W / 2, y: -12 },
      { id: 2, type: "corner", x: W, y: 0 },
      { id: 3, type: "corner", x: 0, y: H },
      { id: 4, type: "side", x: W / 2, y: H + 12 },
      { id: 5, type: "corner", x: W, y: H }
    ];
  }

  function createPocketJaws() {
    const W = CONFIG.table.width;
    const H = CONFIG.table.height;
    const geometry = CONFIG.table.pocketJaw;
    const corner = geometry.cornerMouth;
    const side = geometry.sideMouthHalf;
    const radius = geometry.radius;

    return [
      { x: corner, y: 0, radius }, { x: 0, y: corner, radius },
      { x: W - corner, y: 0, radius }, { x: W, y: corner, radius },
      { x: corner, y: H, radius }, { x: 0, y: H - corner, radius },
      { x: W - corner, y: H, radius }, { x: W, y: H - corner, radius },
      { x: W / 2 - side, y: 0, radius }, { x: W / 2 + side, y: 0, radius },
      { x: W / 2 - side, y: H, radius }, { x: W / 2 + side, y: H, radius }
    ];
  }

  function makeBall(props) {
    return Object.assign(
      {
        id: ++ballIdCounter,
        kind: "object",
        number: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        spinX: 0,
        spinY: 0,
        radius: CONFIG.balls.radius,
        active: true,
        pocketed: false,
        stripe: false,
        color: "#ffffff",
        rotation: 0,
        prevX: 0,
        prevY: 0,
        _shotTravelDistance: 0,
        _cushionSinceContact: false
      },
      props
    );
  }

  function reset() {
    ballIdCounter = 0;
    balls = [];
    shotState = null;
    shotModifiers = createDefaultShotModifiers();

    const W = CONFIG.table.width;
    const H = CONFIG.table.height;
    const r = CONFIG.balls.radius;

    balls.push(
      makeBall({
        kind: "cue",
        number: 0,
        x: W * 0.25,
        y: H / 2,
        color: "#f8f5ef"
      })
    );

    const apexX = W * 0.68;
    const centerY = H / 2;
    const spacing = r * 2 + 0.65;
    const rackNumbers = [1, 2, 3, 4, 8, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];

    let idx = 0;

    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const num = rackNumbers[idx++];
        const x = apexX + row * spacing * Math.sqrt(3) / 2;
        const y = centerY + (col - row / 2) * spacing;

        balls.push(
          makeBall({
            kind: num === 8 ? "eight" : "object",
            number: num,
            x,
            y,
            color: BALL_COLORS[num],
            stripe: num > 8
          })
        );
      }
    }
  }

  function setCallbacks(newCallbacks) {
    callbacks = Object.assign(callbacks, newCallbacks);
  }

  function setShotModifiers(modifiers = {}) {
    shotModifiers = Object.assign(createDefaultShotModifiers(), modifiers);
  }

  function getShotModifiers() {
    return shotModifiers;
  }

  function getBalls() {
    return balls;
  }

  function getPockets() {
    return pockets;
  }

  function getCueBall() {
    return balls.find((b) => b.kind === "cue");
  }

  function getMagicBall() {
    return balls.find((b) => b.active && b.kind === "magic") || null;
  }

  function ballsMoving() {
    if (shotModifiers.timeFreezeState && shotModifiers.timeFreezeState.active) {
      return true;
    }
    return balls.some(
      (b) => b.active && Math.hypot(b.vx, b.vy) > CONFIG.physics.stopSpeed
    );
  }

  function getActiveObjectBalls() {
    return balls.filter(
      (b) => b.active && (b.kind === "object" || b.kind === "eight")
    );
  }

  function findMagicBallSpawnPosition(randomFn = random) {
    const radius = CONFIG.arcane.magicBall.radius;
    const clearance = CONFIG.arcane.magicBall.spawnClearance;
    const pocketClearance = CONFIG.arcane.magicBall.pocketClearance;
    const minX = radius + 80;
    const maxX = CONFIG.table.width - radius - 80;
    const minY = radius + 70;
    const maxY = CONFIG.table.height - radius - 70;

    function positionIsFree(x, y) {
      if (pockets.some((pocket) => Math.hypot(x - pocket.x, y - pocket.y) < pocketClearance)) {
        return false;
      }
      return !balls.some((ball) => (
        ball.active &&
        Math.hypot(x - ball.x, y - ball.y) < radius + ball.radius + clearance
      ));
    }

    for (let attempt = 0; attempt < 180; attempt++) {
      const x = minX + randomFn() * (maxX - minX);
      const y = minY + randomFn() * (maxY - minY);
      if (positionIsFree(x, y)) return { x, y };
    }

    for (let y = minY; y <= maxY; y += radius * 3) {
      for (let x = minX; x <= maxX; x += radius * 3) {
        if (positionIsFree(x, y)) return { x, y };
      }
    }

    return null;
  }

  function addMagicBall(source) {
    if (!source || getMagicBall()) return null;
    const x = Number(source.x);
    const y = Number(source.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const ball = makeBall({
      kind: "magic",
      number: 0,
      x,
      y,
      radius: Number(source.radius) || CONFIG.arcane.magicBall.radius,
      color: source.color || CONFIG.arcane.magicBall.colors.common,
      magicBallId: source.id,
      magicRarity: source.rarity || "common",
      stripe: false
    });
    balls.push(ball);
    return ball;
  }

  function removeMagicBall(magicBallId) {
    const index = balls.findIndex((ball) => (
      ball.kind === "magic" && (!magicBallId || ball.magicBallId === magicBallId)
    ));
    if (index < 0) return false;
    balls.splice(index, 1);
    return true;
  }

  function isPositionBlocked(x, y, ignoreBall) {
    return balls.some((b) => {
      if (!b.active || b === ignoreBall) return false;
      const minDist = b.radius + (ignoreBall ? ignoreBall.radius : CONFIG.balls.radius) + 1;
      return Math.hypot(b.x - x, b.y - y) < minDist;
    });
  }

  function respawnCue() {
    const cue = getCueBall();
    if (!cue) return;

    cue.active = true;
    cue.pocketed = false;
    cue.vx = 0;
    cue.vy = 0;
    cue.spinX = 0;
    cue.spinY = 0;

    const W = CONFIG.table.width;
    const H = CONFIG.table.height;

    let x = W * 0.25;
    let y = H / 2;

    if (isPositionBlocked(x, y, cue)) {
      for (let i = 0; i < 300; i++) {
        const tx = W * (0.12 + random() * 0.28);
        const ty = H * (0.16 + random() * 0.68);

        if (!isPositionBlocked(tx, ty, cue)) {
          x = tx;
          y = ty;
          break;
        }
      }
    }

    cue.x = x;
    cue.y = y;
  }

  function shoot(angle, power, spin, options = {}) {
    const cue = getCueBall();

    if (!cue || !cue.active || ballsMoving()) {
      return false;
    }

    const clampedPower = Math.max(0, Math.min(1, power));
    const highPowerBoost = CONFIG.physics.highPowerBoost
      * Math.pow(clampedPower, CONFIG.physics.highPowerExponent);
    const openingMultiplier = options.openingBreak
      ? CONFIG.input.openingBreak.powerMultiplier
      : 1;
    const speed = clampedPower
      * CONFIG.physics.maxShotSpeed
      * (1 + highPowerBoost)
      * openingMultiplier;

    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    cue.spinX = spin ? spin.x : 0;
    cue.spinY = spin ? spin.y : 0;

    startShotTracking(cue);

    if (callbacks.onShot) {
      callbacks.onShot({ angle, power: clampedPower, spin });
    }

    return true;
  }

  function startShotTracking(cue) {
    shotState = {
      active: true,
      cueBallStartPos: { x: cue.x, y: cue.y },
      firstContactBall: null,
      cushionAfterContact: false,
      anyCushionAfterContact: false,
      pottedBalls: [],
      magicBallsTouched: [],
      cuePocketed: false
    };

    for (const ball of balls) {
      ball._cushionSinceContact = false;
      ball._shotTravelDistance = 0;
    }

    if (callbacks.onShotStarted) {
      callbacks.onShotStarted(shotState);
    }
  }

  function getShotState() {
    return shotState;
  }

  function consumeShotState() {
    const result = shotState;
    shotState = null;
    shotModifiers = createDefaultShotModifiers();
    return result;
  }

  function step(dt) {
    if (advanceTimeFreeze(dt)) return;

    for (const ball of balls) {
      if (!ball.active) continue;

      ball.prevX = ball.x;
      ball.prevY = ball.y;

      applySpinMovement(ball, dt);
      applySpecialForces(ball, dt);

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      const dx = ball.x - ball.prevX;
      const dy = ball.y - ball.prevY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        ball.rotation += dist / ball.radius;
        if (shotState && shotState.active) {
          ball._shotTravelDistance += dist;
        }
      }

      const frictionMultiplier = shotState && shotState.active && ball.kind === "cue" && shotModifiers.softTouch
        ? CONFIG.arcane.specialEffects.softTouchFrictionMultiplier
        : 1;
      const frictionFactor = Math.exp(-CONFIG.physics.friction * frictionMultiplier * dt);
      ball.vx *= frictionFactor;
      ball.vy *= frictionFactor;
      ball.spinX *= Math.exp(-CONFIG.physics.spin.decay * dt);
      ball.spinY *= Math.exp(-CONFIG.physics.spin.decay * dt);

      const speed = Math.hypot(ball.vx, ball.vy);

      if (speed < CONFIG.physics.stopSpeed) {
        ball.vx = 0;
        ball.vy = 0;

        if (Math.abs(ball.spinX) < 0.02) ball.spinX = 0;
        if (Math.abs(ball.spinY) < 0.02) ball.spinY = 0;
      }

      collidePocketJaws(ball);
      handlePocketMouth(ball);
      if (!ball.active) continue;

      collideCushions(ball);
      if (!ball.active) continue;

      hardClamp(ball);
    }

    resolveBallCollisions();
  }

  function applySpecialForces(ball, dt) {
    applyZoneFriction(ball, dt);

    if (ball.id === shotModifiers.magneticBallId) {
      applyPocketAttraction(
        ball,
        CONFIG.arcane.specialEffects.magneticBallRangeBeyondPocket,
        CONFIG.arcane.specialEffects.magneticBallAcceleration,
        nearestPocket(ball)
      );
    }

    if (
      !shotState ||
      !shotState.active ||
      ball.id !== shotModifiers.lightMagnetBallId ||
      !Number.isInteger(shotModifiers.lightMagnetPocketId)
    ) {
      return;
    }

    const pocket = pockets.find((item) => item.id === shotModifiers.lightMagnetPocketId);
    if (!pocket) return;

    const dx = pocket.x - ball.x;
    const dy = pocket.y - ball.y;
    const dist = Math.hypot(dx, dy);
    const range = CONFIG.table.captureRadius
      + CONFIG.arcane.specialEffects.lightMagnetRangeBeyondPocket;

    if (dist <= CONFIG.table.captureRadius || dist > range) return;

    const acceleration = CONFIG.arcane.specialEffects.lightMagnetAcceleration;
    ball.vx += dx / dist * acceleration * dt;
    ball.vy += dy / dist * acceleration * dt;
  }

  function applyPocketAttraction(ball, extraRange, acceleration, pocket) {
    if (!pocket) return;
    const dx = pocket.x - ball.x;
    const dy = pocket.y - ball.y;
    const dist = Math.hypot(dx, dy);
    const range = CONFIG.table.captureRadius + extraRange;
    if (dist <= CONFIG.table.captureRadius || dist > range) return;
    ball.vx += dx / dist * acceleration * CONFIG.physics.fixedDt;
    ball.vy += dy / dist * acceleration * CONFIG.physics.fixedDt;
  }

  function applyZoneFriction(ball, dt) {
    for (const zone of shotModifiers.zones || []) {
      if (Math.hypot(ball.x - zone.x, ball.y - zone.y) > zone.radius) continue;
      const multiplier = zone.type === "ice"
        ? CONFIG.arcane.specialEffects.iceZoneFrictionMultiplier
        : CONFIG.arcane.specialEffects.stickyZoneFrictionMultiplier;
      const correction = Math.exp(-CONFIG.physics.friction * (multiplier - 1) * dt);
      ball.vx *= correction;
      ball.vy *= correction;
    }
  }

  function applySpinMovement(ball, dt) {
    if (ball.kind !== "cue") return;

    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed <= CONFIG.physics.stopSpeed) return;

    const dirX = ball.vx / speed;
    const dirY = ball.vy / speed;

    if (Math.abs(ball.spinY) > 0.01) {
      const follow = CONFIG.physics.spin.follow;
      ball.vx += dirX * ball.spinY * follow * dt;
      ball.vy += dirY * ball.spinY * follow * dt;
    }

    if (Math.abs(ball.spinX) > 0.01) {
      const perpX = -dirY;
      const perpY = dirX;
      const curve = CONFIG.physics.spin.curve;
      ball.vx += perpX * ball.spinX * curve * dt;
      ball.vy += perpY * ball.spinX * curve * dt;
    }
  }

  function handlePocketMouth(ball) {
    const captureRadius = CONFIG.table.captureRadius;

    for (const pocket of pockets) {
      const dx = ball.x - pocket.x;
      const dy = ball.y - pocket.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= captureRadius) {
        pocketBall(ball, pocket);
        return;
      }
    }
  }

  function collidePocketJaws(ball) {
    const geometry = CONFIG.table.pocketJaw;

    for (const jaw of pocketJaws) {
      let dx = ball.x - jaw.x;
      let dy = ball.y - jaw.y;
      let dist = Math.hypot(dx, dy);
      const minDist = ball.radius + jaw.radius;
      if (dist >= minDist) continue;

      if (dist < 0.001) {
        dx = CONFIG.table.width / 2 - jaw.x;
        dy = CONFIG.table.height / 2 - jaw.y;
        dist = Math.hypot(dx, dy) || 1;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      ball.x += nx * (overlap + 0.05);
      ball.y += ny * (overlap + 0.05);

      const normalSpeed = ball.vx * nx + ball.vy * ny;
      if (normalSpeed >= 0) continue;

      const tx = -ny;
      const ty = nx;
      const tangentSpeed = (ball.vx * tx + ball.vy * ty) * geometry.tangentRetention;
      const reflectedNormal = -normalSpeed * geometry.restitution;
      ball.vx = nx * reflectedNormal + tx * tangentSpeed;
      ball.vy = ny * reflectedNormal + ty * tangentSpeed;
      ball.spinX *= 0.65;

      emitCushion(ball, Math.abs(normalSpeed));
      markCushionOnBall(ball);
    }
  }

  function pocketBall(ball, pocket) {
    if (!ball.active) return;

    if (tryPortalPocket(ball, pocket) || tryShieldPocket(ball, pocket)) {
      return;
    }

    ball.active = false;
    ball.pocketed = true;
    ball.vx = 0;
    ball.vy = 0;

    if (shotState && shotState.active) {
      const shotDistance = ball._shotTravelDistance || 0;

      const record = {
        ballId: ball.id,
        ballNumber: ball.number,
        kind: ball.kind,
        color: ball.color,
        pocketId: pocket.id,
        shotDistance: shotDistance,
        cushionAfterContact: !!ball._cushionSinceContact
      };

      if (ball.kind === "magic") {
        record.magicBallId = ball.magicBallId;
        record.magicRarity = ball.magicRarity;
      }

      shotState.pottedBalls.push(record);

      if (ball.kind === "cue") {
        shotState.cuePocketed = true;
      }
    }

    if (callbacks.onPocket) {
      callbacks.onPocket(ball, pocket);
    }
  }

  function tryShieldPocket(ball, pocket) {
    if (ball.kind === "cue" || pocket.id !== shotModifiers.shieldPocketId) {
      return false;
    }

    const inwardX = CONFIG.table.width / 2 - pocket.x;
    const inwardY = CONFIG.table.height / 2 - pocket.y;
    const length = Math.hypot(inwardX, inwardY) || 1;
    const speed = Math.max(90, Math.hypot(ball.vx, ball.vy) * 0.45);
    const distance = CONFIG.table.captureRadius + ball.radius + 12;
    ball.x = pocket.x + inwardX / length * distance;
    ball.y = pocket.y + inwardY / length * distance;
    ball.vx = inwardX / length * speed;
    ball.vy = inwardY / length * speed;
    if (callbacks.onSpecialPhysicsEvent) {
      callbacks.onSpecialPhysicsEvent("shield_block", { ball, pocket });
    }
    return true;
  }

  function tryPortalPocket(ball, pocket) {
    const pair = shotModifiers.portalPocketIds;
    if (!Array.isArray(pair) || !pair.includes(pocket.id)) return false;
    if (shotModifiers.portalCooldownBallId === ball.id) {
      shotModifiers.portalCooldownBallId = null;
      return false;
    }

    const exitId = pair[0] === pocket.id ? pair[1] : pair[0];
    const exit = pockets.find((item) => item.id === exitId);
    if (!exit) return false;

    const inwardX = CONFIG.table.width / 2 - exit.x;
    const inwardY = CONFIG.table.height / 2 - exit.y;
    const length = Math.hypot(inwardX, inwardY) || 1;
    const speed = Math.max(70, Math.hypot(ball.vx, ball.vy)
      * CONFIG.arcane.specialEffects.portalExitSpeedMultiplier);
    const distance = CONFIG.table.captureRadius + ball.radius + 10;
    ball.x = exit.x + inwardX / length * distance;
    ball.y = exit.y + inwardY / length * distance;
    ball.vx = inwardX / length * speed;
    ball.vy = inwardY / length * speed;
    shotModifiers.portalCooldownBallId = ball.id;

    if (callbacks.onSpecialPhysicsEvent) {
      callbacks.onSpecialPhysicsEvent("portal", { ball, pocket, exit });
    }
    return true;
  }

  function isOpenPocketArea(ball, wall) {
    const W = CONFIG.table.width;
    const H = CONFIG.table.height;
    const corner = CONFIG.table.pocketJaw.cornerMouth;
    const side = CONFIG.table.pocketJaw.sideMouthHalf;

    if (wall === "top" || wall === "bottom") {
      return ball.x < corner
        || ball.x > W - corner
        || Math.abs(ball.x - W / 2) < side;
    }

    if (wall === "left" || wall === "right") {
      return ball.y < corner || ball.y > H - corner;
    }

    return false;
  }

  function collideCushions(ball) {
    const W = CONFIG.table.width;
    const H = CONFIG.table.height;
    const r = ball.radius;
    const rest = CONFIG.physics.restitutionCushion;

    if (tryGhostCushionPass(ball)) {
      return;
    }

    if (ball.x < r && !isOpenPocketArea(ball, "left")) {
      const strength = Math.abs(ball.vx);
      ball.x = r;
      ball.vx = Math.abs(ball.vx) * rest;
      applyCushionSpin(ball, "vertical");
      emitCushion(ball, strength);
      markCushionOnBall(ball);
    }

    if (ball.x > W - r && !isOpenPocketArea(ball, "right")) {
      const strength = Math.abs(ball.vx);
      ball.x = W - r;
      ball.vx = -Math.abs(ball.vx) * rest;
      applyCushionSpin(ball, "vertical");
      emitCushion(ball, strength);
      markCushionOnBall(ball);
    }

    if (ball.y < r && !isOpenPocketArea(ball, "top")) {
      const strength = Math.abs(ball.vy);
      ball.y = r;
      ball.vy = Math.abs(ball.vy) * rest;
      applyCushionSpin(ball, "horizontal");
      emitCushion(ball, strength);
      markCushionOnBall(ball);
    }

    if (ball.y > H - r && !isOpenPocketArea(ball, "bottom")) {
      const strength = Math.abs(ball.vy);
      ball.y = H - r;
      ball.vy = -Math.abs(ball.vy) * rest;
      applyCushionSpin(ball, "horizontal");
      emitCushion(ball, strength);
      markCushionOnBall(ball);
    }
  }

  function tryGhostCushionPass(ball) {
    if (
      ball.id !== shotModifiers.ghostBallId ||
      !shotModifiers.ghostCollisionAvailable
    ) {
      return false;
    }

    const W = CONFIG.table.width;
    const H = CONFIG.table.height;
    const r = ball.radius;
    let wall = null;

    if (ball.x < r && !isOpenPocketArea(ball, "left")) {
      ball.x = W - r - 1;
      wall = "left";
    } else if (ball.x > W - r && !isOpenPocketArea(ball, "right")) {
      ball.x = r + 1;
      wall = "right";
    } else if (ball.y < r && !isOpenPocketArea(ball, "top")) {
      ball.y = H - r - 1;
      wall = "top";
    } else if (ball.y > H - r && !isOpenPocketArea(ball, "bottom")) {
      ball.y = r + 1;
      wall = "bottom";
    }

    if (!wall) return false;

    shotModifiers.ghostCollisionAvailable = false;
    if (callbacks.onSpecialPhysicsEvent) {
      callbacks.onSpecialPhysicsEvent("ghost_pass", { ball, wall });
    }
    return true;
  }

  function markCushionOnBall(ball) {
    if (!shotState || !shotState.active) return;
    if (ball.kind === "cue") return;

    ball._cushionSinceContact = true;

    if (shotState.firstContactBall) {
      shotState.cushionAfterContact = true;
    }
  }

  function applyCushionSpin(ball, orientation) {
    if (Math.abs(ball.spinX) < 0.01) return;

    const english = CONFIG.physics.spin.cushionEnglish;

    if (orientation === "vertical") {
      ball.vy += ball.spinX * english;
    } else {
      ball.vx += ball.spinX * english;
    }

    ball.spinX *= 0.72;
  }

  function emitCushion(ball, strength) {
    if (strength < 18) return;

    if (callbacks.onCushion) {
      callbacks.onCushion(ball, strength);
    }
  }

  function hardClamp(ball) {
    const W = CONFIG.table.width;
    const H = CONFIG.table.height;
    const r = ball.radius;
    const out = CONFIG.table.pocketRadius * 1.6;

    if (ball.x < -out || ball.x > W + out || ball.y < -out || ball.y > H + out) {
      const nearest = nearestPocket(ball);
      const dist = nearest ? Math.hypot(ball.x - nearest.x, ball.y - nearest.y) : Infinity;

      if (dist <= CONFIG.table.captureRadius + ball.radius * 0.45) {
        pocketBall(ball, nearest);
        return;
      }

      ball.x = Math.max(r, Math.min(W - r, ball.x));
      ball.y = Math.max(r, Math.min(H - r, ball.y));

      if (ball.x === r) ball.vx = Math.abs(ball.vx);
      if (ball.x === W - r) ball.vx = -Math.abs(ball.vx);
      if (ball.y === r) ball.vy = Math.abs(ball.vy);
      if (ball.y === H - r) ball.vy = -Math.abs(ball.vy);
    }
  }

  function nearestPocket(ball) {
    let best = null;
    let bestDist = Infinity;

    for (const pocket of pockets) {
      const dist = Math.hypot(ball.x - pocket.x, ball.y - pocket.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = pocket;
      }
    }

    return best;
  }

  function resolveBallCollisions() {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.active) continue;

      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.active) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius;
        let dist = Math.hypot(dx, dy);

        if (dist === 0) {
          dist = 0.001;
          b.x += 0.001;
        }

        if (shouldSkipGhostBallCollision(a, b, dist, minDist)) {
          continue;
        }

        if (dist >= minDist) continue;

        trackMagicBallTouch(a, b);

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal >= 0) continue;

        const e = CONFIG.physics.restitutionBall;
        const impulse = (-(1 + e) * velAlongNormal) / 2;

        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;

        const strength = Math.abs(velAlongNormal);

        if (a.kind === "cue" || b.kind === "cue") {
          const cue = a.kind === "cue" ? a : b;
          const other = a.kind === "cue" ? b : a;
          const normalFromCueToObject =
            a.kind === "cue"
              ? { x: nx, y: ny }
              : { x: -nx, y: -ny };

          applyCueCollisionSpin(cue, normalFromCueToObject, strength);

          if (shotState && shotState.active && shotState.firstContactBall === null) {
            shotState.firstContactBall = other;
            shotState.firstContactStrength = strength;

            if (shotModifiers.ghostBallArmed) {
              shotModifiers.ghostBallId = other.id;
              shotModifiers.ghostCollisionAvailable = true;
            }

            if (Number.isInteger(shotModifiers.lightMagnetPocketId)) {
              shotModifiers.lightMagnetBallId = other.id;
            }

            if (shotModifiers.magneticBallId === other.id) {
              // O alvo magnético já foi escolhido antes da tacada.
            }

            if (
              shotModifiers.explosiveBallId === other.id &&
              !shotModifiers.explosionTriggered
            ) {
              triggerExplosion(other);
            }

            if (shotModifiers.timeFreezeArmed) {
              beginTimeFreeze(cue);
            }

            if (callbacks.onFirstContact) {
              callbacks.onFirstContact(cue, other, strength);
            }
          }
        }

        if (callbacks.onBallCollision) {
          callbacks.onBallCollision(a, b, strength);
        }
      }
    }
  }

  function trackMagicBallTouch(a, b) {
    if (!shotState || !shotState.active) return;
    const magic = a.kind === "magic" ? a : b.kind === "magic" ? b : null;
    if (!magic) return;

    if (!shotState.magicBallsTouched.includes(magic.magicBallId)) {
      shotState.magicBallsTouched.push(magic.magicBallId);
      if (callbacks.onSpecialPhysicsEvent) {
        callbacks.onSpecialPhysicsEvent("magic_ball_touch", { ball: magic });
      }
    }
  }

  function shouldSkipGhostBallCollision(a, b, dist, minDist) {
    const ghostId = shotModifiers.ghostBallId;
    if (!ghostId) return false;

    const ghost = a.id === ghostId ? a : b.id === ghostId ? b : null;
    if (!ghost) return false;

    const other = ghost === a ? b : a;
    if (other.kind === "cue") return false;

    if (shotModifiers.ghostIgnoreBallId === other.id) {
      if (dist < minDist) return true;
      shotModifiers.ghostIgnoreBallId = null;
      return false;
    }

    if (!shotModifiers.ghostCollisionAvailable || dist >= minDist) {
      return false;
    }

    shotModifiers.ghostCollisionAvailable = false;
    shotModifiers.ghostIgnoreBallId = other.id;

    if (callbacks.onSpecialPhysicsEvent) {
      callbacks.onSpecialPhysicsEvent("ghost_pass", { ball: ghost, other });
    }

    return true;
  }

  function triggerExplosion(centerBall) {
    shotModifiers.explosionTriggered = true;
    const radius = CONFIG.arcane.specialEffects.explosiveRadius;
    const impulse = CONFIG.arcane.specialEffects.explosiveImpulse;

    for (const ball of balls) {
      if (!ball.active || ball === centerBall) continue;
      const dx = ball.x - centerBall.x;
      const dy = ball.y - centerBall.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 0.001 || dist > radius) continue;
      const strength = impulse * (1 - dist / radius);
      ball.vx += dx / dist * strength;
      ball.vy += dy / dist * strength;
    }

    if (callbacks.onSpecialPhysicsEvent) {
      callbacks.onSpecialPhysicsEvent("explosion", { ball: centerBall, radius });
    }
  }

  function beginTimeFreeze(cue) {
    shotModifiers.timeFreezeArmed = false;
    shotModifiers.timeFreezeState = {
      active: true,
      remaining: CONFIG.arcane.specialEffects.timeFreezeSeconds,
      cueBallId: cue.id,
      cueDirection: Math.atan2(cue.vy, cue.vx),
      velocities: balls.map((ball) => ({
        id: ball.id,
        vx: ball.vx,
        vy: ball.vy
      }))
    };

    for (const ball of balls) {
      ball.vx = 0;
      ball.vy = 0;
    }

    if (callbacks.onSpecialPhysicsEvent) {
      callbacks.onSpecialPhysicsEvent("time_freeze_started", {
        remaining: shotModifiers.timeFreezeState.remaining,
        cue
      });
    }
  }

  function advanceTimeFreeze(dt) {
    const state = shotModifiers.timeFreezeState;
    if (!state || !state.active) return false;
    state.remaining = Math.max(0, state.remaining - dt);
    if (state.remaining <= 0) releaseTimeFreeze();
    return true;
  }

  function releaseTimeFreeze() {
    const state = shotModifiers.timeFreezeState;
    if (!state || !state.active) return false;

    for (const saved of state.velocities) {
      const ball = balls.find((item) => item.id === saved.id);
      if (!ball || !ball.active) continue;
      ball.vx = saved.vx;
      ball.vy = saved.vy;
    }

    const cue = balls.find((ball) => ball.id === state.cueBallId);
    const savedCue = state.velocities.find((item) => item.id === state.cueBallId);
    if (cue && savedCue) {
      const speed = Math.hypot(savedCue.vx, savedCue.vy);
      cue.vx = Math.cos(state.cueDirection) * speed;
      cue.vy = Math.sin(state.cueDirection) * speed;
    }

    state.active = false;
    if (callbacks.onSpecialPhysicsEvent) {
      callbacks.onSpecialPhysicsEvent("time_freeze_finished", { cue });
    }
    return true;
  }

  function getTimeFreezeState() {
    return shotModifiers.timeFreezeState;
  }

  function setFrozenCueDirection(angle) {
    const state = shotModifiers.timeFreezeState;
    if (!state || !state.active || !Number.isFinite(angle)) return false;
    state.cueDirection = angle;
    return true;
  }

  function canPlaceCueAt(x, y) {
    const cue = getCueBall();
    const r = cue ? cue.radius : CONFIG.balls.radius;
    return !(
      !cue ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < r || x > CONFIG.table.width - r ||
      y < r || y > CONFIG.table.height - r ||
      isPositionBlocked(x, y, cue) ||
      pockets.some((pocket) => Math.hypot(x - pocket.x, y - pocket.y) < CONFIG.table.pocketRadius + r)
    );
  }

  function moveCueTo(x, y) {
    const cue = getCueBall();
    if (!canPlaceCueAt(x, y)) return false;
    cue.x = x;
    cue.y = y;
    cue.vx = 0;
    cue.vy = 0;
    return true;
  }

  function swapCueWithBall(ballId) {
    const cue = getCueBall();
    const target = balls.find(
      (ball) => ball.id === ballId && ball.active && ball.kind !== "cue"
    );
    if (!cue || !target || ballsMoving()) return false;
    const cueX = cue.x;
    const cueY = cue.y;
    cue.x = target.x;
    cue.y = target.y;
    target.x = cueX;
    target.y = cueY;
    return true;
  }

  function applyCueCollisionSpin(cue, normalFromCueToObject, strength) {
    if (Math.abs(cue.spinY) > 0.01) {
      const factor =
        CONFIG.physics.spin.follow *
        Math.min(1, strength / 760 + 0.22);

      cue.vx += normalFromCueToObject.x * cue.spinY * factor;
      cue.vy += normalFromCueToObject.y * cue.spinY * factor;
      cue.spinY *= 0.62;
    }

    if (Math.abs(cue.spinX) > 0.01) {
      const tangentX = -normalFromCueToObject.y;
      const tangentY = normalFromCueToObject.x;
      const english = CONFIG.physics.spin.collisionEnglish;

      cue.vx += tangentX * cue.spinX * english;
      cue.vy += tangentY * cue.spinX * english;
      cue.spinX *= 0.72;
    }
  }

  function hasClearShot(padding = 0) {
    const cue = getCueBall();
    if (!cue || !cue.active) return false;

    const objectTargets = balls.filter(
      (ball) => ball.active && ball.kind === "object"
    );
    const targets = objectTargets.length > 0
      ? objectTargets
      : balls.filter((ball) => ball.active && ball.kind === "eight");

    for (const target of targets) {
      const dx = target.x - cue.x;
      const dy = target.y - cue.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared <= 0.0001) continue;

      let blocked = false;

      for (const obstacle of balls) {
        if (!obstacle.active || obstacle === cue || obstacle === target) continue;

        const projection =
          ((obstacle.x - cue.x) * dx + (obstacle.y - cue.y) * dy) /
          lengthSquared;

        if (projection <= 0 || projection >= 1) continue;

        const closestX = cue.x + dx * projection;
        const closestY = cue.y + dy * projection;
        const clearance = cue.radius + obstacle.radius + padding;

        if (Math.hypot(obstacle.x - closestX, obstacle.y - closestY) < clearance) {
          blocked = true;
          break;
        }
      }

      if (!blocked) return true;
    }

    return false;
  }

  function getSnapshot() {
    return balls.map((ball) => ({
      id: ball.id,
      kind: ball.kind,
      number: ball.number,
      x: ball.x,
      y: ball.y,
      vx: ball.vx,
      vy: ball.vy,
      spinX: ball.spinX,
      spinY: ball.spinY,
      radius: ball.radius,
      active: ball.active,
      pocketed: ball.pocketed,
      stripe: ball.stripe,
      color: ball.color,
      rotation: ball.rotation,
      magicBallId: ball.magicBallId || null,
      magicRarity: ball.magicRarity || null
    }));
  }

  function loadSnapshot(snapshot) {
    if (!Array.isArray(snapshot)) return false;

    balls = snapshot.map((source) => makeBall({
      id: Number(source.id),
      kind: source.kind,
      number: Number(source.number),
      x: Number(source.x),
      y: Number(source.y),
      vx: Number(source.vx) || 0,
      vy: Number(source.vy) || 0,
      spinX: Number(source.spinX) || 0,
      spinY: Number(source.spinY) || 0,
      radius: Number(source.radius) || CONFIG.balls.radius,
      active: source.active !== false,
      pocketed: source.pocketed === true,
      stripe: source.stripe === true,
      color: source.color || "#ffffff",
      rotation: Number(source.rotation) || 0,
      magicBallId: source.magicBallId || null,
      magicRarity: source.magicRarity || null,
      prevX: Number(source.x),
      prevY: Number(source.y)
    }));

    ballIdCounter = balls.reduce((max, ball) => Math.max(max, ball.id), 0);
    shotState = null;
    return true;
  }

  function raycastAim(angle, maxLength = 1400) {
    const cue = getCueBall();

    if (!cue || !cue.active) {
      return null;
    }

    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let bestT = maxLength;
    let hitBall = null;

    const W = CONFIG.table.width;
    const H = CONFIG.table.height;
    const r = cue.radius;

    if (dirX > 1e-6) {
      const t = (W - r - cue.x) / dirX;
      if (t > 0 && t < bestT) {
        bestT = t;
        hitBall = null;
      }
    } else if (dirX < -1e-6) {
      const t = (r - cue.x) / dirX;
      if (t > 0 && t < bestT) {
        bestT = t;
        hitBall = null;
      }
    }

    if (dirY > 1e-6) {
      const t = (H - r - cue.y) / dirY;
      if (t > 0 && t < bestT) {
        bestT = t;
        hitBall = null;
      }
    } else if (dirY < -1e-6) {
      const t = (r - cue.y) / dirY;
      if (t > 0 && t < bestT) {
        bestT = t;
        hitBall = null;
      }
    }

    for (const ball of balls) {
      if (!ball.active || ball.kind === "cue") continue;

      const ox = ball.x - cue.x;
      const oy = ball.y - cue.y;
      const b = ox * dirX + oy * dirY;

      if (b < 0) continue;

      const radiusSum = cue.radius + ball.radius;
      const c = ox * ox + oy * oy - radiusSum * radiusSum;
      const disc = b * b - c;

      if (disc < 0) continue;

      const t = b - Math.sqrt(disc);

      if (t > 0 && t < bestT) {
        bestT = t;
        hitBall = ball;
      }
    }

    return {
      x: cue.x + dirX * bestT,
      y: cue.y + dirY * bestT,
      t: bestT,
      ball: hitBall
    };
  }

  function traceAim(angle, maxLength = 1400, maxBounces = 0) {
    const cue = getCueBall();
    if (!cue || !cue.active) return [];

    const segments = [];
    let originX = cue.x;
    let originY = cue.y;
    let dirX = Math.cos(angle);
    let dirY = Math.sin(angle);
    let remaining = maxLength;

    for (let bounce = 0; bounce <= maxBounces && remaining > 1; bounce++) {
      const hit = castAimSegment(originX, originY, dirX, dirY, remaining, cue);
      if (!hit) break;

      segments.push({
        startX: originX,
        startY: originY,
        endX: hit.x,
        endY: hit.y,
        distance: hit.t,
        ball: hit.ball,
        wall: hit.wall
      });

      remaining -= hit.t;
      if (hit.ball || !hit.wall || bounce === maxBounces) break;

      if (hit.wall === "left" || hit.wall === "right") {
        dirX *= -1;
      } else {
        dirY *= -1;
      }

      originX = hit.x + dirX * 0.5;
      originY = hit.y + dirY * 0.5;
      remaining -= 0.5;
    }

    return segments;
  }

  function castAimSegment(originX, originY, dirX, dirY, maxLength, cue) {
    let bestT = maxLength;
    let hitBall = null;
    let wall = null;
    const W = CONFIG.table.width;
    const H = CONFIG.table.height;
    const r = cue.radius;

    const wallCandidates = [
      { wall: "right", t: dirX > 1e-6 ? (W - r - originX) / dirX : Infinity },
      { wall: "left", t: dirX < -1e-6 ? (r - originX) / dirX : Infinity },
      { wall: "bottom", t: dirY > 1e-6 ? (H - r - originY) / dirY : Infinity },
      { wall: "top", t: dirY < -1e-6 ? (r - originY) / dirY : Infinity }
    ];

    for (const candidate of wallCandidates) {
      if (candidate.t > 0.001 && candidate.t < bestT) {
        bestT = candidate.t;
        wall = candidate.wall;
      }
    }

    for (const ball of balls) {
      if (!ball.active || ball === cue) continue;
      const ox = ball.x - originX;
      const oy = ball.y - originY;
      const projected = ox * dirX + oy * dirY;
      if (projected < 0) continue;

      const radiusSum = cue.radius + ball.radius;
      const c = ox * ox + oy * oy - radiusSum * radiusSum;
      const disc = projected * projected - c;
      if (disc < 0) continue;

      const t = projected - Math.sqrt(disc);
      if (t > 0.001 && t < bestT) {
        bestT = t;
        hitBall = ball;
        wall = null;
      }
    }

    return {
      x: originX + dirX * bestT,
      y: originY + dirY * bestT,
      t: bestT,
      ball: hitBall,
      wall
    };
  }

  return {
    init,
    reset,
    step,
    shoot,
    setCallbacks,
    setShotModifiers,
    getShotModifiers,
    getTimeFreezeState,
    setFrozenCueDirection,
    releaseTimeFreeze,
    getBalls,
    getPockets,
    getCueBall,
    getMagicBall,
    getActiveObjectBalls,
    ballsMoving,
    respawnCue,
    findMagicBallSpawnPosition,
    addMagicBall,
    removeMagicBall,
    canPlaceCueAt,
    moveCueTo,
    swapCueWithBall,
    raycastAim,
    traceAim,
    hasClearShot,
    getSnapshot,
    loadSnapshot,
    getShotState,
    consumeShotState
  };
  }

  return {
    createWorld
  };
})();

const Physics = typeof module === "object" && module.exports
  ? null
  : PhysicsCore.createWorld(CONFIG);

if (typeof module === "object" && module.exports) {
  module.exports = PhysicsCore;
}
