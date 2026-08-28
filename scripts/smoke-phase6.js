"use strict";

const assert = require("assert");
const CONFIG = require("../public/config.js");
const PhysicsCore = require("../public/physics.js");
const Protocol = require("../public/protocol.js");
const Rules = require("../public/rules.js");

function fixedRandom(value) {
  return () => value;
}

function testRewardAndConversion() {
  const random = fixedRandom(0.1);
  const match = Rules.createMatch("arcane", 1000, random);
  const world = PhysicsCore.createWorld(CONFIG, { random });
  world.init();

  const position = world.findMagicBallSpawnPosition(random);
  assert(position, "deve encontrar uma posição segura");
  const spawned = Rules.spawnMagicBall(match, position, random);
  assert.equal(spawned.ok, true);
  assert(world.addMagicBall(spawned.magicBall));
  assert.equal(world.addMagicBall(spawned.magicBall), null, "só pode existir uma Bola Mágica");

  const publicState = Rules.publicSnapshot(match);
  assert(publicState.magicBall);
  assert.equal(publicState.magicBall.rewardDefId, undefined, "recompensa não pode vazar");

  const arcanaEvents = [];
  assert.equal(Rules.touchMagicBall(match, spawned.magicBall.id, 1, arcanaEvents).ok, true);
  assert.equal(Rules.touchMagicBall(match, spawned.magicBall.id, 1, arcanaEvents).code, "already_touched");
  assert.equal(match.players[0].arcanaPoints, 3);

  match.players[0].inventory = [{}, {}, {}];
  const collected = Rules.collectMagicBall(
    match,
    spawned.magicBall.id,
    1,
    0,
    random,
    arcanaEvents
  );
  assert.equal(collected.ok, true);
  assert.equal(collected.reward.converted, true);
  assert.equal(match.players[0].arcanaPoints, 5);

  const types = Rules.drainArcaneEvents(match).map((event) => event.type);
  assert.deepEqual(types, [
    "arcane_ball_spawned",
    "arcane_ball_touched",
    "arcane_ball_potted",
    "arcane_reward_converted"
  ]);
}

function testRewardGrantAndExpiry() {
  const random = fixedRandom(0.1);
  const rewardedMatch = Rules.createMatch("arcane", 2000, random);
  const rewarded = Rules.spawnMagicBall(rewardedMatch, { x: 320, y: 180 }, random);
  const collected = Rules.collectMagicBall(
    rewardedMatch,
    rewarded.magicBall.id,
    1,
    2,
    random,
    []
  );
  assert.equal(collected.reward.converted, false);
  assert(rewardedMatch.players[0].inventory[collected.reward.slot]);

  const expiringMatch = Rules.createMatch("arcane", 3000, random);
  Rules.spawnMagicBall(expiringMatch, { x: 480, y: 240 }, random);
  Rules.drainArcaneEvents(expiringMatch);
  Rules.startTurn(expiringMatch, 2, 4000, random);
  assert(expiringMatch.magicBall, "deve sobreviver ao segundo turno");
  Rules.startTurn(expiringMatch, 1, 5000, random);
  assert.equal(expiringMatch.magicBall, null, "deve expirar ao concluir dois turnos");
  assert.equal(Rules.drainArcaneEvents(expiringMatch)[0].type, "arcane_ball_expired");
}

function testProtocolAndPhysicsSnapshot() {
  for (const type of [
    "arcane_ball_spawned",
    "arcane_ball_touched",
    "arcane_ball_potted",
    "arcane_ball_expired",
    "arcane_reward_granted",
    "arcane_reward_converted"
  ]) {
    assert(Protocol.SERVER_TYPES.includes(type));
  }

  const world = PhysicsCore.createWorld(CONFIG, { random: fixedRandom(0.2) });
  world.init();
  world.addMagicBall({
    id: "magic_smoke",
    x: 350,
    y: 210,
    radius: CONFIG.arcane.magicBall.radius,
    rarity: "rare",
    color: CONFIG.arcane.magicBall.colors.rare
  });
  const snapshot = world.getSnapshot();
  const restored = PhysicsCore.createWorld(CONFIG);
  restored.init();
  assert.equal(restored.loadSnapshot(snapshot), true);
  assert.equal(restored.getMagicBall().magicBallId, "magic_smoke");
}

testRewardAndConversion();
testRewardGrantAndExpiry();
testProtocolAndPhysicsSnapshot();

console.log("Smoke Fase 6: regras, recompensas, expiração, eventos e snapshot OK");
