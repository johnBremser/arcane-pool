const SpecialsConfig = typeof module === "object" && module.exports
  ? require("./config.js")
  : CONFIG;

const Specials = ((CONFIG) => {
  const CATALOG = [
    {
      id: "ghost_aim",
      name: "Mira Fantasma",
      rarity: "common",
      cost: 1,
      useType: "limited",
      maxUses: 3,
      icon: "eye",
      description: "Mostra a trajetória completa da bola branca e da bola alvo na próxima tacada."
    },
    {
      id: "perfect_force",
      name: "Força Perfeita",
      rarity: "common",
      cost: 1,
      useType: "limited",
      maxUses: 2,
      icon: "target",
      description: "A barra de força ganha uma zona verde ideal. Acertar garante força perfeita."
    },
    {
      id: "soft_touch",
      name: "Toque Suave",
      rarity: "common",
      cost: 1,
      useType: "limited",
      maxUses: 3,
      icon: "feather",
      description: "Reduz o atrito da bola branca em 30% na próxima tacada."
    },
    {
      id: "expanded_vision",
      name: "Visão Ampliada",
      rarity: "common",
      cost: 1,
      useType: "limited",
      maxUses: 2,
      icon: "binocular",
      description: "Linha de mira 50% mais longa, mostrando mais quiques previstos."
    },
    {
      id: "stabilizer",
      name: "Estabilizador",
      rarity: "common",
      cost: 1,
      useType: "limited",
      maxUses: 2,
      icon: "balance",
      description: "Reduz efeito lateral indesejado em 50% na próxima tacada."
    },

    {
      id: "ghost_ball",
      name: "Bola Fantasma",
      rarity: "uncommon",
      cost: 2,
      useType: "single",
      maxUses: 1,
      icon: "ghost",
      description: "A primeira bola alvo atingida atravessa a primeira colisão seguinte."
    },
    {
      id: "golden_pocket",
      name: "Caçapa Dourada",
      rarity: "uncommon",
      cost: 2,
      useType: "single",
      maxUses: 1,
      icon: "coin",
      description: "Escolha uma caçapa. Bolas válidas nela dão +3 pontos arcana."
    },
    {
      id: "pressure",
      name: "Pressão",
      rarity: "uncommon",
      cost: 2,
      useType: "single",
      maxUses: 1,
      icon: "heartbeat",
      description: "Próxima tacada do adversário: força varia até ±8%."
    },
    {
      id: "light_magnet",
      name: "Ímã Leve",
      rarity: "uncommon",
      cost: 2,
      useType: "single",
      maxUses: 1,
      icon: "magnet",
      description: "Escolha uma caçapa. Bola alvo próxima é puxada levemente."
    },
    {
      id: "double_shot",
      name: "Tacada Dupla",
      rarity: "uncommon",
      cost: 3,
      useType: "single",
      maxUses: 1,
      icon: "double",
      description: "Se errar, ganha segunda tacada com força máxima reduzida em 30%."
    },

    {
      id: "magnetic_ball",
      name: "Bola Magnética",
      rarity: "rare",
      cost: 3,
      useType: "single",
      maxUses: 1,
      icon: "attract",
      description: "Escolha uma bola. Ela é atraída pela caçapa mais próxima."
    },
    {
      id: "rewind",
      name: "Rebobinar",
      rarity: "rare",
      cost: 3,
      useType: "single",
      maxUses: 1,
      icon: "rewind",
      description: "Desfaz a última tacada do adversário."
    },
    {
      id: "shield_pocket",
      name: "Escudo de Caçapa",
      rarity: "rare",
      cost: 3,
      useType: "cooldown",
      maxUses: 1,
      cooldownTurns: 3,
      icon: "shield",
      description: "Protege uma caçapa por 1 turno adversário."
    },
    {
      id: "ice_zone",
      name: "Zona de Gelo",
      rarity: "rare",
      cost: 3,
      useType: "single",
      maxUses: 1,
      icon: "snowflake",
      description: "Área circular com atrito reduzido em 50% por 2 turnos."
    },
    {
      id: "sticky_zone",
      name: "Zona Pegajosa",
      rarity: "rare",
      cost: 3,
      useType: "single",
      maxUses: 1,
      icon: "slime",
      description: "Área circular com atrito aumentado em 80% por 2 turnos."
    },
    {
      id: "position_swap",
      name: "Troca de Posição",
      rarity: "rare",
      cost: 3,
      useType: "single",
      maxUses: 1,
      icon: "swap",
      description: "Troca a posição da bola branca com outra bola qualquer."
    },

    {
      id: "time_freeze",
      name: "Tempo Congelado",
      rarity: "legendary",
      cost: 5,
      useType: "single",
      maxUses: 1,
      icon: "hourglass",
      description: "Pausa o tempo ao atingir a primeira bola. Ajuste a direção por 2s."
    },
    {
      id: "ghost_hand",
      name: "Mão Fantasma",
      rarity: "legendary",
      cost: 5,
      useType: "single",
      maxUses: 1,
      icon: "hand",
      description: "Mova a bola branca para qualquer posição livre."
    },
    {
      id: "portal_pocket",
      name: "Caçapa Portal",
      rarity: "legendary",
      cost: 5,
      useType: "single",
      maxUses: 1,
      icon: "portal",
      description: "Conecta duas caçapas como portais por 1 turno."
    },
    {
      id: "explosive_ball",
      name: "Bola Explosiva",
      rarity: "legendary",
      cost: 5,
      useType: "single",
      maxUses: 1,
      icon: "bomb",
      description: "A bola escolhida explode ao ser atingida, empurrando bolas próximas."
    }
  ];

  const RARITY_ORDER = ["common", "uncommon", "rare", "legendary"];

  const RARITY_COLORS = {
    common: "#eef5ff",
    uncommon: "#58d68d",
    rare: "#68c8ff",
    legendary: "#e9c46a"
  };

  const RARITY_NAMES = {
    common: "Comum",
    uncommon: "Incomum",
    rare: "Raro",
    legendary: "Lendário"
  };

  function getCatalog() {
    return CATALOG;
  }

  function getById(id) {
    return CATALOG.find((s) => s.id === id) || null;
  }

  function getByRarity(rarity) {
    return CATALOG.filter((s) => s.rarity === rarity);
  }

  function rollRarity(random = Math.random) {
    const chances = CONFIG.arcane.rarityChances;
    const roll = random();
    let cumulative = 0;

    for (const rarity of RARITY_ORDER) {
      cumulative += chances[rarity];
      if (roll <= cumulative) {
        return rarity;
      }
    }

    return "common";
  }

  function rollSpecial(avoidIds = [], legendaryBlocked = false, random = Math.random) {
    let rarity = rollRarity(random);

    if (legendaryBlocked && rarity === "legendary") {
      rarity = "rare";
    }

    let pool = getByRarity(rarity);

    if (avoidIds.length > 0) {
      pool = pool.filter((s) => !avoidIds.includes(s.id));
    }

    if (pool.length === 0) {
      pool = CATALOG.filter((s) => s.rarity !== "legendary");
      if (pool.length === 0) {
        pool = CATALOG;
      }
    }

    return pool[Math.floor(random() * pool.length)];
  }

  function rollShopOffers(legendaryBlocked = false, avoidIds = [], random = Math.random) {
    const offers = [];
    const size = CONFIG.arcane.shopSize;
    const usedIds = [...avoidIds];

    for (let i = 0; i < size; i++) {
      const def = rollSpecial(usedIds, legendaryBlocked, random);
      offers.push({
        offerId: `offer_${Date.now()}_${i}_${Math.floor(random() * 1e6)}`,
        defId: def.id,
        name: def.name,
        rarity: def.rarity,
        cost: def.cost,
        useType: def.useType,
        maxUses: def.maxUses || 1,
        icon: def.icon,
        description: def.description
      });
      usedIds.push(def.id);
    }

    return offers;
  }

  function createSpecialInstance(offer, random = Math.random) {
    const def = getById(offer.defId);
    if (!def) return null;

    return {
      uid: `inst_${Date.now()}_${Math.floor(random() * 1e6)}`,
      defId: def.id,
      name: def.name,
      rarity: def.rarity,
      useType: def.useType,
      icon: def.icon,
      description: def.description,
      usesLeft: def.useType === "limited" ? def.maxUses : 1,
      maxUses: def.maxUses || 1,
      cooldownTurns: 0,
      maxCooldown: def.cooldownTurns || 0
    };
  }

  return {
    getCatalog,
    getById,
    getByRarity,
    rollRarity,
    rollSpecial,
    rollShopOffers,
    createSpecialInstance,
    RARITY_COLORS,
    RARITY_NAMES
  };
})(SpecialsConfig);

if (typeof module === "object" && module.exports) {
  module.exports = Specials;
}
