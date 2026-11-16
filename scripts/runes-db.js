/**
 * Complete Official Pathfinder: Impossible Magic Runesmith Database
 * Covers all 32 Base Runes (Lv 1, 9, 17) and 12 Diacritic Runes (Lv 5, 13),
 * plus Runic Repertoire progression and Runic Crafter formula unlocks.
 */

export const TRADITIONS = ["arcane", "divine", "occult", "primal"];
export const ELEMENTAL_TYPES = ["acid", "cold", "electricity", "fire"];

/**
 * Official Impossible Magic Runic Repertoire & Max Etched Runes table.
 */
export function getRunesmithLimits(actor) {
  const level = Math.max(1, Number(actor?.system?.details?.level?.value ?? actor?.level ?? 1));
  const rollOpts = actor?.rollOptions?.all ?? {};
  const isClass = actor?.class?.slug === "runesmith" || Boolean(rollOpts["class:runesmith"]);
  const isDedication = !isClass && (
    Boolean(rollOpts["feat:runesmith-dedication"]) ||
    actor?.itemTypes?.feat?.some((f) => f.slug === "runesmith-dedication")
  );

  let maxRepertoire = 0;
  let maxEtched = 0;

  if (isClass) {
    // Lv 1-4: 4 rep / 2 etched; +2 rep & +1 etched every 4 levels (5, 9, 13, 17)
    const tier = Math.floor((level - 1) / 4);
    maxRepertoire = 4 + tier * 2;
    maxEtched = 2 + tier;
  } else if (isDedication) {
    const hasBasic = actor?.itemTypes?.feat?.some((f) => f.slug === "basic-rune-magic");
    const hasAdv = actor?.itemTypes?.feat?.some((f) => f.slug === "advanced-rune-magic");
    const hasExp = actor?.itemTypes?.feat?.some((f) => f.slug === "runic-expertise");
    maxRepertoire = 1 + (hasBasic ? 1 : 0) + (hasAdv ? 1 : 0) + (hasExp ? 1 : 0);
    maxEtched = 1 + Math.floor((level - 1) / 8);
  } else {
    // Fallback preview if GM opens deck for another character
    const tier = Math.floor((level - 1) / 4);
    maxRepertoire = 4 + tier * 2;
    maxEtched = 2 + tier;
  }

  // Expanded Glossary (Lv 12 feat) grants +1 daily bonus rune
  const hasExpandedGlossary = actor?.itemTypes?.feat?.some((f) => f.slug === "expanded-glossary");
  if (hasExpandedGlossary) maxRepertoire += 1;

  // Free etched slot feats
  const hasRunicTattoo = actor?.itemTypes?.feat?.some((f) => f.slug === "runic-tattoo");
  const hasVitalInk = actor?.itemTypes?.feat?.some((f) => f.slug === "drawn-in-vital-ink");
  const hasLivingLexicon = actor?.itemTypes?.feat?.some((f) => f.slug === "living-lexicon");

  return {
    level,
    isClass,
    isDedication,
    maxRepertoire,
    maxEtched,
    freeEtchedBonus: (hasRunicTattoo ? 1 : 0) + (hasVitalInk ? 1 : 0) + (hasLivingLexicon ? 2 : 0),
    features: {
      hasEngravingStrike: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "engraving-strike")),
      hasFortifyingKnock: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "fortifying-knock")),
      hasRemoteDetonation: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "remote-detonation")),
      hasTransposeEtching: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "transpose-etching")),
      hasDistantInvocation: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "distant-invocation")),
      hasTracingTrance: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "tracing-trance")),
      hasDiacriticFluency: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "diacritic-fluency")),
      hasRunicCrafter: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "runic-crafter")),
      hasElementalRevision: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "elemental-revision")),
      hasTerrifyingInvocation: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "terrifying-invocation")),
      hasVitalCompound: Boolean(actor?.itemTypes?.feat?.some((f) => f.slug === "vital-compound-invocation")),
      hasRunicTattoo,
      hasVitalInk,
      hasLivingLexicon,
      canTrace: !isDedication || Boolean(actor?.itemTypes?.feat?.some((f) =>
        ["tracing-studies", "engraving-strike", "engraving-maneuver", "edifying-trace", "swiping-trace", "pattern-flight"].includes(f.slug)
      ))
    }
  };
}

/**
 * Official Runic Crafter automatically unlocked fundamental rune formulas.
 */
export const RUNIC_CRAFTER_FUNDAMENTALS = [
  { level: 2, name: "Weapon Potency (+1)", category: "Weapon Fundamental" },
  { level: 4, name: "Striking", category: "Weapon Fundamental" },
  { level: 4, name: "Reinforcing Rune (Minor)", category: "Shield Fundamental" },
  { level: 5, name: "Armor Potency (+1)", category: "Armor Fundamental" },
  { level: 7, name: "Reinforcing Rune (Lesser)", category: "Shield Fundamental" },
  { level: 8, name: "Resilient", category: "Armor Fundamental" },
  { level: 10, name: "Weapon Potency (+2)", category: "Weapon Fundamental" },
  { level: 10, name: "Reinforcing Rune (Moderate)", category: "Shield Fundamental" },
  { level: 11, name: "Armor Potency (+2)", category: "Armor Fundamental" },
  { level: 12, name: "Striking (Greater)", category: "Weapon Fundamental" },
  { level: 13, name: "Reinforcing Rune (Greater)", category: "Shield Fundamental" },
  { level: 14, name: "Resilient (Greater)", category: "Armor Fundamental" },
  { level: 16, name: "Weapon Potency (+3)", category: "Weapon Fundamental" },
  { level: 16, name: "Reinforcing Rune (Major)", category: "Shield Fundamental" },
  { level: 18, name: "Armor Potency (+3)", category: "Armor Fundamental" },
  { level: 19, name: "Striking (Major)", category: "Weapon Fundamental" },
  { level: 19, name: "Reinforcing Rune (Supreme)", category: "Shield Fundamental" },
  { level: 20, name: "Resilient (Major)", category: "Armor Fundamental" }
];

/**
 * Recommended starter repertoire slugs (e.g. frontline melee + shield Runesmith).
 */
export const RECOMMENDED_STARTER_LOADOUT = [
  "atryl",
  "esvadir",
  "holtrik",
  "ranshu"
];

/**
 * All 44 Official Pathfinder: Impossible Magic Runesmith Runes.
 */
