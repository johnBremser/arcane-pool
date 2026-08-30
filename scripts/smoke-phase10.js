"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../public/config.js");
const PhysicsCore = require("../public/physics.js");
const Rules = require("../public/rules.js");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

assert.strictEqual(CONFIG.version, "1.0.0", "a entrega final deve usar a versão 1.0.0");

const startAt = 1000;
const match = Rules.createMatch("classic", startAt, () => 0.5);
Rules.pauseTurnTimer(match, startAt + 5000);
assert.strictEqual(Rules.getTurnRemainingMs(match, startAt + 20000), 40000);
Rules.resumeTurnTimer(match, startAt + 20000);
assert.strictEqual(Rules.getTurnRemainingMs(match, startAt + 21000), 39000);

const waitingBreak = Rules.createMatch("classic", startAt, () => 0.5);
assert.strictEqual(Rules.isOpeningBreak(waitingBreak), true);
const timeout = Rules.timeoutTurn(waitingBreak, startAt + CONFIG.turn.durationMs + 1, () => 0.5);
assert.strictEqual(timeout.ok, true);
assert.strictEqual(waitingBreak.currentSeat, 2);
assert.strictEqual(Rules.isOpeningBreak(waitingBreak), true, "a saída deve continuar disponível após timeout");
assert.strictEqual(Rules.consumeOpeningBreak(waitingBreak), true);
assert.strictEqual(Rules.isOpeningBreak(waitingBreak), false);

function simulatePocketApproach({ x, y, vx, vy, steps = 180 }) {
  const world = PhysicsCore.createWorld(CONFIG, { random: () => 0.5 });
  let cushionHits = 0;
  world.init();
  world.setCallbacks({ onCushion: () => { cushionHits += 1; } });
  const cue = world.getCueBall();
  for (const ball of world.getBalls()) {
    if (ball !== cue) ball.active = false;
  }
  Object.assign(cue, { x, y, vx, vy, spinX: 0, spinY: 0 });
  for (let index = 0; index < steps && cue.active; index += 1) {
    world.step(CONFIG.physics.fixedDt);
  }
  return { cue, cushionHits };
}

const directSidePocket = simulatePocketApproach({ x: 640, y: 70, vx: 0, vy: -500 });
assert.strictEqual(directSidePocket.cue.pocketed, true, "entrada central deve encaçapar");

const sideJawHit = simulatePocketApproach({ x: 585, y: 20, vx: 160, vy: -420 });
assert.strictEqual(sideJawHit.cue.active, true, "bola na quina lateral deve permanecer na mesa");
assert(sideJawHit.cushionHits > 0, "quina lateral deve produzir colisão");

const cornerJawHit = simulatePocketApproach({ x: 100, y: 15, vx: -500, vy: -20 });
assert.strictEqual(cornerJawHit.cue.active, true, "bola raspando o canto não deve ser sugada");
assert(cornerJawHit.cushionHits > 0, "quina do canto deve desviar a bola");

function fullShotSpeed(openingBreak) {
  const world = PhysicsCore.createWorld(CONFIG, { random: () => 0.5 });
  world.init();
  assert(world.shoot(0, 1, { x: 0, y: 0 }, { openingBreak }));
  const cue = world.getCueBall();
  return Math.hypot(cue.vx, cue.vy);
}

const fullRegularSpeed = fullShotSpeed(false);
const fullBreakSpeed = fullShotSpeed(true);
assert(
  Math.abs(fullRegularSpeed - fullBreakSpeed) < 0.001,
  "força máxima comum deve equivaler à força máxima da saída"
);

const longShotWorld = PhysicsCore.createWorld(CONFIG, { random: () => 0.5 });
longShotWorld.init();
const longShotCue = longShotWorld.getCueBall();
const longShotTarget = longShotWorld.getBalls().find((ball) => ball.kind === "object");
for (const ball of longShotWorld.getBalls()) {
  if (ball !== longShotCue && ball !== longShotTarget) ball.active = false;
}
Object.assign(longShotCue, { x: 90, y: 320, vx: 0, vy: 0, spinX: 0, spinY: 0 });
Object.assign(longShotTarget, { x: 1120, y: 320, vx: 0, vy: 0, spinX: 0, spinY: 0 });
assert(longShotWorld.shoot(0, 1, { x: 0, y: 0 }));
let targetImpactSpeed = 0;
for (let step = 0; step < 1200 && targetImpactSpeed === 0; step += 1) {
  longShotWorld.step(CONFIG.physics.fixedDt);
  targetImpactSpeed = Math.hypot(longShotTarget.vx, longShotTarget.vy);
}
assert(targetImpactSpeed > 750, "tacada máxima longa deve atingir a bola-alvo com força útil");

const html = read("public/index.html");
const style = read("public/style.css");
const game = read("public/game.js");
const server = read("server.js");
const audio = read("public/audio.js");

assert(!html.includes("FASE 10 — Polimento final"));
assert(html.includes('id="gameMenuButton"'));
assert(html.includes('id="audioMenuButton"'));
assert(html.includes('id="helpButton"'));
assert(html.includes('id="helpOverlay"'));
assert(html.includes('id="specialGuide"'));
assert(html.includes('id="pauseButton"'));
assert(html.includes('id="pauseOverlay"'));
assert(html.includes('id="arcaneAlert"'));
assert(html.includes('role="dialog" aria-modal="true" aria-labelledby="shopTitle"'));
assert(html.indexOf('src="ai.js"') < html.indexOf('src="game.js"'));

assert(style.includes("@media (max-width: 1100px) and (min-width: 901px)"));
assert(style.includes(".controlPopover"));
assert(style.includes("#helpOverlay"));
assert(style.includes("#pauseOverlay"));
assert(style.includes("#arcaneAlert"));
assert(style.includes(":focus-visible"));
assert(style.includes("@media (prefers-reduced-motion: reduce)"));

assert(game.includes('document.addEventListener("visibilitychange", handleVisibilityChange)'));
assert(game.includes('setStateLabel("Partida pausada")'));
assert(game.includes("function renderHelpGuide()"));
assert(game.includes("function updateAudioUI()"));
assert(game.includes("function updateCountdownSound(totalSeconds, remainingMs)"));
assert(game.includes("AudioSys.playCountdownTick(totalSeconds)"));
assert(game.includes("function applyMultiplayerPaused(payload"));
assert(game.includes("function showArcaneAlert(kicker, message"));
assert(audio.includes("let enabled = true;"));
assert(server.includes("const MATCH_PAUSE_MS = 20000"));
assert(server.includes("phase: 10"));

console.log("Smoke Fase 10: menus compactos, ajuda, pausa e acessibilidade OK");
