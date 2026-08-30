const ArcaneAIDependencies = typeof module === "object" && module.exports
  ? { CONFIG: require("./config.js") }
  : { CONFIG };

const ArcaneAI = ((CONFIG) => {
  const DIFFICULTIES = {
    easy: {
      label: "Fácil",
      aimError: 0.025,
      powerError: 0.08,
      candidatePool: 4,
      thinkMs: 1050,
      breakPower: 0.88,
      specialChance: 0.30,
      magicBallChance: 0.45
    },
    normal: {
      label: "Normal",
      aimError: 0.010,
      powerError: 0.035,
      candidatePool: 2,
      thinkMs: 850,
      breakPower: 0.94,
      specialChance: 0.58,
      magicBallChance: 1
    },
    hard: {
      label: "Difícil",
      aimError: 0.0035,
      powerError: 0.012,
      candidatePool: 1,
      thinkMs: 650,
      breakPower: 1,
      specialChance: 0.82,
      magicBallChance: 1
    }
  };

  const SPECIAL_UTILITY = {
    explosive_ball: 100,
    magnetic_ball: 94,
    golden_pocket: 90,
    light_magnet: 86,
    ghost_ball: 82,
    perfect_force: 78,
    double_shot: 76,
    stabilizer: 70,
    soft_touch: 68,
    pressure: 66,
    shield_pocket: 52,
    ice_zone: 48,
    sticky_zone: 46,
    portal_pocket: 44
  };

  function normalizeDifficulty(value) {
    return Object.prototype.hasOwnProperty.call(DIFFICULTIES, value)
      ? value
      : "normal";
  }

  function randomSigned(random) {
    return ((random() + random() + random() + random()) - 2) / 2;
  }

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0.0001) return distance(point, start);
    const projection = Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
    ));
    return Math.hypot(
      point.x - (start.x + dx * projection),
      point.y - (start.y + dy * projection)
    );
  }

  function pathIsClear(start, end, balls, excludedIds, movingRadius, padding = 2) {
    const pathLength = distance(start, end);
    for (const obstacle of balls) {
      if (!obstacle.active || excludedIds.has(obstacle.id)) continue;
      const along = pathLength <= 0.0001 ? 0 : (
        ((obstacle.x - start.x) * (end.x - start.x)
          + (obstacle.y - start.y) * (end.y - start.y)) / (pathLength * pathLength)
      );
      if (along <= 0.02 || along >= 0.98) continue;
      const clearance = movingRadius + obstacle.radius + padding;
      if (distanceToSegment(obstacle, start, end) < clearance) return false;
    }
    return true;
  }

  function eligibleTargets(balls) {
    const normalBalls = balls.filter((ball) => (
      ball.active && ball.kind === "object" && ball.number !== 8
    ));
    if (normalBalls.length > 0) return normalBalls;
    return balls.filter((ball) => ball.active && ball.kind === "eight");
  }

  function buildDirectCandidates(cue, targets, balls, pockets) {
    const candidates = [];
    const tableWidth = CONFIG.table.width;
    const tableHeight = CONFIG.table.height;

    for (const target of targets) {
      for (const pocket of pockets) {
        const pocketDistance = distance(target, pocket);
        if (pocketDistance < 1) continue;
        const toPocketX = (pocket.x - target.x) / pocketDistance;
        const toPocketY = (pocket.y - target.y) / pocketDistance;
        const contactDistance = cue.radius + target.radius;
        const ghost = {
          x: target.x - toPocketX * contactDistance,
          y: target.y - toPocketY * contactDistance
        };

        if (
          ghost.x < cue.radius || ghost.x > tableWidth - cue.radius
          || ghost.y < cue.radius || ghost.y > tableHeight - cue.radius
        ) {
          continue;
        }

        const cueDistance = distance(cue, ghost);
        if (cueDistance < 1) continue;
        const cueDirectionX = (ghost.x - cue.x) / cueDistance;
        const cueDirectionY = (ghost.y - cue.y) / cueDistance;
        const alignment = cueDirectionX * toPocketX + cueDirectionY * toPocketY;
        if (alignment < 0.12) continue;

        if (!pathIsClear(
          cue,
          ghost,
          balls,
          new Set([cue.id, target.id]),
          cue.radius,
          2
        )) continue;

        if (!pathIsClear(
          target,
          pocket,
          balls,
          new Set([cue.id, target.id]),
          target.radius,
          3
        )) continue;

        const totalTravel = cueDistance + pocketDistance;
        const score = alignment * 420 - totalTravel * 0.22
          - Math.abs(pocket.x - target.x) * 0.015
          + (target.kind === "eight" ? 900 : 0);
        candidates.push({
          type: "pot",
          targetBallId: target.id,
          targetNumber: target.number,
          pocketId: pocket.id,
          ghost,
          angle: Math.atan2(ghost.y - cue.y, ghost.x - cue.x),
          power: Math.max(0.32, Math.min(0.92, 0.30 + totalTravel / 1750)),
          score
        });
      }
    }

    return candidates.sort((a, b) => b.score - a.score);
  }

  function buildFallback(cue, targets, balls) {
    const visible = targets
      .map((target) => ({
        target,
        distance: distance(cue, target),
        clear: pathIsClear(
          cue,
          target,
          balls,
          new Set([cue.id, target.id]),
          cue.radius,
          2
        )
      }))
      .sort((a, b) => {
        if (a.clear !== b.clear) return a.clear ? -1 : 1;
        return a.distance - b.distance;
      });
    const choice = visible[0];
    if (!choice) return null;
    return {
      type: choice.clear ? "safety" : "escape",
      targetBallId: choice.target.id,
      targetNumber: choice.target.number,
      pocketId: null,
      angle: Math.atan2(choice.target.y - cue.y, choice.target.x - cue.x),
      power: Math.max(0.42, Math.min(0.78, 0.42 + choice.distance / 1800)),
      score: -choice.distance
    };
  }

  function buildMagicBallPlan(cue, balls, pockets, settings, random) {
    const magicBalls = balls.filter((ball) => ball.active && ball.kind === "magic");
    if (magicBalls.length === 0 || random() > settings.magicBallChance) return null;

    const potCandidates = buildDirectCandidates(cue, magicBalls, balls, pockets);
    if (potCandidates.length > 0) {
      const chosen = potCandidates[0];
      return Object.assign({}, chosen, {
        type: "magic_pot",
        targetNumber: null,
        score: chosen.score + 160
      });
    }

    const visible = magicBalls
      .map((target) => ({
        target,
        distance: distance(cue, target),
        clear: pathIsClear(
          cue,
          target,
          balls,
          new Set([cue.id, target.id]),
          cue.radius,
          2
        )
      }))
      .filter((candidate) => candidate.clear)
      .sort((a, b) => a.distance - b.distance);
    const choice = visible[0];
    if (!choice) return null;
    return {
      type: "magic_touch",
      targetBallId: choice.target.id,
      targetNumber: null,
      pocketId: null,
      angle: Math.atan2(choice.target.y - cue.y, choice.target.x - cue.x),
      power: Math.max(0.38, Math.min(0.68, 0.38 + choice.distance / 1900)),
      score: 120 - choice.distance * 0.08
    };
  }

  function planShot(world, options = {}) {
    const difficulty = normalizeDifficulty(options.difficulty);
    const settings = DIFFICULTIES[difficulty];
    const random = typeof options.random === "function" ? options.random : Math.random;
    const balls = Array.isArray(world && world.balls) ? world.balls : [];
    const pockets = Array.isArray(world && world.pockets) ? world.pockets : [];
    const cue = balls.find((ball) => ball.active && ball.kind === "cue");
    const targets = eligibleTargets(balls);
    if (!cue || targets.length === 0) return null;

    let plan;
    if (options.openingBreak) {
      const target = targets.reduce((best, ball) => (
        !best || distance(cue, ball) < distance(cue, best) ? ball : best
      ), null);
      plan = {
        type: "break",
        targetBallId: target.id,
        targetNumber: target.number,
        pocketId: null,
        angle: Math.atan2(target.y - cue.y, target.x - cue.x),
        power: settings.breakPower,
        score: 0
      };
    } else {
      const candidates = buildDirectCandidates(cue, targets, balls, pockets);
      if (candidates.length > 0) {
        const poolSize = Math.min(settings.candidatePool, candidates.length);
        plan = candidates[Math.floor(random() * poolSize)];
      } else {
        plan = buildMagicBallPlan(cue, balls, pockets, settings, random)
          || buildFallback(cue, targets, balls);
      }
    }

    if (!plan) return null;
    const aimError = randomSigned(random) * settings.aimError;
    const powerError = randomSigned(random) * settings.powerError;
    return Object.assign({}, plan, {
      difficulty,
      angle: plan.angle + aimError,
      power: Math.max(CONFIG.input.minPower, Math.min(1, plan.power + powerError)),
      spin: { x: randomSigned(random) * 0.08, y: 0 }
    });
  }

  function chooseOffer(player) {
    if (!player || !player.shop || !Array.isArray(player.shop.offers)) return null;
    if (player.inventory.filter(Boolean).length >= CONFIG.arcane.inventoryMax) return null;
    return player.shop.offers
      .filter((offer) => (
        Number(offer.cost) <= player.arcanaPoints
        && Object.prototype.hasOwnProperty.call(SPECIAL_UTILITY, offer.defId)
      ))
      .sort((a, b) => (
        SPECIAL_UTILITY[b.defId] - SPECIAL_UTILITY[a.defId]
        || Number(a.cost) - Number(b.cost)
      ))[0] || null;
  }

  function nearestPocketId(point, pockets) {
    let best = null;
    for (const pocket of pockets) {
      const currentDistance = distance(point, pocket);
      if (!best || currentDistance < best.distance) {
        best = { id: pocket.id, distance: currentDistance };
      }
    }
    return best ? best.id : 0;
  }

  function targetForSpecial(defId, plan, world) {
    const balls = world.balls || [];
    const pockets = world.pockets || [];
    const targetBall = balls.find((ball) => ball.id === plan.targetBallId);
    const plannedPocket = pockets.find((pocket) => pocket.id === plan.pocketId);
    const pocketId = plannedPocket
      ? plannedPocket.id
      : nearestPocketId(targetBall || balls.find((ball) => ball.kind === "cue"), pockets);

    if (["golden_pocket", "light_magnet", "shield_pocket"].includes(defId)) {
      return { pocketId };
    }
    if (["magnetic_ball", "explosive_ball"].includes(defId) && targetBall) {
      return { ballId: targetBall.id };
    }
    if (["ice_zone", "sticky_zone"].includes(defId) && targetBall) {
      return { x: targetBall.x, y: targetBall.y };
    }
    if (defId === "portal_pocket" && pockets.length >= 2) {
      const source = pockets.find((pocket) => pocket.id === pocketId) || pockets[0];
      const other = pockets
        .filter((pocket) => pocket.id !== pocketId)
        .sort((a, b) => distance(source, b) - distance(source, a))[0];
      return other ? { pocketIds: [pocketId, other.id] } : null;
    }
    return null;
  }

  function chooseSpecial(player, plan, world, options = {}) {
    if (!player || !plan || !Array.isArray(player.inventory)) return null;
    const difficulty = normalizeDifficulty(options.difficulty);
    const random = typeof options.random === "function" ? options.random : Math.random;
    if (random() > DIFFICULTIES[difficulty].specialChance) return null;

    const candidates = player.inventory
      .map((instance, slotIndex) => ({ instance, slotIndex }))
      .filter(({ instance }) => (
        instance
        && Number(instance.cooldownTurns || 0) <= 0
        && Object.prototype.hasOwnProperty.call(SPECIAL_UTILITY, instance.defId)
        && !(player.activeEffects && player.activeEffects[instance.defId])
      ))
      .sort((a, b) => SPECIAL_UTILITY[b.instance.defId] - SPECIAL_UTILITY[a.instance.defId]);

    for (const candidate of candidates) {
      const target = targetForSpecial(candidate.instance.defId, plan, world);
      const targeted = [
        "golden_pocket", "light_magnet", "shield_pocket", "magnetic_ball",
        "explosive_ball", "ice_zone", "sticky_zone", "portal_pocket"
      ].includes(candidate.instance.defId);
      if (targeted && !target) continue;
      return {
        slotIndex: candidate.slotIndex,
        defId: candidate.instance.defId,
        target
      };
    }
    return null;
  }

  return {
    DIFFICULTIES,
    normalizeDifficulty,
    planShot,
    chooseOffer,
    chooseSpecial
  };
})(ArcaneAIDependencies.CONFIG);

if (typeof module === "object" && module.exports) {
  module.exports = ArcaneAI;
}
