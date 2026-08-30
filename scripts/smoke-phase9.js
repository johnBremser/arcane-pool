"use strict";

const assert = require("assert");
const CONFIG = require("../public/config.js");
const ArcaneAI = require("../public/ai.js");
const PhysicsCore = require("../public/physics.js");

function ball(id, kind, number, x, y) {
  return {
    id,
    kind,
    number,
    x,
    y,
    radius: CONFIG.balls.radius,
    active: true
  };
}

const pockets = [
  { id: 0, x: 0, y: 0 },
  { id: 1, x: CONFIG.table.width / 2, y: -12 },
  { id: 2, x: CONFIG.table.width, y: 0 },
  { id: 3, x: 0, y: CONFIG.table.height },
  { id: 4, x: CONFIG.table.width / 2, y: CONFIG.table.height + 12 },
  { id: 5, x: CONFIG.table.width, y: CONFIG.table.height }
];
const fixedRandom = () => 0.5;

const directWorld = {
  balls: [
    ball(1, "cue", 0, 180, 320),
    ball(2, "object", 4, 930, 120),
    ball(3, "eight", 8, 850, 510)
  ],
  pockets
};
const direct = ArcaneAI.planShot(directWorld, {
  difficulty: "hard",
  random: fixedRandom
});
assert(direct, "IA deve encontrar uma tacada");
assert.strictEqual(direct.targetBallId, 2, "IA não deve mirar a bola 8 antes da hora");
assert(direct.power >= CONFIG.input.minPower && direct.power <= 1, "força deve ser válida");
assert(Number.isFinite(direct.angle), "ângulo deve ser finito");

const directWithMagic = ArcaneAI.planShot({
  balls: directWorld.balls.concat([
    { ...ball(90, "magic", null, 240, 560), magicBallId: "magic_visible" }
  ]),
  pockets
}, {
  difficulty: "hard",
  random: fixedRandom
});
assert.strictEqual(
  directWithMagic.targetBallId,
  2,
  "IA deve priorizar uma encaçapada correta quando ela existe"
);

const noCertainPotWorld = {
  balls: [
    ball(1, "cue", 0, 180, 320),
    ball(2, "object", 4, 930, 120),
    { ...ball(91, "magic", null, 430, 350), magicBallId: "magic_option" }
  ],
  pockets: []
};
const magicPlan = ArcaneAI.planShot(noCertainPotWorld, {
  difficulty: "normal",
  random: fixedRandom
});
assert.strictEqual(magicPlan.type, "magic_touch", "IA deve buscar a Bola Mágica sem encaçapada segura");
assert.strictEqual(magicPlan.targetBallId, 91);

const cautiousEasyPlan = ArcaneAI.planShot(noCertainPotWorld, {
  difficulty: "easy",
  random: () => 0.99
});
assert(!cautiousEasyPlan.type.startsWith("magic_"), "IA fácil não deve buscar magia em toda jogada");

const eightWorld = {
  balls: [
    ball(1, "cue", 0, 180, 320),
    ball(8, "eight", 8, 900, 120)
  ],
  pockets
};
const eightPlan = ArcaneAI.planShot(eightWorld, {
  difficulty: "normal",
  random: fixedRandom
});
assert.strictEqual(eightPlan.targetBallId, 8, "IA deve atacar a bola 8 quando ela for a última");

const breakPlan = ArcaneAI.planShot(directWorld, {
  difficulty: "hard",
  openingBreak: true,
  random: fixedRandom
});
assert.strictEqual(breakPlan.type, "break");
assert.strictEqual(breakPlan.power, 1, "IA difícil deve quebrar com força total");

const physics = PhysicsCore.createWorld(CONFIG, { random: fixedRandom });
physics.init();
const realBreak = ArcaneAI.planShot({
  balls: physics.getSnapshot(),
  pockets: physics.getPockets()
}, {
  difficulty: "hard",
  openingBreak: true,
  random: fixedRandom
});
assert(physics.shoot(realBreak.angle, realBreak.power, realBreak.spin, { openingBreak: true }));
for (let step = 0; step < 4800 && physics.ballsMoving(); step++) {
  physics.step(CONFIG.physics.fixedDt);
}
const breakState = physics.consumeShotState();
assert(breakState && breakState.firstContactBall, "saída da IA deve atingir o rack");
assert.notStrictEqual(breakState.firstContactBall.number, 8, "saída não deve mirar primeiro na bola 8");

const player = {
  arcanaPoints: 3,
  inventory: [
    {
      defId: "magnetic_ball",
      cooldownTurns: 0
    },
    null,
    null
  ],
  activeEffects: {},
  shop: {
    offers: [
      { offerId: "unsupported", defId: "ghost_hand", cost: 1 },
      { offerId: "useful", defId: "perfect_force", cost: 1 }
    ]
  }
};
assert.strictEqual(ArcaneAI.chooseOffer(player).offerId, "useful");
const special = ArcaneAI.chooseSpecial(player, direct, directWorld, {
  difficulty: "hard",
  random: fixedRandom
});
assert.strictEqual(special.defId, "magnetic_ball");
assert.deepStrictEqual(special.target, { ballId: direct.targetBallId });

assert.strictEqual(
  ArcaneAI.planShot({ balls: [], pockets }, { random: fixedRandom }),
  null,
  "sem bola branca não existe tacada"
);

console.log("Smoke Fase 9: níveis, mira, bola 8, saída e decisões arcanas da IA OK");