export const RUNES_DB = [
  // =========================================================================
  // LEVEL 1 BASE RUNES (16)
  // =========================================================================
  {
    slug: "atryl",
    name: "Atryl, Rune of Fire",
    shortName: "Atryl",
    subtitle: "Rune of Fire",
    level: 1,
    isDiacritic: false,
    role: "damage",
    color: "#f97316",
    icon: "icons/magic/symbols/rune-sigil-red-orange.webp",
    traits: ["fire", "primal", "rune", "runesmith"],
    targetCategory: "creature-or-object",
    usageText: "Drawn on a creature or object",
    etchOnly: false,
    passiveSummary: (lvl) => `Reduces bearer's Fire resistance by ${Math.ceil(Math.max(lvl, 1) / 2) + 4} (immunities unaffected).`,
    passiveRules: () => [],
    invocation: {
      traits: ["fire"],
      summary: (lvl) => `${Math.ceil(lvl / 2)}d8 fire (basic Fortitude); Crit Fail: Dazzled 1 round.`,
      damage: (lvl) => ({ dice: `${Math.ceil(lvl / 2)}d8`, type: "fire" }),
      save: { statistic: "fortitude", basic: true },
      targetMode: "bearer",
      critFailConditions: [{ slug: "dazzled", durationRounds: 1 }]
    }
  },
  {
    slug: "baruiel",
    name: "Baruiel, Rune of Hold's Bravery",
    shortName: "Baruiel",
    subtitle: "Rune of Hold's Bravery",
    level: 1,
    isDiacritic: false,
    role: "buff",
    color: "#eab308",
    icon: "icons/magic/symbols/fleur-de-lis-yellow.webp",
    traits: ["emotion", "magical", "mental", "rune", "runesmith"],
    targetCategory: "willing",
    usageText: "Drawn on a willing creature",
    etchOnly: false,
    passiveSummary: () => "While within 10 ft of an ally, reducing Frightened by 1 reduces it by 2 instead.",
    passiveRules: () => [
      {
        key: "Note",
        selector: ["saving-throw"],
        title: "Baruiel, Rune of Hold's Bravery",
        text: "While within 10 feet of an ally, whenever you reduce Frightened by 1, reduce it by 2 instead."
      }
    ],
    invocation: {
      traits: ["emotion", "mental"],
      summary: () => "Each ally within a 10-ft emanation reduces their Frightened condition by 2.",
      targetMode: "emanation-allies",
      emanationFeet: 10,
      special: "reduce-frightened-2"
    }
  },
  {
    slug: "camonica",
    name: "Camonica, Rune of Perplexity",
    shortName: "Camonica",
    subtitle: "Rune of Perplexity",
    level: 1,
    isDiacritic: false,
    role: "debuff",
    color: "#a855f7",
    icon: "icons/magic/symbols/runes-star-pentagon-orange-purple.webp",
    traits: ["mental", "occult", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: (lvl) => `First Concentrate action each round deals ${1 + Math.ceil(lvl / 2)} mental damage to bearer.`,
    passiveRules: (lvl) => [
      {
        key: "Note",
        selector: ["all"],
        title: "Camonica, Rune of Perplexity",
        text: `First Concentrate action each round deals ${1 + Math.ceil(lvl / 2)} mental damage to the rune-bearer.`
      }
    ],
    invocation: {
      traits: ["mental"],
      summary: (lvl) => `${Math.ceil(lvl / 2)}d4 mental (basic Will); Fail: Stupefied 1 (Crit Fail: Stupefied 2) for 1 round.`,
      damage: (lvl) => ({ dice: `${Math.ceil(lvl / 2)}d4`, type: "mental" }),
      save: { statistic: "will", basic: true },
      targetMode: "bearer",
      failConditions: [{ slug: "stupefied", value: 1, durationRounds: 1 }],
      critFailConditions: [{ slug: "stupefied", value: 2, durationRounds: 1 }]
    }
  },
  {
    slug: "esvadir",
    name: "Esvadir, Rune of Whetstones",
    shortName: "Esvadir",
    subtitle: "Rune of Whetstones",
    level: 1,
    isDiacritic: false,
    role: "damage",
    color: "#ef4444",
    icon: "icons/magic/symbols/runes-etched-steel-blade.webp",
    traits: ["magical", "rune", "runesmith"],
    targetCategory: "weapon-ps",
    usageText: "Drawn on a piercing or slashing weapon or unarmed attack",
    etchOnly: false,
    passiveSummary: () => "Strikes deal +2 persistent bleed damage per weapon damage die.",
    passiveRules: () => [
      {
        key: "FlatModifier",
        selector: ["strike-damage"],
        value: "2 * @weapon.system.damage.dice",
        damageType: "bleed",
        damageCategory: "persistent",
        label: "Esvadir (Persistent Bleed)",
        predicate: [{ or: ["item:damage:type:slashing", "item:damage:type:piercing", "item:trait:versatile-s", "item:trait:versatile-p"] }]
      }
    ],
    invocation: {
      traits: [],
      summary: (lvl) => `${Math.ceil(lvl / 2)}d8 slashing to a creature adjacent to the rune-bearer (basic Reflex).`,
      damage: (lvl) => ({ dice: `${Math.ceil(lvl / 2)}d8`, type: "slashing" }),
      save: { statistic: "reflex", basic: true },
      targetMode: "adjacent-enemy"
    }
  },
  {
    slug: "holtrik",
    name: "Holtrik, Rune of Dwarven Ramparts",
    shortName: "Holtrik",
    subtitle: "Rune of Dwarven Ramparts",
    level: 1,
    isDiacritic: false,
    role: "buff",
    color: "#38bdf8",
    icon: "icons/magic/symbols/cog-shield-white-blue.webp",
    traits: ["magical", "rune", "runesmith"],
    targetCategory: "shield",
    usageText: "Drawn on a shield",
    etchOnly: false,
    passiveSummary: () => "Grants +1 status bonus to AC while the rune-bearing shield is raised.",
    passiveRules: () => [
      {
        key: "FlatModifier",
        selector: ["ac"],
        value: 1,
        type: "status",
        label: "Holtrik, Rune of Dwarven Ramparts",
        predicate: ["self:shield:raised"]
      }
    ],
    invocation: {
      traits: [],
      summary: () => "Bearer immediately Raises the Shield (+1 status AC maintained until start of bearer's next turn).",
      targetMode: "bearer",
      special: "raise-shield-holtrik"
    }
  },
  {
    slug: "ledria",
    name: "Ledria, Rune of Appeal",
    shortName: "Ledria",
    subtitle: "Rune of Appeal",
    level: 1,
    isDiacritic: false,
    role: "utility",
    color: "#f59e0b",
    icon: "icons/magic/symbols/star-solid-gold.webp",
    traits: ["occult", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: (lvl) => `+${lvl >= 17 ? 3 : lvl >= 9 ? 2 : 1} status bonus to Deception, Diplomacy, and Performance checks.`,
    passiveRules: (lvl) => [
      {
        key: "FlatModifier",
        selector: ["deception", "diplomacy", "performance"],
        value: lvl >= 17 ? 3 : lvl >= 9 ? 2 : 1,
        type: "status",
        label: "Ledria, Rune of Appeal"
      }
    ],
    invocation: {
      traits: [],
      summary: () => "Each creature within 30 feet of the rune-bearer can Step closer as a free action.",
      targetMode: "bearer",
      special: "chat-only"
    }
  },
  {
    slug: "lyskel",
    name: "Lyskel, Rune of Frost",
    shortName: "Lyskel",
    subtitle: "Rune of Frost",
    level: 1,
    isDiacritic: false,
    role: "debuff",
    color: "#22d3ee",
    icon: "icons/magic/symbols/rune-sigil-rough-white-teal.webp",
    traits: ["cold", "primal", "rune", "runesmith"],
    targetCategory: "creature-or-object",
    usageText: "Drawn on a creature or object",
    etchOnly: false,
    passiveSummary: () => "–5-ft circumstance penalty to Speeds; taking a move action applies Clumsy 1 until start of next turn.",
    passiveRules: () => [
      {
        key: "FlatModifier",
        selector: ["speed"],
        value: -5,
        type: "circumstance",
        label: "Lyskel, Rune of Frost"
      }
    ],
    invocation: {
      traits: ["cold"],
      summary: (lvl) => `${Math.ceil(lvl / 2)}d4 cold (basic Fortitude); bearer's space & adjacent squares become snow difficult terrain for 1 round.`,
      damage: (lvl) => ({ dice: `${Math.ceil(lvl / 2)}d4`, type: "cold" }),
      save: { statistic: "fortitude", basic: true },
      targetMode: "bearer"
    }
  },
  {
    slug: "marssyl",
    name: "Marssyl, Rune of Impact",
    shortName: "Marssyl",
    subtitle: "Rune of Impact",
    level: 1,
    isDiacritic: false,
    role: "damage",
    color: "#fbbf24",
    icon: "icons/magic/symbols/runes-carved-stone-yellow.webp",
    traits: ["magical", "rune", "runesmith"],
    targetCategory: "weapon-b",
    usageText: "Drawn on a bludgeoning weapon or unarmed attack",
    etchOnly: false,
    passiveSummary: () => "Deals 1 bludgeoning splash damage per weapon damage die (you and melee wielder are immune).",
    passiveRules: () => [
      {
        key: "FlatModifier",
        selector: ["strike-damage"],
        value: "@weapon.system.damage.dice",
        damageType: "bludgeoning",
        damageCategory: "splash",
        label: "Marssyl (Impact Splash)",
        predicate: [{ or: ["item:damage:type:bludgeoning", "item:trait:versatile-b"] }]
      }
    ],
    invocation: {
      traits: [],
      summary: () => "Next successful Strike before end of wielder's next turn deals +1 weapon damage die and forces Fortitude save vs push 10 ft (20 ft on crit fail).",
      targetMode: "bearer",
      special: "grant-marssyl-invocation"
    }
  },
  {
    slug: "oljinex",
    name: "Oljinex, Rune of Cowards' Bane",
    shortName: "Oljinex",
    subtitle: "Rune of Cowards' Bane",
    level: 1,
    isDiacritic: false,
    role: "buff",
    color: "#10b981",
    icon: "icons/magic/symbols/arrowhead-green.webp",
    traits: ["arcane", "rune", "runesmith"],
    targetCategory: "shield",
    usageText: "Drawn on a shield",
    etchOnly: false,
    passiveSummary: (lvl) => `Shield gains +${2 + Math.floor((lvl - 1) / 4)} status bonus to Hardness against physical ranged attacks.`,
    passiveRules: (lvl) => [
      {
        key: "Note",
        selector: ["ac"],
        title: "Oljinex, Rune of Cowards' Bane",
        text: `Shield gains +${2 + Math.floor((lvl - 1) / 4)} status bonus to Hardness against physical ranged attacks.`
      }
    ],
    invocation: {
      traits: ["illusion", "mental", "visual"],
      summary: () => "Illusory wall prevents adjacent creatures from willingly moving farther from bearer for 1 round (Seek vs Class DC to disbelieve).",
      targetMode: "bearer",
      special: "chat-only"
    }
  },
  {
    slug: "pluuna",
    name: "Pluuna, Rune of Illumination",
    shortName: "Pluuna",
    subtitle: "Rune of Illumination",
    level: 1,
    isDiacritic: false,
    role: "utility",
    color: "#fde047",
    icon: "icons/magic/symbols/star-yellow.webp",
    traits: ["light", "magical", "rune", "runesmith"],
    targetCategory: "creature-or-armor",
    usageText: "Drawn on a creature or armor",
    etchOnly: false,
    passiveSummary: () => "Sheds 20-ft bright light (40-ft dim); creatures in bright light take –1 item penalty to Stealth.",
    passiveRules: () => [
      {
        key: "TokenLight",
        value: { bright: 20, dim: 40, color: "#fff6cc", alpha: 0.35, animation: { type: "pulse", speed: 2, intensity: 2 } }
      },
      {
        key: "FlatModifier",
        selector: ["stealth"],
        value: -1,
        type: "item",
        label: "Pluuna Illumination"
      }
    ],
    invocation: {
      traits: ["light"],
      summary: () => "Creatures in 20-ft light attempt Fortitude save vs Class DC; Failure: Dazzled 1 round. Light dims to 20-ft dim for 1 round.",
      save: { statistic: "fortitude", basic: false },
      targetMode: "emanation-all",
      emanationFeet: 20,
      failConditions: [{ slug: "dazzled", durationRounds: 1 }],
      critFailConditions: [{ slug: "dazzled", durationRounds: 1 }]
    }
  },
  {
    slug: "ranshu",
    name: "Ranshu, Rune of Thunder",
    shortName: "Ranshu",
    subtitle: "Rune of Thunder",
    level: 1,
    isDiacritic: false,
    role: "damage",
    color: "#60a5fa",
    icon: "icons/magic/symbols/symbol-lightning-bolt.webp",
    traits: ["electricity", "primal", "rune", "runesmith"],
    targetCategory: "creature-or-object",
    usageText: "Drawn on a creature or object",
    etchOnly: false,
    passiveSummary: (lvl) => `If bearer doesn't use a move action on its turn, takes ${Math.ceil(Math.max(lvl, 1) / 2) + 2} electricity damage at end of turn.`,
    passiveRules: (lvl) => [
      {
        key: "Note",
        selector: ["all"],
        title: "Ranshu, Rune of Thunder",
        text: `End of turn without a move action deals ${Math.ceil(Math.max(lvl, 1) / 2) + 2} electricity damage.`
      }
    ],
    invocation: {
      traits: ["electricity"],
      summary: (lvl) => `${Math.ceil(lvl / 2)}d8 electricity damage to rune-bearer (basic Fortitude).`,
      damage: (lvl) => ({ dice: `${Math.ceil(lvl / 2)}d8`, type: "electricity" }),
      save: { statistic: "fortitude", basic: true },
      targetMode: "bearer"
    }
  },
  {
    slug: "rehgog",
    name: "Rehgog, Rune of Bestial Might",
    shortName: "Rehgog",
    subtitle: "Rune of Bestial Might",
    level: 1,
    isDiacritic: false,
    role: "buff",
    color: "#84cc16",
    icon: "icons/magic/symbols/rune-sigil-green.webp",
    traits: ["morph", "primal", "rune", "runesmith"],
    targetCategory: "willing",
    usageText: "Drawn on a willing creature",
    etchOnly: false,
    passiveSummary: () => "Grants imprecise scent 30 feet.",
    passiveRules: () => [
      { key: "Sense", selector: "scent", acuity: "imprecise", range: 30 }
    ],
    invocation: {
      traits: ["morph"],
      summary: () => "Bearer immediately Steps (free action) and next unarmed Strike before start of your next turn deals +1 weapon damage die.",
      targetMode: "bearer",
      special: "grant-rehgog-invocation"
    }
  },
  {
    slug: "sertum",
    name: "Sertum, Rune of Preparedness",
    shortName: "Sertum",
    subtitle: "Rune of Preparedness",
    level: 1,
    isDiacritic: false,
    role: "utility",
    color: "#22c55e",
    icon: "icons/magic/symbols/clover-luck-white-green.webp",
    traits: ["primal", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: (lvl) => `+${lvl >= 17 ? 3 : lvl >= 9 ? 2 : 1} status bonus to Survival (and terrain Lore); may roll Survival for Initiative.`,
    passiveRules: (lvl) => [
      {
        key: "FlatModifier",
        selector: ["survival"],
        value: lvl >= 17 ? 3 : lvl >= 9 ? 2 : 1,
        type: "status",
        label: "Sertum, Rune of Preparedness"
      }
    ],
    invocation: {
      traits: [],
      summary: () => "Rune-bearer can Step up to 3 times as a free action.",
      targetMode: "bearer",
      special: "chat-only"
    }
  },
  {
    slug: "thullax",
    name: "Thullax, Rune of Corrosion",
    shortName: "Thullax",
    subtitle: "Rune of Corrosion",
    level: 1,
    isDiacritic: false,
    role: "damage",
    color: "#4ade80",
    icon: "icons/magic/symbols/runes-carved-stone-green.webp",
    traits: ["acid", "arcane", "rune", "runesmith"],
    targetCategory: "creature-or-object",
    usageText: "Drawn on a creature or object",
    etchOnly: false,
    passiveSummary: (lvl) => `Reduces bearer's physical damage resistances by ${Math.floor(lvl / 2) + 1} (immunities unaffected).`,
    passiveRules: () => [],
    invocation: {
      traits: ["acid"],
      summary: (lvl) => `${Math.ceil(lvl / 2)}d6 acid (basic Fortitude); Crit Fail: ${Math.ceil(lvl / 2)} persistent acid damage.`,
      damage: (lvl) => ({
        dice: `${Math.ceil(lvl / 2)}d6`,
        type: "acid",
        critFailPersistent: `${Math.ceil(lvl / 2)}`,
        critFailPersistentType: "acid"
      }),
      save: { statistic: "fortitude", basic: true },
      targetMode: "bearer"
    }
  },
  {
    slug: "tilus",
    name: "Tilus, Rune of Vocabulary",
    shortName: "Tilus",
    subtitle: "Rune of Vocabulary",
    level: 1,
    isDiacritic: false,
    role: "utility",
    color: "#c084fc",
    icon: "icons/magic/symbols/runes-triangle-blue.webp",
    traits: ["arcane", "mental", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: (lvl) => `Speaks/understands 1 chosen language; +${lvl >= 17 ? 3 : lvl >= 9 ? 2 : 1} status to Society & writing Lore.`,
    passiveRules: (lvl) => [
      {
        key: "FlatModifier",
        selector: ["society"],
        value: lvl >= 17 ? 3 : lvl >= 9 ? 2 : 1,
        type: "status",
        label: "Tilus, Rune of Vocabulary"
      }
    ],
    invocation: {
      traits: ["mental"],
      summary: () => "For 1 round, bearer auto-succeeds flat checks vs auditory disruption (e.g. Deafened) and speaks clearly even if Confused/controlled.",
      targetMode: "bearer",
      special: "chat-only"
    }
  },
  {
    slug: "zohk",
    name: "Zohk, Rune of Homecoming",
    shortName: "Zohk",
    subtitle: "Rune of Homecoming",
    level: 1,
    isDiacritic: false,
    role: "utility",
    color: "#38bdf8",
    icon: "icons/magic/symbols/chevron-elipse-circle-blue.webp",
    traits: ["arcane", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: () => "+15-ft status bonus to Speeds when movement ends closer to you than where bearer started its turn.",
    passiveRules: () => [
      {
        key: "RollOption",
        option: "zohk-moving-closer",
        toggleable: true,
        label: "Zohk — Ending movement closer to Runesmith"
      },
      {
        key: "FlatModifier",
        selector: ["speed"],
        value: 15,
        type: "status",
        label: "Zohk, Rune of Homecoming",
        predicate: ["zohk-moving-closer"]
      }
    ],
    invocation: {
      traits: ["teleportation"],
      summary: () => "Teleport rune-bearer to an unoccupied square adjacent to you (unwilling target gets Will save vs Class DC to negate).",
      save: { statistic: "will", basic: false, unwillingOnly: true },
      targetMode: "bearer",
      special: "teleport-adjacent"
    }
  },

  // =========================================================================
  // LEVEL 5 DIACRITIC RUNES (8)
  // =========================================================================
  {
    slug: "av-diacritic",
    name: "Av-, Diacritic Rune of Succession",
    shortName: "Av-",
    prefix: "Av-",
    subtitle: "Diacritic of Succession",
    level: 5,
    isDiacritic: true,
    diacriticFilter: "any",
    cooldownMinutes: 10,
    role: "diacritic",
    color: "#a78bfa",
    icon: "icons/magic/symbols/ring-circle-smoke-blue.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-any",
    usageText: "Drawn on a rune on a creature (max 1 active; 10-min cooldown after invoke)",
    passiveSummary: () => "When base rune is invoked, Invoke a single Rune on another rune-bearer within 15 ft as a free action.",
    passiveRules: () => [],
    invocation: { summary: () => "Free-action secondary Invoke Rune on a different rune-bearer within 15 ft (10m cooldown)." }
  },
  {
    slug: "en-diacritic",
    name: "En-, Diacritic Rune of Expansion",
    shortName: "En-",
    prefix: "En-",
    subtitle: "Diacritic of Expansion",
    level: 5,
    isDiacritic: true,
    diacriticFilter: "damage",
    role: "diacritic",
    color: "#fb923c",
    icon: "icons/magic/symbols/runes-star-orange.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-damage",
    usageText: "Drawn on a damage-dealing rune",
    passiveSummary: () => "Expands base rune's invocation to also hit all other creatures in a 15-ft emanation around the bearer.",
    passiveRules: () => [],
    invocation: { summary: () => "Expands invocation to a 15-ft emanation around the rune-bearer (each creature affected max once)." }
  },
  {
    slug: "fob-diacritic",
    name: "Fob-, Diacritic Rune of Doubling",
    shortName: "Fob-",
    prefix: "Fob-",
    subtitle: "Diacritic of Doubling",
    level: 5,
    isDiacritic: true,
    diacriticFilter: "nondamage",
    role: "diacritic",
    color: "#34d399",
    icon: "icons/magic/symbols/squares-3d-green.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-nondamage",
    usageText: "Drawn on a rune that doesn't deal damage",
    passiveSummary: () => "When invoked, you (the Runesmith) can choose to also gain the invocation's effect.",
    passiveRules: () => [],
    invocation: { summary: () => "Also applies non-damaging invocation benefit to you (the Runesmith)." }
  },
  {
    slug: "kit-diacritic",
    name: "Kit-, Diacritic Rune of Mercy",
    shortName: "Kit-",
    prefix: "Kit-",
    subtitle: "Diacritic of Mercy",
    level: 5,
    isDiacritic: true,
    diacriticFilter: "damage-nonvoid",
    role: "diacritic",
    color: "#f472b6",
    icon: "icons/magic/symbols/circled-gem-pink.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-damage",
    usageText: "Drawn on a damage rune without death or void traits",
    passiveSummary: () => "Invocation gains nonlethal trait, and the rune-bearer takes a –1 status penalty to saves against it.",
    passiveRules: () => [],
    invocation: { summary: () => "Invocation becomes nonlethal; rune-bearer takes –1 status penalty to its saving throw." }
  },
  {
    slug: "per-diacritic",
    name: "Per-, Diacritic Rune of Continuum",
    shortName: "Per-",
    prefix: "Per-",
    subtitle: "Diacritic of Continuum",
    level: 5,
    isDiacritic: true,
    diacriticFilter: "any",
    cooldownMinutes: 10,
    role: "diacritic",
    color: "#2dd4bf",
    icon: "icons/magic/symbols/circle-ouroboros.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-any",
    usageText: "Drawn on any rune (max 1 active; 10-min cooldown after invoke)",
    passiveSummary: () => "After base rune is invoked, automatically Traces itself onto a different target within 15 ft.",
    passiveRules: () => [],
    invocation: { summary: () => "Re-Traces base rune onto another target within 15 ft of bearer (10m cooldown)." }
  },
  {
    slug: "sun-diacritic",
    name: "Sun-, Diacritic Rune of Preservation",
    shortName: "Sun-",
    prefix: "Sun-",
    subtitle: "Diacritic of Preservation",
    level: 5,
    isDiacritic: true,
    diacriticFilter: "any",
    cooldownMinutes: 10,
    role: "diacritic",
    color: "#facc15",
    icon: "icons/magic/symbols/star-inverted-yellow.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-any",
    usageText: "Drawn on any rune (max 1 active; 10-min cooldown after invoke)",
    passiveSummary: () => "After base rune is invoked, automatically Traces the base rune right back onto the same target.",
    passiveRules: () => [],
    invocation: { summary: () => "Automatically re-Traces the base rune onto the same target (10m cooldown)." }
  },
  {
    slug: "ti-diacritic",
    name: "Ti-, Diacritic Rune of Fundaments",
    shortName: "Ti-",
    prefix: "Ti-",
    subtitle: "Diacritic of Fundaments",
    level: 5,
    isDiacritic: true,
    diacriticFilter: "elemental",
    role: "diacritic",
    color: "#38bdf8",
    icon: "icons/magic/symbols/elements-air-earth-fire-water.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-elemental",
    usageText: "Drawn on a rune dealing acid, cold, electricity, or fire damage",
    passiveSummary: () => "When invoked, change the invocation's elemental damage type to acid, cold, electricity, or fire.",
    passiveRules: () => [],
    invocation: { summary: () => "Swaps invocation damage type to chosen element (acid, cold, electricity, or fire)." }
  },
  {
    slug: "ur-diacritic",
    name: "Ur-, Diacritic Rune of Intensity",
    shortName: "Ur-",
    prefix: "Ur-",
    subtitle: "Diacritic of Intensity",
    level: 5,
    isDiacritic: true,
    diacriticFilter: "damage",
    role: "diacritic",
    color: "#ef4444",
    icon: "icons/magic/symbols/rune-sigil-hook-white-red.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-damage",
    usageText: "Drawn on a rune that deals damage",
    passiveSummary: (lvl) => `Invocation gains a +${2 + Math.floor(lvl / 2)} status bonus to damage.`,
    passiveRules: () => [],
    invocation: { summary: (lvl) => `Adds +${2 + Math.floor(lvl / 2)} status bonus to invocation damage.` }
  },

  // =========================================================================
  // LEVEL 9 BASE RUNES (12)
  // =========================================================================
  {
    slug: "astillu",
    name: "Astillu, Rune of Submersion",
    shortName: "Astillu",
    subtitle: "Rune of Submersion",
    level: 9,
    isDiacritic: false,
    role: "utility",
    color: "#0ea5e9",
    icon: "icons/magic/symbols/cross-circle-blue.webp",
    traits: ["magical", "rune", "runesmith", "water"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: () => "Breathe underwater, gain Swim Speed equal to Land Speed (min 30 ft), ignore underwater melee penalties.",
    passiveRules: () => [
      { key: "ActiveEffectLike", mode: "upgrade", path: "system.attributes.speed.otherSpeeds", value: [{ type: "swim", value: 30 }] }
    ],
    invocation: {
      traits: ["water"],
      summary: () => "Bearer Swims up to 60 feet as a free action without triggering reactions.",
      targetMode: "bearer",
      special: "chat-only"
    }
  },
  {
    slug: "cruonign",
    name: "Cruonign, Rune of Leeching",
    shortName: "Cruonign",
    subtitle: "Rune of Leeching",
    level: 9,
    isDiacritic: false,
    role: "damage",
    color: "#ec4899",
    icon: "icons/magic/symbols/rune-sigil-black-pink.webp",
    traits: ["death", "magical", "rune", "runesmith", "void"],
    targetCategory: "weapon-ps",
    usageText: "Drawn on a slashing or piercing weapon",
    etchOnly: false,
    passiveSummary: (lvl) => `Strikes deal +${3 + Math.max(0, Math.floor((lvl - 9) / 2))} void damage and grant equal temporary HP for 1 round.`,
    passiveRules: (lvl) => [
      {
        key: "FlatModifier",
        selector: ["strike-damage"],
        value: 3 + Math.max(0, Math.floor((lvl - 9) / 2)),
        damageType: "void",
        label: "Cruonign, Rune of Leeching",
        predicate: [{ or: ["item:damage:type:slashing", "item:damage:type:piercing"] }]
      }
    ],
    invocation: {
      traits: ["death", "void"],
      summary: (lvl) => `30-ft cone: ${4 + Math.max(0, Math.floor((lvl - 9) / 2))}d10 void (basic Fortitude); wielder heals ${12 + Math.max(0, Math.floor((lvl - 9) / 2)) * 3} HP if any take damage.`,
      damage: (lvl) => ({ dice: `${4 + Math.max(0, Math.floor((lvl - 9) / 2))}d10`, type: "void" }),
      save: { statistic: "fortitude", basic: true },
      targetMode: "emanation-enemies",
      emanationFeet: 30,
      selfHeal: (lvl) => 12 + Math.max(0, Math.floor((lvl - 9) / 2)) * 3
    }
  },
  {
    slug: "feikris",
    name: "Feikris, Rune of Gravity",
    shortName: "Feikris",
    subtitle: "Rune of Gravity",
    level: 9,
    isDiacritic: false,
    role: "utility",
    color: "#8b5cf6",
    icon: "icons/magic/symbols/runes-star-blue.webp",
    traits: ["arcane", "magical", "rune", "runesmith"],
    targetCategory: "creature-or-armor",
    usageText: "Drawn on a creature or armor",
    etchOnly: false,
    passiveSummary: (lvl) => `+${lvl >= 17 ? 3 : 2} status to Athletics; can Disarm/Grapple/Reposition/Shove/Trip creatures up to 2 sizes larger (3 if legendary).`,
    passiveRules: (lvl) => [
      {
        key: "FlatModifier",
        selector: ["athletics"],
        value: lvl >= 17 ? 3 : 2,
        type: "status",
        label: "Feikris, Rune of Gravity"
      }
    ],
    invocation: {
      traits: [],
      summary: () => "Creatures in 15-ft emanation attempt Fortitude save vs Class DC; Fail: pulled 5 ft toward bearer (10 ft on Crit Fail).",
      save: { statistic: "fortitude", basic: false },
      targetMode: "emanation-all",
      emanationFeet: 15
    }
  },
  {
    slug: "germantria",
    name: "Germantria, Rune of Partnership",
    shortName: "Germantria",
    subtitle: "Rune of Partnership",
    level: 9,
    isDiacritic: false,
    role: "buff",
    color: "#14b8a6",
    icon: "icons/magic/symbols/rune-sigil-white-pink.webp",
    traits: ["magical", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: () => "While within 1 mile, bearer takes half HP damage and you take the other half (unreduced). Fades if either hits 0 HP.",
    passiveRules: () => [
      {
        key: "Note",
        selector: ["damage-received"],
        title: "Germantria, Rune of Partnership",
        text: "Bearer takes half HP damage; the Runesmith takes the remaining half (bypassing resistances)."
      }
    ],
    invocation: {
      traits: ["healing"],
      summary: (lvl) => `Both you and the rune-bearer regain ${20 + Math.max(0, Math.floor((lvl - 9) / 2)) * 5} Hit Points.`,
      targetMode: "bearer",
      special: "heal-partnership",
      healAmount: (lvl) => 20 + Math.max(0, Math.floor((lvl - 9) / 2)) * 5
    }
  },
  {
    slug: "ichelsu",
    name: "Ichelsu, Rune of Observation",
    shortName: "Ichelsu",
    subtitle: "Rune of Observation",
    level: 9,
    isDiacritic: false,
    role: "utility",
    color: "#6366f1",
    icon: "icons/magic/symbols/question-stone-yellow.webp",
    traits: ["occult", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: () => "Grants See the Unseen and all-around vision (cannot be flanked).",
    passiveRules: () => [
      { key: "ActiveEffectLike", mode: "override", path: "system.attributes.flanking.flankable", value: false }
    ],
    invocation: {
      traits: [],
      summary: () => "20-ft emanation for 2 rounds: Invisible creatures become Concealed instead; Concealed creatures lose concealment.",
      targetMode: "emanation-enemies",
      emanationFeet: 20,
      special: "chat-only"
    }
  },
  {
    slug: "jurroz",
    name: "Jurroz, Rune of Dragon Fury",
    shortName: "Jurroz",
    subtitle: "Rune of Dragon Fury",
    level: 9,
    isDiacritic: false,
    role: "buff",
    color: "#dc2626",
    icon: "icons/magic/symbols/runes-carved-stone-red.webp",
    traits: ["magical", "rune", "runesmith"],
    targetCategory: "creature-or-armor",
    usageText: "Etched onto a creature or armor (Etch only)",
    etchOnly: true,
    passiveSummary: () => "Any creature that Strikes or Steals from bearer becomes Off-Guard for 1 round.",
    passiveRules: () => [
      {
        key: "Note",
        selector: ["ac"],
        title: "Jurroz, Rune of Dragon Fury",
        text: "Creatures that Strike or Steal from the rune-bearer become Off-Guard for 1 round."
      }
    ],
    invocation: {
      traits: [],
      summary: () => "Bearer Flies up to 60 ft (free action) toward a foe that damaged them in the last minute; if ending adjacent, foe is Off-Guard until end of bearer's next turn.",
      targetMode: "bearer",
      special: "chat-only"
    }
  },
  {
    slug: "kojastri",
    name: "Kojastri, Rune of Insulation",
    shortName: "Kojastri",
    subtitle: "Rune of Insulation",
    level: 9,
    isDiacritic: false,
    role: "buff",
    color: "#06b6d4",
    icon: "icons/magic/symbols/cog-orange-red.webp",
    traits: ["arcane", "rune", "runesmith"],
    targetCategory: "armor",
    usageText: "Drawn on armor (choose cold, electricity, or fire)",
    etchOnly: false,
    needsEnergyChoice: true,
    passiveSummary: (lvl, energy = "fire") => `Resistance ${4 + Math.max(0, Math.floor((lvl - 9) / 2))} to ${energy}; melee attackers without reach take ${2 + Math.max(0, Math.floor((lvl - 9) / 2))} ${energy} damage.`,
    passiveRules: (lvl, opts = {}) => [
      {
        key: "Resistance",
        type: opts.energyChoice || "fire",
        value: 4 + Math.max(0, Math.floor((lvl - 9) / 2))
      }
    ],
    invocation: {
      traits: [],
      summary: (lvl, energy = "fire") => `Creature grabbing/restraining/engulfing wearer takes ${8 + Math.max(0, Math.floor((lvl - 9) / 2)) * 2}d4 ${energy} (basic Reflex) and releases wearer on failure.`,
      damage: (lvl, opts = {}) => ({
        dice: `${8 + Math.max(0, Math.floor((lvl - 9) / 2)) * 2}d4`,
        type: opts.energyChoice || "fire"
      }),
      save: { statistic: "reflex", basic: true },
      targetMode: "adjacent-enemy"
    }
  },
  {
    slug: "oraloq",
    name: "Oraloq, Rune of Inarticulateness",
    shortName: "Oraloq",
    subtitle: "Rune of Inarticulateness",
    level: 9,
    isDiacritic: false,
    role: "debuff",
    color: "#d946ef",
    icon: "icons/magic/symbols/mask-yellow-orange.webp",
    traits: ["magical", "mental", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: () => "Linguistic actions and non-subtle Cast a Spell require a DC 5 flat check or the action is lost.",
    passiveRules: () => [
      {
        key: "Note",
        selector: ["all"],
        title: "Oraloq, Rune of Inarticulateness",
        text: "Linguistic actions and non-subtle spells require @Check[flat|dc:5] or the action is lost."
      }
    ],
    invocation: {
      traits: ["mental"],
      summary: (lvl) => `Will save vs Class DC; on Fail, first language/linguistic/non-subtle spell before end of next turn deals ${20 + Math.max(0, Math.floor((lvl - 9) / 2)) * 5} mental damage (double on Crit Fail).`,
      damage: (lvl) => ({ dice: `${20 + Math.max(0, Math.floor((lvl - 9) / 2)) * 5}`, type: "mental" }),
      save: { statistic: "will", basic: false },
      targetMode: "bearer"
    }
  },
  {
    slug: "piteregrin",
    name: "Piteregrin, Rune of Transposition",
    shortName: "Piteregrin",
    subtitle: "Rune of Transposition",
    level: 9,
    isDiacritic: false,
    role: "utility",
    color: "#38bdf8",
    icon: "icons/magic/symbols/rune-sigil-horned-white-purple.webp",
    traits: ["magical", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: () => "Bearer gains a 1-action teleport swap with any other willing rune-bearer within 15 feet.",
    passiveRules: () => [],
    invocation: {
      traits: ["teleportation"],
      summary: () => "Swallows bearer and adjacent Large-or-smaller creatures, repositioning each within a 15-ft emanation (unwilling creatures get Will save vs Class DC).",
      save: { statistic: "will", basic: false, unwillingOnly: true },
      targetMode: "emanation-all",
      emanationFeet: 15
    }
  },
  {
    slug: "trolistri",
    name: "Trolistri, Rune of Forlorn Sorrow",
    shortName: "Trolistri",
    subtitle: "Rune of Forlorn Sorrow",
    level: 9,
    isDiacritic: false,
    role: "debuff",
    color: "#818cf8",
    icon: "icons/magic/symbols/runes-carved-stone-purple.webp",
    traits: ["arcane", "emotion", "mental", "rune", "runesmith"],
    targetCategory: "creature-or-armor",
    usageText: "Etched onto armor or a creature (Etch only)",
    etchOnly: true,
    passiveSummary: () => "Enemies within 20 feet treat all squares between them and the rune-bearer as difficult terrain.",
    passiveRules: () => [],
    invocation: {
      traits: ["emotion", "mental"],
      summary: () => "Enemies in 15-ft emanation attempt Will save vs Class DC; Fail: Slowed 1 (Crit Fail: Slowed 2) for 1 round (1-hr immunity).",
      save: { statistic: "will", basic: false },
      targetMode: "emanation-enemies",
      emanationFeet: 15,
      failConditions: [{ slug: "slowed", value: 1, durationRounds: 1 }],
      critFailConditions: [{ slug: "slowed", value: 2, durationRounds: 1 }]
    }
  },
  {
    slug: "ulgatus",
    name: "Ulgatus, Rune of Restraint",
    shortName: "Ulgatus",
    subtitle: "Rune of Restraint",
    level: 9,
    isDiacritic: false,
    role: "buff",
    color: "#94a3b8",
    icon: "icons/magic/symbols/mask-metal-silver-white.webp",
    traits: ["magical", "rune", "runesmith"],
    targetCategory: "armor",
    usageText: "Drawn on armor",
    etchOnly: false,
    passiveSummary: (lvl) => `DC ${lvl >= 17 ? 10 : 15} flat check to negate gaining Drained, Enfeebled, or Sickened (then dormant 10m).`,
    passiveRules: () => [],
    invocation: {
      traits: [],
      summary: (lvl) => `Wearer gains resistance ${lvl >= 17 ? 20 : 10} to critical hits for 1 minute.`,
      targetMode: "bearer",
      special: "grant-ulgatus-invocation"
    }
  },
  {
    slug: "yudici",
    name: "Yudici, Rune of Remonstrance",
    shortName: "Yudici",
    subtitle: "Rune of Remonstrance",
    level: 9,
    isDiacritic: false,
    role: "buff",
    color: "#facc15",
    icon: "icons/magic/symbols/cog-glowing-green.webp",
    traits: ["aura", "divine", "magical", "rune", "runesmith"],
    targetCategory: "shield",
    usageText: "Drawn on a shield",
    etchOnly: false,
    passiveSummary: () => "While shield is raised, allies in 10-ft emanation gain +1 circumstance bonus to AC.",
    passiveRules: () => [
      {
        key: "Note",
        selector: ["ac"],
        title: "Yudici, Rune of Remonstrance",
        text: "While shield is raised, allies in 10-ft emanation gain +1 circumstance bonus to AC."
      }
    ],
    invocation: {
      traits: ["divine"],
      summary: (lvl) => `Shield regains ${40 + Math.max(0, Math.floor((lvl - 9) / 3)) * 10} HP; allies in 10-ft emanation gain +1 status to attacks and skill checks for 1 round.`,
      targetMode: "emanation-allies",
      emanationFeet: 10,
      special: "grant-yudici-invocation"
    }
  },

  // =========================================================================
  // LEVEL 13 DIACRITIC RUNES (4)
  // =========================================================================
  {
    slug: "eck-diacritic",
    name: "Eck-, Diacritic Rune of Phantasma",
    shortName: "Eck-",
    prefix: "Eck-",
    subtitle: "Diacritic of Phantasma",
    level: 13,
    isDiacritic: true,
    diacriticFilter: "damage",
    role: "diacritic",
    color: "#c084fc",
    icon: "icons/magic/symbols/star-rising-purple.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-damage",
    usageText: "Drawn on a damage-dealing rune",
    passiveSummary: (lvl) => `Converts base rune damage to spirit; adjacent enemies take ${lvl >= 17 ? 2 : 1}d8 persistent spirit damage.`,
    passiveRules: () => [],
    invocation: { summary: (lvl) => `Damage becomes spirit; enemies adjacent to bearer take ${lvl >= 17 ? 2 : 1}d8 persistent spirit.` }
  },
  {
    slug: "inth-diacritic",
    name: "Inth-, Diacritic Rune of Corruption",
    shortName: "Inth-",
    prefix: "Inth-",
    subtitle: "Diacritic of Corruption",
    level: 13,
    isDiacritic: true,
    diacriticFilter: "any",
    role: "diacritic",
    color: "#ef4444",
    icon: "icons/magic/symbols/triangle-glow-purple.webp",
    traits: ["diacritic", "divine", "magical", "rune", "runesmith", "unholy"],
    targetCategory: "diacritic-any",
    usageText: "Drawn on any rune",
    passiveSummary: (lvl) => `Adds unholy trait (Holy bearers become Enfeebled 2); invocation adds ${2 + Math.max(0, Math.floor((lvl - 13) / 2)) * 2}d4 persistent fire.`,
    passiveRules: () => [],
    invocation: { summary: (lvl) => `Adds unholy trait + ${2 + Math.max(0, Math.floor((lvl - 13) / 2)) * 2}d4 persistent fire damage.` }
  },
  {
    slug: "nesh-diacritic",
    name: "Nesh-, Diacritic Rune of Contingency",
    shortName: "Nesh-",
    prefix: "Nesh-",
    subtitle: "Diacritic of Contingency",
    level: 13,
    isDiacritic: true,
    diacriticFilter: "any",
    cooldownMinutes: 10,
    role: "diacritic",
    color: "#38bdf8",
    icon: "icons/magic/symbols/runes-triangle-magenta.webp",
    traits: ["diacritic", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-any",
    usageText: "Drawn on any rune (max 1 active; 10-min cooldown after invoke)",
    passiveSummary: () => "Define a Ready-style trigger; when triggered, Invoke the base rune as a Reaction.",
    passiveRules: () => [],
    invocation: { summary: () => "Invokes base rune as a Reaction when trigger occurs (10m cooldown)." }
  },
  {
    slug: "sar-diacritic",
    name: "Sar-, Diacritic Rune of Righteousness",
    shortName: "Sar-",
    prefix: "Sar-",
    subtitle: "Diacritic of Righteousness",
    level: 13,
    isDiacritic: true,
    diacriticFilter: "any",
    role: "diacritic",
    color: "#fef08a",
    icon: "icons/magic/symbols/runes-star-magenta.webp",
    traits: ["diacritic", "divine", "holy", "magical", "rune", "runesmith"],
    targetCategory: "diacritic-any",
    usageText: "Drawn on any rune",
    passiveSummary: () => "Adds holy trait (Unholy bearers become Enfeebled 2); invocation inflicts Drained 1 on target.",
    passiveRules: () => [],
    invocation: { summary: () => "Adds holy trait and inflicts Drained 1 on the target." }
  },

  // =========================================================================
  // LEVEL 17 BASE RUNES (4)
  // =========================================================================
  {
    slug: "aiuen",
    name: "Aiuen, The Elf-Gate Key Rune",
    shortName: "Aiuen",
    subtitle: "The Elf-Gate Key Rune",
    level: 17,
    isDiacritic: false,
    role: "utility",
    color: "#34d399",
    icon: "icons/magic/symbols/triangle-glowing-green.webp",
    traits: ["arcane", "rune", "runesmith", "teleportation"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: () => "Once per turn when bearer Strides, they can teleport up to their Speed instead.",
    passiveRules: () => [],
    invocation: {
      traits: ["teleportation"],
      summary: () => "Teleport bearer adjacent to any of your other runes on the same plane (unwilling max 60 ft, Will save negates).",
      save: { statistic: "will", basic: false, unwillingOnly: true },
      targetMode: "bearer"
    }
  },
  {
    slug: "ochygholl",
    name: "Ochygholl, The Poisoned Star",
    shortName: "Ochygholl",
    subtitle: "The Poisoned Star",
    level: 17,
    isDiacritic: false,
    role: "damage",
    color: "#f43f5e",
    icon: "icons/magic/symbols/runes-star-orange-purple.webp",
    traits: ["magical", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: () => "Bearer is Doomed 1 (contagious to adjacent allies at start of turn); doomed creatures take 10 mental on first attack/skill check each round.",
    passiveRules: () => [
      { key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.3uh1r86TzbQvosxv" }
    ],
    invocation: {
      traits: ["fire", "death"],
      summary: () => "Meteorite strike! 10-ft burst deals 3d10 bludgeoning + 40-ft burst deals 8d6 fire (basic Reflex saves).",
      damage: () => ({ dice: "3d10[bludgeoning] + 8d6[fire]", type: "fire" }),
      save: { statistic: "reflex", basic: true },
      targetMode: "emanation-enemies",
      emanationFeet: 40
    }
  },
  {
    slug: "rovan",
    name: "Rovan, Seal of the Dead Vault Rune",
    shortName: "Rovan",
    subtitle: "Seal of the Dead Vault",
    level: 17,
    isDiacritic: false,
    role: "debuff",
    color: "#ca8a04",
    icon: "icons/magic/symbols/runes-triangle-orange.webp",
    traits: ["divine", "earth", "rune", "runesmith"],
    targetCategory: "creature",
    usageText: "Drawn on a creature",
    etchOnly: false,
    passiveSummary: () => "–20-ft penalty to Land Speed and –40-ft penalty to all other Speeds.",
    passiveRules: () => [
      { key: "FlatModifier", selector: ["land-speed"], value: -20, label: "Rovan Land Bind" },
      { key: "FlatModifier", selector: ["fly-speed", "swim-speed", "climb-speed", "burrow-speed"], value: -40, label: "Rovan Vault Bind" }
    ],
    invocation: {
      traits: ["earth", "incapacitation"],
      summary: () => "Fortitude save vs Class DC: Success Slowed 1; Fail Slowed 2; Crit Fail Slowed 2 + Restrained + Blinded (petrified in 3 rounds).",
      save: { statistic: "fortitude", basic: false },
      targetMode: "bearer",
      successConditions: [{ slug: "slowed", value: 1, durationRounds: 1 }],
      failConditions: [{ slug: "slowed", value: 2, durationRounds: 1 }],
      critFailConditions: [
        { slug: "slowed", value: 2, durationRounds: 3 },
        { slug: "restrained", durationRounds: 3 },
        { slug: "blinded", durationRounds: 3 }
      ]
    }
  },
  {
    slug: "xinsala",
    name: "Xinsala, The Well of Virtues",
    shortName: "Xinsala",
    subtitle: "The Well of Virtues",
    level: 17,
    isDiacritic: false,
    role: "buff",
    color: "#fde047",
    icon: "icons/magic/symbols/rune-sigil-green-purple.webp",
    traits: ["magical", "rune", "runesmith"],
    targetCategory: "square",
    usageText: "Drawn on an unoccupied square",
    etchOnly: false,
    passiveSummary: () => "30-ft aura: you and allies gain +1 status to AC & saves vs magic, and resistance 10 to magic damage.",
    passiveRules: () => [
      { key: "FlatModifier", selector: ["ac", "saving-throw"], value: 1, type: "status", predicate: ["magical"], label: "Xinsala Aura" }
    ],
    invocation: {
      traits: ["healing", "vitality"],
      summary: () => "Distribute 70 HP of healing in 30-ft area; you and allies gain +20-ft status Speed and Quickened (Stride/Strike) for 1 round.",
      targetMode: "emanation-allies",
      emanationFeet: 30,
      special: "grant-xinsala-invocation"
    }
  }
];

export const RUNES_BY_SLUG = Object.fromEntries(RUNES_DB.map((r) => [r.slug, r]));

export function getRuneBySlug(slug) {
  return RUNES_BY_SLUG[slug] ?? null;
}

export function isDiacriticCompatible(diacritic, baseRune) {
  if (!diacritic?.isDiacritic || !baseRune || baseRune.isDiacritic) return false;
  const hasDamage = typeof baseRune.invocation?.damage === "function";
  switch (diacritic.diacriticFilter) {
    case "damage":
      return hasDamage;
    case "nondamage":
      return !hasDamage;
    case "damage-nonvoid":
      return hasDamage && !baseRune.traits.includes("death") && !baseRune.traits.includes("void");
    case "elemental": {
      if (!hasDamage) return false;
      const sample = baseRune.invocation.damage(1, {});
      return ELEMENTAL_TYPES.includes(sample?.type);
    }
    default:
      return true;
  }
}
