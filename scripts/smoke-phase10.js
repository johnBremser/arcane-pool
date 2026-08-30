"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../public/config.js");
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

const html = read("public/index.html");
const style = read("public/style.css");
const game = read("public/game.js");
const server = read("server.js");

assert(!html.includes("FASE 10 — Polimento final"));
assert(html.includes('id="gameMenuButton"'));
assert(html.includes('id="audioMenuButton"'));
assert(html.includes('id="helpButton"'));
assert(html.includes('id="helpOverlay"'));
assert(html.includes('id="specialGuide"'));
assert(html.includes('role="dialog" aria-modal="true" aria-labelledby="shopTitle"'));
assert(html.indexOf('src="ai.js"') < html.indexOf('src="game.js"'));

assert(style.includes("@media (max-width: 1100px) and (min-width: 901px)"));
assert(style.includes(".controlPopover"));
assert(style.includes("#helpOverlay"));
assert(style.includes(":focus-visible"));
assert(style.includes("@media (prefers-reduced-motion: reduce)"));

assert(game.includes('document.addEventListener("visibilitychange", handleVisibilityChange)'));
assert(game.includes('setStateLabel("Partida pausada")'));
assert(game.includes("function renderHelpGuide()"));
assert(game.includes("function updateAudioUI()"));
assert(game.includes("function updateCountdownSound(totalSeconds, remainingMs)"));
assert(game.includes("AudioSys.playCountdownTick(totalSeconds)"));
assert(server.includes("phase: 10"));

console.log("Smoke Fase 10: menus compactos, ajuda, pausa e acessibilidade OK");
