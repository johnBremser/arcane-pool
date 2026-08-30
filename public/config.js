const CONFIG = {
  version: "1.0.0",

  table: {
    width: 1280,
    height: 640,
    rail: 56,
    pocketRadius: 24,
    captureRadius: 21,
    pocketJaw: {
      cornerMouth: 38,
      sideMouthHalf: 34,
      radius: 5,
      restitution: 0.72,
      tangentRetention: 0.90
    }
  },

  balls: {
    radius: 12
  },

  physics: {
    fixedDt: 1 / 120,
    maxFrameDt: 0.25,
    friction: 1.35,
    stopSpeed: 4,
    restitutionBall: 0.97,
    restitutionCushion: 0.85,
    maxShotSpeed: 1500,
    highPowerBoost: 0.74,
    highPowerExponent: 3,

    spin: {
      decay: 1.8,
      follow: 185,
      curve: 46,
      cushionEnglish: 72,
      collisionEnglish: 46
    }
  },

  input: {
    maxDrag: 190,
    minPower: 0.045,
    openingBreak: {
      powerMultiplier: 1,
      cueVerticalPadding: 46
    }
  },

  turn: {
    durationMs: 45000,
    warningMs: 10000
  },

  classic: {
    points: {
      normal: 10,
      cushion: 20,
      long: 25,
      cueFoul: -15
    },
    longShotDistance: 480,
    eightBallRule: true,
    continueTurnOnPot: true
  },

  arcane: {
    enabled: true,

    arcanaPoints: {
      start: 2,
      max: 10,
      potNormal: 1,
      potCushion: 2,
      potLong: 2,
      multiPotBonus: 3,
      exchangeWin: 1,
      goodDefense: 1
    },

    inventoryMax: 3,
    shopSize: 3,
    rerollCost: 1,

    rarityChances: {
      common: 0.50,
      uncommon: 0.30,
      rare: 0.15,
      legendary: 0.05
    },

    legendaryLimitPerMatch: 1,

    conversionOnFullInventory: {
      common: 2,
      uncommon: 3,
      rare: 4,
      legendary: 6
    },

    magicBall: {
      lifetimeTurns: 2,
      respawnDelayTurns: 1,
      touchArcana: 1,
      radius: 14,
      spawnClearance: 10,
      pocketClearance: 92,
      colors: {
        common: "#e9f3ff",
        uncommon: "#58d68d",
        rare: "#68c8ff",
        legendary: "#f4d06f"
      }
    },

    defense: {
      clearancePadding: 2
    },

    specialEffects: {
      perfectForce: {
        zoneHalfWidth: 0.065,
        minPower: 0.28,
        maxPower: 0.84
      },
      softTouchFrictionMultiplier: 0.70,
      expandedVisionLengthMultiplier: 1.50,
      expandedVisionBounces: 2,
      naturalSideSpinVariance: 0.035,
      stabilizerVarianceMultiplier: 0.50,
      pressureMaxVariation: 0.08,
      lightMagnetRangeBeyondPocket: 30,
      lightMagnetAcceleration: 760,
      doubleShotMaxPower: 0.70,
      magneticBallRangeBeyondPocket: 50,
      magneticBallAcceleration: 1050,
      zoneRadius: 80,
      iceZoneFrictionMultiplier: 0.50,
      stickyZoneFrictionMultiplier: 1.80,
      timeFreezeSeconds: 2,
      portalExitSpeedMultiplier: 0.60,
      explosiveRadius: 100,
      explosiveImpulse: 520
    }
  },

  network: {
    protocolVersion: 1,
    reconnectWindowMs: 30000,
    maxMessageBytes: 32768,
    pingIntervalMs: 5000
  }
};

if (typeof module === "object" && module.exports) {
  module.exports = CONFIG;
}
