import {
  ELEMENTAL_TYPES,
  RECOMMENDED_STARTER_LOADOUT,
  RUNES_DB,
  TRADITIONS,
  getRuneBySlug,
  getRunesmithLimits,
  isDiacriticCompatible
} from "./runes-db.js?v=1.3.0";

export const MODULE_ID = "pf2e-runesmith-command-deck";
export const SOCKET_NAME = `module.${MODULE_ID}`;

let stateMutationQueue = Promise.resolve();

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isPrimaryGM() {
  if (!game.user?.isGM) return false;
  const activeGM = game.users?.activeGM;
  return !activeGM || activeGM.id === game.user.id;
}

export function isRunesmithActor(actor) {
  if (!actor || actor.type !== "character") return false;
  if (actor.class?.slug === "runesmith") return true;
  const rollOpts = actor.rollOptions?.all ?? {};
  if (rollOpts["class:runesmith"] || rollOpts["feat:runesmith-dedication"]) return true;
  return Boolean(
    actor.items?.some((i) => {
      const slug = i.slug || i.system?.slug || "";
      return slug === "runesmith" || slug === "runesmith-dedication" || slug === "runic-repertoire";
    })
  );
}

export function getCandidateRunesmithActors() {
  const allChars = (game.actors?.contents ?? []).filter((a) => a.type === "character" && a.isOwner);
  const runesmiths = allChars.filter(isRunesmithActor);
  return runesmiths.length > 0 ? runesmiths : allChars;
}

export function resolveRunesmithActor(preferredActorId = null) {
  if (preferredActorId) {
    const preferred = game.actors?.get(preferredActorId);
    if (preferred && preferred.isOwner) return preferred;
  }
  const controlled = canvas?.tokens?.controlled?.[0]?.actor;
  if (controlled && controlled.isOwner && isRunesmithActor(controlled)) return controlled;
  if (game.user?.character && isRunesmithActor(game.user.character)) return game.user.character;
  const ownedRunesmith = (game.actors?.contents ?? []).find((a) => a.isOwner && isRunesmithActor(a));
  if (ownedRunesmith) return ownedRunesmith;
  if (controlled && controlled.isOwner && controlled.type === "character") return controlled;
  return game.user?.character ?? null;
}

export function getActorTokenOnCanvas(actor) {
  if (!actor || !canvas?.ready) return null;
  const controlledMatch = canvas.tokens?.controlled?.find((t) => t.actor?.id === actor.id);
  if (controlledMatch) return controlledMatch;
  const active = actor.getActiveTokens?.(true, false)?.[0];
  if (active) return active;
  return canvas.tokens?.placeables?.find((t) => t.actor?.id === actor.id) ?? null;
}

export function getRunesmithClassDC(actor) {
  if (!actor) return 15;
  const classDC =
    actor.system?.proficiencies?.classDCs?.runesmith?.dc?.value ??
    actor.system?.proficiencies?.classDCs?.runesmith?.value ??
    actor.classDC?.dc?.value ??
    actor.classDC?.value;
  if (Number.isFinite(Number(classDC)) && Number(classDC) > 0) {
    return Number(classDC);
  }
  const level = Math.max(1, Number(actor.system?.details?.level?.value ?? actor.level ?? 1));
  const intMod = Number(actor.system?.abilities?.int?.mod ?? actor.abilities?.int?.mod ?? 4);
  const profBonus = level >= 19 ? 8 : level >= 15 ? 6 : level >= 7 ? 4 : 2;
  return 10 + level + profBonus + intMod;
}

export function measureDistanceFeet(tokenA, tokenB) {
  if (!tokenA || !tokenB) return null;
  if (tokenA.id === tokenB.id) return 0;
  try {
    if (typeof tokenA.distanceTo === "function") {
      const d = Number(tokenA.distanceTo(tokenB));
      if (Number.isFinite(d)) return Math.max(0, Math.round(d));
    }
  } catch (_e) {
    // Fallback below
  }
  const gridSize = Number(canvas?.grid?.size) || 100;
  const gridDist = Number(canvas?.scene?.grid?.distance) || 5;
  const ax = tokenA.center?.x ?? tokenA.x ?? 0;
  const ay = tokenA.center?.y ?? tokenA.y ?? 0;
  const bx = tokenB.center?.x ?? tokenB.x ?? 0;
  const by = tokenB.center?.y ?? tokenB.y ?? 0;
  const pxDist = Math.hypot(ax - bx, ay - by);
  const rawFeet = (pxDist / gridSize) * gridDist;
  return Math.max(0, Math.round(rawFeet / 5) * 5);
}

/**
 * Default persisted Runesmith state on the actor.
 */
export function getActorRuneState(actor) {
  const raw = actor?.getFlag(MODULE_ID, "state");
  const state = raw && typeof raw === "object" ? foundry.utils.deepClone(raw) : {};
  return {
    repertoire: Array.isArray(state.repertoire)
      ? state.repertoire.filter((s) => Boolean(getRuneBySlug(s)))
      : [],
    activeRunes: Array.isArray(state.activeRunes)
      ? state.activeRunes.filter((r) => r && Boolean(getRuneBySlug(r.runeSlug)))
      : [],
    dailyPreset: Array.isArray(state.dailyPreset) ? state.dailyPreset : [],
    propertyFormulas: Array.isArray(state.propertyFormulas) ? state.propertyFormulas : [],
    diacriticCooldowns: state.diacriticCooldowns && typeof state.diacriticCooldowns === "object"
      ? state.diacriticCooldowns
      : {}
  };
}

export function mutateActorRuneState(actor, mutatorFn) {
  if (!actor) return Promise.resolve(null);
  stateMutationQueue = stateMutationQueue
    .then(async () => {
      const current = getActorRuneState(actor);
      const next = (await mutatorFn(current)) ?? current;
      await actor.setFlag(MODULE_ID, "state", next);
      Hooks.callAll(`${MODULE_ID}.stateChanged`, actor, next);
      broadcastCanvasRefresh();
      return next;
    })
    .catch((err) => {
      console.error(`${MODULE_ID} | Failed mutating state:`, err);
      return null;
    });
  return stateMutationQueue;
}

export function broadcastCanvasRefresh() {
  Hooks.callAll(`${MODULE_ID}.refreshBadges`);
  try {
    game.socket?.emit(SOCKET_NAME, { action: "refreshBadges" });
  } catch (_e) {
    // Socket may not be ready during early init
  }
}

/**
 * Execute cross-actor document mutations directly if owner/GM, or relay to active GM via socket.
 */
export async function executeOnTargetActor(targetActorUuid, operation, payload = {}) {
  if (!targetActorUuid) return null;
  const targetDoc = await fromUuid(targetActorUuid).catch(() => null);
  const targetActor = targetDoc?.actor ?? (targetDoc?.documentName === "Actor" ? targetDoc : null);

  if (targetActor && (game.user?.isGM || targetActor.isOwner)) {
    return performTargetActorOp(targetActor, operation, payload);
  }

  if (!game.users?.activeGM) {
    ui.notifications?.warn("No active GM connected to apply cross-token rune effect; tracking rune on Command Deck only.");
    return null;
  }

  const requestId = foundry.utils.randomID();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      Hooks.off(`${MODULE_ID}.socketAck.${requestId}`, onAck);
      resolve(null);
    }, 4000);

    function onAck(result) {
      clearTimeout(timeout);
      resolve(result);
    }

    Hooks.once(`${MODULE_ID}.socketAck.${requestId}`, onAck);
    game.socket.emit(SOCKET_NAME, {
      action: "targetActorOp",
      requestId,
      senderId: game.user.id,
      targetActorUuid,
      operation,
      payload
    });
  });
}

export async function performTargetActorOp(targetActor, operation, payload = {}) {
  if (!targetActor) return null;
  try {
    switch (operation) {
      case "createEffect": {
        const created = await targetActor.createEmbeddedDocuments("Item", [payload.itemData]);
        return { effectId: created?.[0]?.id ?? null };
      }
      case "deleteEffect": {
        const toDelete = [];
        if (payload.effectId && targetActor.items.has(payload.effectId)) {
          toDelete.push(payload.effectId);
        }
        if (payload.runeEntryId) {
          for (const item of targetActor.items) {
            if (item.type === "effect" && item.getFlag(MODULE_ID, "runeEntryId") === payload.runeEntryId) {
              if (!toDelete.includes(item.id)) toDelete.push(item.id);
            }
          }
        }
        if (toDelete.length > 0) {
          await targetActor.deleteEmbeddedDocuments("Item", toDelete);
        }
        return { deleted: toDelete.length };
      }
      case "applyDamage": {
        const amount = Math.max(0, Math.trunc(Number(payload.amount) || 0));
        if (amount <= 0) return { applied: 0 };
        if (typeof targetActor.applyDamage === "function" && payload.useSystemApply !== false) {
          try {
            const roll = await new Roll(`${amount}[${payload.damageType || "untyped"}]`).evaluate();
            await targetActor.applyDamage({
              damage: roll,
              token: targetActor.getActiveTokens?.(true, true)?.[0] ?? null,
              skipIWR: Boolean(payload.skipIWR)
            });
            return { applied: amount };
          } catch (_err) {
            // Fallback to direct HP adjustment below
          }
        }
        const curHp = Number(targetActor.system?.attributes?.hp?.value ?? 0);
        await targetActor.update({ "system.attributes.hp.value": Math.max(0, curHp - amount) });
        return { applied: amount };
      }
      case "applyHealing": {
        const heal = Math.max(0, Math.trunc(Number(payload.amount) || 0));
        if (heal <= 0) return { healed: 0 };
        const curHp = Number(targetActor.system?.attributes?.hp?.value ?? 0);
        const maxHp = Number(targetActor.system?.attributes?.hp?.max ?? curHp + heal);
        const nextHp = Math.min(maxHp, curHp + heal);
        await targetActor.update({ "system.attributes.hp.value": nextHp });
        return { healed: nextHp - curHp };
      }
      case "repairShield": {
        const repairAmt = Math.max(0, Math.trunc(Number(payload.amount) || 0));
        const shields = targetActor.itemTypes?.shield ?? [];
        const specific = payload.subTargetId ? targetActor.items?.get?.(payload.subTargetId) : null;
        const shield = (specific?.type === "shield" ? specific : null) ?? shields.find((s) => s.isEquipped) ?? shields[0] ?? null;
        if (!shield || repairAmt <= 0) return { repaired: 0 };
        const curSHp = Number(shield.system?.hp?.value ?? 0);
        const maxSHp = Number(shield.system?.hp?.max ?? curSHp);
        const nextSHp = Math.min(maxSHp, curSHp + repairAmt);
        if (nextSHp > curSHp) {
          await shield.update({ "system.hp.value": nextSHp });
        }
        return { repaired: nextSHp - curSHp };
      }
      case "applyCondition": {
        const slug = String(payload.slug || "").toLowerCase();
        const val = payload.value ? Number(payload.value) : undefined;
        if (!slug) return null;
        if (typeof targetActor.increaseCondition === "function") {
          await targetActor.increaseCondition(slug, { min: val ?? 1, value: val ?? 1 });
        }
        return { condition: slug };
      }
      case "applyPersistent": {
        const formula = String(payload.formula || "").trim();
        const damageType = String(payload.damageType || "untyped").trim().toLowerCase();
        if (!formula || !game.pf2e?.ConditionManager) return null;
        const baseCond = game.pf2e.ConditionManager.getCondition("persistent-damage")?.toObject?.();
        if (!baseCond) return null;
        const merged = foundry.utils.mergeObject(baseCond, {
          system: {
            persistent: {
              formula,
              damageType,
              dc: 15
            }
          }
        });
        await targetActor.createEmbeddedDocuments("Item", [merged]);
        return { persistent: `${formula} ${damageType}` };
      }
      case "reduceFrightened": {
        const dec = Math.max(1, Number(payload.amount) || 2);
        const cond = targetActor.itemTypes?.condition?.find((c) => c.slug === "frightened");
        if (!cond) return { reduced: false };
        const curVal = Number(cond.value ?? cond.system?.value?.value ?? 1);
        if (curVal <= dec) {
          await cond.delete();
        } else if (typeof targetActor.decreaseCondition === "function") {
          for (let i = 0; i < dec; i++) await targetActor.decreaseCondition("frightened");
        }
        return { reduced: true };
      }
      case "raiseShieldHoltrik": {
        // Apply official Raise a Shield effect if not already active
        const hasRaise = targetActor.itemTypes?.effect?.some((e) => e.slug === "effect-raise-a-shield");
        if (!hasRaise) {
          const shieldEff = await fromUuid("Compendium.pf2e.equipment-effects.Item.2YgXoHvJfrDHucMr").catch(() => null);
          if (shieldEff) {
            const obj = shieldEff.toObject();
            await targetActor.createEmbeddedDocuments("Item", [obj]);
          }
        }
        const holtrikBoost = buildEffectItemData({
          name: "Invocation: Holtrik (+1 Status AC)",
          icon: "icons/magic/symbols/cog-shield-white-blue.webp",
          description: "<p>Granted by invoking <strong>Holtrik, Rune of Dwarven Ramparts</strong>: +1 status bonus to AC while your shield remains raised until the start of your next turn.</p>",
          level: payload.level || 1,
          durationRounds: 1,
          expiry: "turn-start",
          rules: [{ key: "FlatModifier", selector: ["ac"], value: 1, type: "status", label: "Holtrik Invocation" }]
        });
        await targetActor.createEmbeddedDocuments("Item", [holtrikBoost]);
        return { raised: true };
      }
      case "teleportToken": {
        const scene = game.scenes?.get(payload.sceneId);
        const tokDoc = scene?.tokens?.get(payload.tokenId);
        if (tokDoc && Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
          await tokDoc.update({ x: payload.x, y: payload.y }, { animate: true });
          return { moved: true };
        }
        return { moved: false };
      }
      default:
        return null;
    }
  } catch (err) {
    console.error(`${MODULE_ID} | performTargetActorOp(${operation}) failed:`, err);
    return null;
  }
}

const ALLOWED_SOCKET_OPS = new Set([
  "createEffect",
  "deleteEffect",
  "applyDamage",
  "applyHealing",
  "repairShield",
  "applyCondition",
  "applyPersistent",
  "reduceFrightened",
  "raiseShieldHoltrik",
  "teleportToken"
]);

const ALLOWED_CONDITIONS = new Set([
  "blinded",
  "clumsy",
  "concealed",
  "dazzled",
  "doomed",
  "drained",
  "enfeebled",
  "frightened",
  "off-guard",
  "quickened",
  "restrained",
  "sickened",
  "slowed",
  "stupefied"
]);

function isAuthorizedSocketSender(senderUserId, operation, payload) {
  const user = game.users?.get(senderUserId);
  if (!user || !user.active) return false;
  if (!ALLOWED_SOCKET_OPS.has(operation)) return false;

  if (!user.isGM && !game.settings?.get(MODULE_ID, "allowAnyCharacter")) {
    const ownsRunesmith = (game.actors?.contents ?? []).some(
      (a) => a.testUserPermission?.(user, "OWNER") && isRunesmithActor(a)
    );
    if (!ownsRunesmith) return false;
  }

  if (operation === "createEffect") {
    const item = payload?.itemData;
    if (!item || item.type !== "effect" || typeof item.name !== "string") return false;
  } else if (operation === "applyDamage" || operation === "applyHealing" || operation === "repairShield") {
    const amt = Number(payload?.amount);
    if (!Number.isFinite(amt) || amt < 0 || amt > 500) return false;
  } else if (operation === "applyCondition") {
    if (!ALLOWED_CONDITIONS.has(String(payload?.slug || "").toLowerCase())) return false;
  } else if (operation === "applyPersistent") {
    const formula = String(payload?.formula || "").trim();
    const dmgType = String(payload?.damageType || "").trim().toLowerCase();
    if (!/^(?:\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)$/i.test(formula) || !/^[a-z-]+$/.test(dmgType)) return false;
  }
  return true;
}

export function setupSocketListener() {
  if (!game.socket) return;
  game.socket.on(SOCKET_NAME, async (data, socketUserId) => {
    if (!data || typeof data !== "object") return;
    if (data.action === "refreshBadges") {
      Hooks.callAll(`${MODULE_ID}.refreshBadges`);
      return;
    }
    if (data.action === "socketAck" && data.targetUserId === game.user?.id) {
      Hooks.callAll(`${MODULE_ID}.socketAck.${data.requestId}`, data.result);
      return;
    }
    if (data.action === "targetActorOp" && isPrimaryGM()) {
      const verifiedSenderId = socketUserId || data.senderId;
      if (!isAuthorizedSocketSender(verifiedSenderId, data.operation, data.payload)) {
        console.warn(`${MODULE_ID} | Rejected unauthorized socket op`, data.operation, verifiedSenderId);
        return;
      }
      const doc = await fromUuid(data.targetActorUuid).catch(() => null);
      const targetActor = doc?.actor ?? (doc?.documentName === "Actor" ? doc : null);
      const result = targetActor
        ? await performTargetActorOp(targetActor, data.operation, data.payload)
        : null;
      game.socket.emit(SOCKET_NAME, {
        action: "socketAck",
        requestId: data.requestId,
        targetUserId: verifiedSenderId,
        result
      });
      broadcastCanvasRefresh();
    }
  });
}

/**
 * Build a clean PF2e Effect Item payload with zero external compendium dependencies.
 */
export function buildEffectItemData({
  name,
  icon,
  description,
  level = 1,
  durationRounds = null,
  expiry = "turn-end",
  rules = [],
  flags = {}
}) {
  const isUnlimited = durationRounds === null || durationRounds === undefined;
  return {
    name,
    type: "effect",
    img: icon || "icons/magic/symbols/rune-sigil-red-orange.webp",
    system: {
      description: { value: description || "" },
      level: { value: Math.max(1, Number(level) || 1) },
      duration: isUnlimited
        ? { unit: "unlimited", value: -1, sustained: false, expiry: null }
        : { unit: "rounds", value: Math.max(1, Number(durationRounds) || 1), sustained: false, expiry },
      tokenIcon: { show: true },
      rules: Array.isArray(rules) ? rules : [],
      traits: { value: ["magical", "runesmith"], rarity: "common" }
    },
    flags: {
      [MODULE_ID]: flags
    }
  };
}

/**
 * Auto-detect appropriate sub-target item (weapon, shield, armor) on target actor.
 */
export function resolveTargetSubItem(targetActor, rune) {
  if (!targetActor || !rune) return { subTargetType: "creature", subTargetName: null };
  switch (rune.targetCategory) {
    case "weapon-ps": {
      const weapons = targetActor.itemTypes?.weapon ?? [];
      const match =
        weapons.find((w) => ["piercing", "slashing"].includes(w.system?.damage?.damageType) ||
          w.system?.traits?.value?.some((t) => t === "versatile-p" || t === "versatile-s")) ??
        weapons[0];
      return {
        subTargetType: "weapon",
        subTargetId: match?.id ?? null,
        subTargetName: match?.name ?? "Piercing/Slashing Strike"
      };
    }
    case "weapon-b": {
      const weapons = targetActor.itemTypes?.weapon ?? [];
      const match =
        weapons.find((w) => w.system?.damage?.damageType === "bludgeoning" ||
          w.system?.traits?.value?.includes("versatile-b")) ?? null;
      return {
        subTargetType: "weapon",
        subTargetId: match?.id ?? null,
        subTargetName: match?.name ?? "Bludgeoning Unarmed/Weapon"
      };
    }
    case "shield": {
      const shields = targetActor.itemTypes?.shield ?? [];
      const worn = shields.find((s) => s.isEquipped) ?? shields[0] ?? null;
      return {
        subTargetType: "shield",
        subTargetId: worn?.id ?? null,
        subTargetName: worn?.name ?? "Shield"
      };
    }
    case "armor": {
      const armors = targetActor.itemTypes?.armor ?? [];
      const worn = armors.find((a) => a.isEquipped) ?? armors[0] ?? null;
      return {
        subTargetType: "armor",
        subTargetId: worn?.id ?? null,
        subTargetName: worn?.name ?? "Armor"
      };
    }
    default:
      return { subTargetType: "creature", subTargetId: null, subTargetName: null };
  }
}

/**
 * Toggle or set a rune in the actor's Runic Repertoire.
 */
export async function toggleRepertoireRune(actor, runeSlug) {
  const rune = getRuneBySlug(runeSlug);
  if (!actor || !rune) return;
  const limits = getRunesmithLimits(actor);

  await mutateActorRuneState(actor, async (state) => {
    const idx = state.repertoire.indexOf(runeSlug);
    if (idx >= 0) {
      state.repertoire.splice(idx, 1);
      ui.notifications?.info(`Removed ${rune.shortName} from ${actor.name}'s Runic Repertoire.`);
      return state;
    }
    if (rune.level > limits.level) {
      ui.notifications?.warn(`${rune.name} requires Level ${rune.level} (${actor.name} is Level ${limits.level}).`);
      return state;
    }
    if (state.repertoire.length >= limits.maxRepertoire) {
      ui.notifications?.warn(
        `Runic Repertoire is full (${state.repertoire.length}/${limits.maxRepertoire} at Level ${limits.level}). Remove a rune first.`
      );
      return state;
    }
    state.repertoire.push(runeSlug);
    ui.notifications?.info(`Learned ${rune.name}!`);
    return state;
  });
}

export async function applyRecommendedLoadout(actor) {
  if (!actor) return;
  const limits = getRunesmithLimits(actor);
  await mutateActorRuneState(actor, async (state) => {
    const eligible = RUNES_DB.filter((r) => r.level <= limits.level);
    const chosen = [];
    for (const slug of RECOMMENDED_STARTER_LOADOUT) {
      if (chosen.length < limits.maxRepertoire && eligible.some((e) => e.slug === slug)) {
        chosen.push(slug);
      }
    }
    for (const r of eligible) {
      if (chosen.length >= limits.maxRepertoire) break;
      if (!chosen.includes(r.slug)) chosen.push(r.slug);
    }
    state.repertoire = chosen;
    ui.notifications?.info(`Loaded recommended Runic Repertoire (${chosen.length}/${limits.maxRepertoire}) for ${actor.name}!`);
    return state;
  });
}

/**
 * Apply (Etch or Trace) a Base Rune onto a target token or self.
 */
export async function applyRuneToTarget(actor, {
  runeSlug,
  mode = "traced", // "etched" | "traced"
  actionCost = 1,  // 1 (adjacent) | 2 (30 ft) | 0 (free/feat/etch)
  targetToken = null,
  freeSlot = false,
  diacriticSlug = null,
  energyChoice = "fire",
  traditionOverride = null,
  skipRangeCheck = false,
  sourceLabel = null
} = {}) {
  const rune = getRuneBySlug(runeSlug);
  if (!actor || !rune) return null;
  if (rune.isDiacritic) {
    ui.notifications?.warn(`${rune.shortName} is a Diacritic Rune — attach it directly to an active base rune on the Battle Deck!`);
    return null;
  }
  if (rune.etchOnly && mode === "traced") {
    ui.notifications?.warn(`${rune.name} can only be Etched, not Traced!`);
    return null;
  }

  const limits = getRunesmithLimits(actor);
  if (mode === "traced" && !limits.features.canTrace) {
    ui.notifications?.warn(`${actor.name} cannot Trace Runes without Tracing Studies or a tracing feat.`);
    return null;
  }

  const sourceToken = getActorTokenOnCanvas(actor);
  const resolvedTargetToken =
    targetToken ??
    Array.from(game.user?.targets ?? [])[0] ??
    sourceToken ??
    null;

  const targetActor = resolvedTargetToken?.actor ?? actor;
  const distFeet = sourceToken && resolvedTargetToken ? measureDistanceFeet(sourceToken, resolvedTargetToken) : 0;

  if (!skipRangeCheck && mode === "traced" && sourceToken && resolvedTargetToken && resolvedTargetToken.id !== sourceToken.id) {
    const maxRange = actionCost >= 2 ? 30 : 10; // 5ft adjacent + reach tolerance
    if (distFeet !== null && distFeet > maxRange) {
      ui.notifications?.warn(
        actionCost >= 2
          ? `Target ${resolvedTargetToken.name} is ${distFeet} ft away (2-Action Trace Rune max range is 30 ft).`
          : `Target ${resolvedTargetToken.name} is ${distFeet} ft away! Use 2-Action Trace Rune (30 ft) or move adjacent.`
      );
      return null;
    }
  }

  // Determine turn-based expiration for Traced runes
  // Rule: "remains until the end of your next turn"
  // If traced during the Runesmith's own active combat turn -> survives end of THIS turn (1) and expires at end of NEXT turn (2).
  // If traced outside the Runesmith's turn (e.g. reaction) -> expires at the end of their NEXT turn (1).
  const activeCombatantActorId = game.combat?.started ? game.combat.combatant?.actor?.id : null;
  const isOwnTurn = activeCombatantActorId === actor.id;
  const turnsRemaining = mode === "traced" ? (isOwnTurn ? 2 : 1) : null;

  const subInfo = resolveTargetSubItem(targetActor, rune);
  const entryId = foundry.utils.randomID();
  const targetActorUuid = resolvedTargetToken?.document?.actor?.uuid ?? targetActor.uuid;
  const targetDisplayName = resolvedTargetToken?.name ?? targetActor.name;
  const targetImg =
    resolvedTargetToken?.document?.ring?.subject?.texture ||
    resolvedTargetToken?.document?.texture?.src ||
    targetActor.img ||
    "icons/svg/mystery-man.svg";

  const passiveDesc = rune.passiveSummary(limits.level, energyChoice);
  const rules = typeof rune.passiveRules === "function" ? rune.passiveRules(limits.level, { energyChoice }) : [];
  const labelPrefix = mode === "etched" ? "Etched Rune" : "Traced Rune";
  const subLabel = subInfo.subTargetName ? ` (${subInfo.subTargetName})` : "";

  const effectItemData = buildEffectItemData({
    name: `${labelPrefix}: ${rune.shortName}${subLabel}`,
    icon: rune.icon,
    description: `<p><strong>${escapeHtml(rune.name)}</strong> (${mode === "etched" ? "Etched" : "Traced — until end of Runesmith's next turn"})</p><p>${escapeHtml(passiveDesc)}</p><hr/><p><strong>Invocation:</strong> ${escapeHtml(rune.invocation.summary(limits.level, energyChoice))}</p>`,
    level: limits.level,
    durationRounds: mode === "traced" ? 2 : null,
    expiry: "turn-end",
    rules,
    flags: {
      runeEntryId: entryId,
      sourceActorId: actor.id,
      sourceActorUuid: actor.uuid,
      runeSlug: rune.slug,
      mode
    }
  });

  const createdRes = await executeOnTargetActor(targetActorUuid, "createEffect", { itemData: effectItemData });

  let displacedRune = null;
  await mutateActorRuneState(actor, async (state) => {
    // Enforce FIFO max Etched Runes for non-free slots
    if (mode === "etched" && !freeSlot) {
      const regularEtched = state.activeRunes.filter((r) => r.mode === "etched" && !r.freeSlot);
      while (regularEtched.length >= limits.maxEtched) {
        const oldest = regularEtched.shift();
        if (!oldest) break;
        displacedRune = oldest;
        state.activeRunes = state.activeRunes.filter((r) => r.id !== oldest.id);
      }
    }

    state.activeRunes.push({
      id: entryId,
      runeSlug: rune.slug,
      mode,
      freeSlot: Boolean(freeSlot),
      actionCost: mode === "traced" ? actionCost : 0,
      targetTokenId: resolvedTargetToken?.id ?? null,
      targetSceneId: resolvedTargetToken?.scene?.id ?? canvas?.scene?.id ?? null,
      targetActorUuid,
      targetName: targetDisplayName,
      targetImg,
      subTargetType: subInfo.subTargetType,
      subTargetName: subInfo.subTargetName,
      energyChoice: rune.needsEnergyChoice ? energyChoice : null,
      traditionOverride: traditionOverride || null,
      diacriticSlug: diacriticSlug || null,
      diacriticElement: null,
      turnsRemaining,
      appliedRound: game.combat?.round ?? 0,
      effectItemId: createdRes?.effectId ?? null
    });
    return state;
  });

  if (displacedRune) {
    const oldDef = getRuneBySlug(displacedRune.runeSlug);
    await executeOnTargetActor(displacedRune.targetActorUuid, "deleteEffect", {
      effectId: displacedRune.effectItemId,
      runeEntryId: displacedRune.id
    });
    ui.notifications?.info(`Max Etched Runes (${limits.maxEtched}) reached: oldest rune (${oldDef?.shortName ?? "Rune"} on ${displacedRune.targetName}) faded.`);
  }

  await postRuneAppliedChatCard(actor, {
    rune,
    mode,
    actionCost,
    freeSlot,
    targetDisplayName,
    subTargetName: subInfo.subTargetName,
    passiveDesc,
    sourceLabel,
    level: limits.level,
    energyChoice
  });

  return entryId;
}

/**
 * Attach or remove a Diacritic Rune on an already-applied active Base Rune.
 */
export async function attachDiacriticToActiveRune(actor, activeRuneId, diacriticSlug, diacriticElement = "fire") {
  if (!actor) return;
  const state = getActorRuneState(actor);
  const entry = state.activeRunes.find((r) => r.id === activeRuneId);
  if (!entry) return;

  if (!diacriticSlug) {
    await mutateActorRuneState(actor, async (s) => {
      const target = s.activeRunes.find((r) => r.id === activeRuneId);
      if (target) {
        target.diacriticSlug = null;
        target.diacriticElement = null;
      }
      return s;
    });
    ui.notifications?.info("Removed diacritic modifier from rune.");
    return;
  }

  const diacritic = getRuneBySlug(diacriticSlug);
  const baseRune = getRuneBySlug(entry.runeSlug);
  if (!diacritic || !isDiacriticCompatible(diacritic, baseRune)) {
    ui.notifications?.warn(`${diacritic?.name ?? "Diacritic"} is not compatible with ${baseRune?.name ?? "this rune"}.`);
    return;
  }

  // Enforce single-copy uniqueness & 10-minute cooldown for Av-, Per-, Sun-, Nesh-
  if (diacritic.cooldownMinutes) {
    const alreadyActive = state.activeRunes.some((r) => r.diacriticSlug === diacritic.slug && r.id !== activeRuneId);
    if (alreadyActive) {
      ui.notifications?.warn(`Only one copy of ${diacritic.name} can be applied at a time!`);
      return;
    }
    const cdExpiry = Number(state.diacriticCooldowns?.[diacritic.slug] || 0);
    const nowWorld = Number(game.time?.worldTime || 0);
    if (cdExpiry > nowWorld) {
      const remMin = Math.ceil((cdExpiry - nowWorld) / 60);
      ui.notifications?.warn(`${diacritic.shortName} is on its 10-minute cooldown (${remMin} min remaining).`);
      return;
    }
  }

  await mutateActorRuneState(actor, async (s) => {
    const target = s.activeRunes.find((r) => r.id === activeRuneId);
    if (target) {
      target.diacriticSlug = diacritic.slug;
      target.diacriticElement = diacritic.slug === "ti-diacritic" ? diacriticElement : null;
    }
    return s;
  });

  ui.notifications?.info(`Inscribed ${diacritic.prefix}${baseRune.shortName} on ${entry.targetName}!`);
}

/**
 * Dismiss / erase an active rune without invoking it.
 */
export async function dismissActiveRune(actor, activeRuneId, reason = "dismissed") {
  if (!actor) return;
  let removed = null;
  await mutateActorRuneState(actor, async (state) => {
    removed = state.activeRunes.find((r) => r.id === activeRuneId) ?? null;
    state.activeRunes = state.activeRunes.filter((r) => r.id !== activeRuneId);
    return state;
  });
  if (removed) {
    await executeOnTargetActor(removed.targetActorUuid, "deleteEffect", {
      effectId: removed.effectItemId,
      runeEntryId: removed.id
    });
    if (reason === "dismissed") {
      const rDef = getRuneBySlug(removed.runeSlug);
      ui.notifications?.info(`Dismissed ${rDef?.shortName ?? "rune"} on ${removed.targetName}.`);
    }
  }
}

/**
 * Transpose Etching: move an active rune to a new target token on the canvas.
 */
export async function transposeActiveRune(actor, activeRuneId, newTargetToken) {
  if (!actor || !newTargetToken?.actor) {
    ui.notifications?.warn("Target a token on the map first to Transpose a rune onto it!");
    return;
  }
  const state = getActorRuneState(actor);
  const existing = state.activeRunes.find((r) => r.id === activeRuneId);
  if (!existing) return;
  const rune = getRuneBySlug(existing.runeSlug);
  if (!rune) return;

  await dismissActiveRune(actor, activeRuneId, "transposed");
  await applyRuneToTarget(actor, {
    runeSlug: rune.slug,
    mode: existing.mode,
    actionCost: 1,
    targetToken: newTargetToken,
    freeSlot: existing.freeSlot,
    diacriticSlug: existing.diacriticSlug,
    energyChoice: existing.energyChoice || "fire",
    skipRangeCheck: true,
    sourceLabel: "Transpose Etching"
  });
}

/**
 * Gather target tokens on canvas for an invocation's area/mode.
 */
function resolveInvocationTargets(sourceToken, entry, rune, diacritic) {
  const bearerToken =
    (entry.targetTokenId && canvas?.tokens?.get(entry.targetTokenId)) ||
    canvas?.tokens?.placeables?.find((t) => t.actor?.uuid === entry.targetActorUuid) ||
    null;

  let effectiveMode = rune.invocation?.targetMode || "bearer";
  let emanationFeet = rune.invocation?.emanationFeet || 15;

  // En-, Diacritic Rune of Expansion expands damage runes to a 15-ft emanation around bearer!
  if (diacritic?.slug === "en-diacritic" && typeof rune.invocation?.damage === "function") {
    effectiveMode = "emanation-all-PlusBearer";
    emanationFeet = 15;
  }

  if (!bearerToken || !canvas?.ready) {
    return [
      {
        tokenId: entry.targetTokenId,
        sceneId: entry.targetSceneId,
        actorUuid: entry.targetActorUuid,
        name: entry.targetName,
        img: entry.targetImg,
        isBearer: true
      }
    ];
  }

  const sourceAlliance = sourceToken?.actor?.alliance ?? "party";
  const allTokens = canvas.tokens?.placeables?.filter((t) => t.actor && !t.document?.hidden) ?? [];

  if (effectiveMode === "bearer") {
    return [tokenToTargetRef(bearerToken, true)];
  }

  if (effectiveMode === "adjacent-enemy") {
    // Prefer user's current target if adjacent to bearer, else closest opposing creature within 10 ft of bearer
    const userTarget = Array.from(game.user?.targets ?? []).find(
      (t) => t.id !== bearerToken.id && (measureDistanceFeet(bearerToken, t) ?? 999) <= 10
    );
    if (userTarget) return [tokenToTargetRef(userTarget, false)];
    const adjEnemy = allTokens.find(
      (t) =>
        t.id !== bearerToken.id &&
        (t.actor?.alliance ?? "opposition") !== sourceAlliance &&
        (measureDistanceFeet(bearerToken, t) ?? 999) <= 10
    );
    return adjEnemy ? [tokenToTargetRef(adjEnemy, false)] : [tokenToTargetRef(bearerToken, true)];
  }

  const inArea = allTokens.filter((t) => {
    const d = measureDistanceFeet(bearerToken, t);
    return d !== null && d <= emanationFeet;
  });

  if (effectiveMode === "emanation-enemies") {
    const foes = inArea.filter((t) => (t.actor?.alliance ?? "opposition") !== sourceAlliance);
    return foes.length > 0 ? foes.map((t) => tokenToTargetRef(t, t.id === bearerToken.id)) : [tokenToTargetRef(bearerToken, true)];
  }

  if (effectiveMode === "emanation-allies") {
    const allies = inArea.filter((t) => (t.actor?.alliance ?? "party") === sourceAlliance);
    return allies.length > 0 ? allies.map((t) => tokenToTargetRef(t, t.id === bearerToken.id)) : [tokenToTargetRef(bearerToken, true)];
  }

  // emanation-all / emanation-all-PlusBearer
  return inArea.map((t) => tokenToTargetRef(t, t.id === bearerToken.id));
}

function tokenToTargetRef(token, isBearer = false) {
  return {
    tokenId: token.id,
    sceneId: token.scene?.id ?? canvas?.scene?.id ?? null,
    actorUuid: token.actor?.uuid ?? null,
    name: token.name,
    img: token.document?.ring?.subject?.texture || token.document?.texture?.src || token.actor?.img || "icons/svg/mystery-man.svg",
    isBearer
  };
}

/**
 * Invoke up to 2 active runes in a single Invoke Rune action (or 1 via Solitary / Remote Detonation).
 */
export async function invokeActiveRunes(actor, activeRuneIds = [], { maxAllowed = 2, actionLabel = "Invoke Rune" } = {}) {
  if (!actor || !Array.isArray(activeRuneIds) || activeRuneIds.length === 0) {
    ui.notifications?.warn("Select at least one active rune to Invoke!");
    return;
  }

  const state = getActorRuneState(actor);
  const limits = getRunesmithLimits(actor);
  const maxInvokeRange = limits.features.hasDistantInvocation ? 60 : 30;
  const sourceToken = getActorTokenOnCanvas(actor);
  const classDC = getRunesmithClassDC(actor);

  const selectedEntries = activeRuneIds
    .slice(0, maxAllowed)
    .map((id) => state.activeRunes.find((r) => r.id === id))
    .filter(Boolean);

  if (selectedEntries.length === 0) return;

  // Range check (30 ft, or 60 ft with Distant Invocation)
  if (sourceToken && canvas?.ready) {
    for (const entry of selectedEntries) {
      const bTok = entry.targetTokenId ? canvas.tokens?.get(entry.targetTokenId) : null;
      if (bTok && bTok.id !== sourceToken.id) {
        const dist = measureDistanceFeet(sourceToken, bTok);
        if (dist !== null && dist > maxInvokeRange) {
          const rDef = getRuneBySlug(entry.runeSlug);
          ui.notifications?.warn(
            `${rDef?.shortName ?? "Rune"} on ${entry.targetName} is ${dist} ft away (Invoke Rune range is ${maxInvokeRange} ft)!`
          );
          return;
        }
      }
    }
  }

  // Track duplicate-rune protection per official rule:
  // "creatures that would be affected by multiple copies of the same rune are affected only once"
  const affectedByRuneSlug = new Map(); // runeSlug -> Set<actorUuid|name>
  const invocationBlocks = [];
  const sunRetraces = [];
  const cooldownUpdates = {};

  for (const entry of selectedEntries) {
    const rune = getRuneBySlug(entry.runeSlug);
    if (!rune) continue;
    const diacritic = entry.diacriticSlug ? getRuneBySlug(entry.diacriticSlug) : null;

    if (diacritic?.cooldownMinutes) {
      cooldownUpdates[diacritic.slug] = Number(game.time?.worldTime || 0) + diacritic.cooldownMinutes * 60;
    }

    // Build damage formula with diacritic modifications
    let dmgSpec = typeof rune.invocation?.damage === "function"
      ? foundry.utils.deepClone(rune.invocation.damage(limits.level, { energyChoice: entry.energyChoice }))
      : null;

    const extraNotes = [];
    let savePenaltyBearer = 0;
    const damageModifiers = [];
    const extraPersistentInstances = [];

    if (dmgSpec && diacritic) {
      if (diacritic.slug === "ti-diacritic" && ELEMENTAL_TYPES.includes(entry.diacriticElement || "fire")) {
        dmgSpec.type = entry.diacriticElement || "fire";
        extraNotes.push(`Ti- Fundaments: Damage type shifted to ${dmgSpec.type}.`);
      }
      if (diacritic.slug === "eck-diacritic") {
        dmgSpec.type = "spirit";
        const pDice = limits.level >= 17 ? "2d8" : "1d8";
        extraNotes.push(`Eck- Phantasma: Damage converted to spirit; adjacent enemies take @Damage[${pDice}[persistent,spirit]].`);
      }
      if (diacritic.slug === "ur-diacritic") {
        const bonus = 2 + Math.floor(limits.level / 2);
        dmgSpec.dice = `${dmgSpec.dice} + ${bonus}`;
        extraNotes.push(`Ur- Intensity: +${bonus} status bonus to invocation damage.`);
      }
      if (diacritic.slug === "kit-diacritic") {
        savePenaltyBearer = -1;
        damageModifiers.push("nonlethal");
        extraNotes.push("Kit- Mercy: Nonlethal; rune-bearer takes –1 status penalty to save.");
      }
      if (diacritic.slug === "inth-diacritic") {
        damageModifiers.push("unholy");
        const fDice = `${2 + Math.max(0, Math.floor((limits.level - 13) / 2)) * 2}d4`;
        extraPersistentInstances.push(`${fDice}[persistent,fire]`);
        extraNotes.push(`Inth- Corruption (Unholy): Target also takes @Damage[${fDice}[persistent,fire]].`);
      }
    }

    if (diacritic?.slug === "sar-diacritic") {
      if (dmgSpec) damageModifiers.push("holy");
      extraNotes.push("Sar- Righteousness (Holy): Target also becomes @UUID[Compendium.pf2e.conditionitems.Item.4D2KBtexWXa6oUMR]{Drained 1}.");
    }
    if (diacritic?.slug === "fob-diacritic" && !dmgSpec) {
      extraNotes.push(`Fob- Doubling: ${actor.name} also receives this non-damaging invocation benefit!`);
    }
    if (diacritic?.slug === "av-diacritic") {
      extraNotes.push("Av- Succession: You may Invoke 1 Rune on another rune-bearer within 15 ft as a free action!");
    }
    if (diacritic?.slug === "per-diacritic") {
      extraNotes.push(`Per- Continuum: ${rune.shortName} may immediately re-Trace onto another target within 15 ft!`);
    }
    if (diacritic?.slug === "sun-diacritic") {
      extraNotes.push(`Sun- Preservation: ${rune.shortName} automatically re-Traces onto ${entry.targetName}!`);
      sunRetraces.push(entry);
    }

    // Resolve targets & enforce duplicate-rune immunity
    const rawTargets = resolveInvocationTargets(sourceToken, entry, rune, diacritic);
    if (!affectedByRuneSlug.has(rune.slug)) affectedByRuneSlug.set(rune.slug, new Set());
    const seenSet = affectedByRuneSlug.get(rune.slug);

    const targets = [];
    for (const t of rawTargets) {
      const key = t.tokenId || t.actorUuid || t.name;
      if (seenSet.has(key)) {
        extraNotes.push(`${t.name} was already affected by ${rune.shortName} in this Invoke Rune action (duplicate effect skipped).`);
        continue;
      }
      seenSet.add(key);
      targets.push({
        ...t,
        saveStatistic: rune.invocation?.save?.statistic ?? null,
        saveBasic: Boolean(rune.invocation?.save?.basic),
        savePenalty: t.isBearer ? savePenaltyBearer : 0,
        saveRoll: null,
        degree: null
      });
    }

    // Execute immediate automatic non-HP special effects & collect expanded effect metadata
    const grantedEffectMeta = await executeSpecialInvocationEffects(actor, limits.level, entry, rune, diacritic, targets);

    if (diacritic?.slug === "sar-diacritic") {
      for (const t of targets) {
        if (t.actorUuid) await executeOnTargetActor(t.actorUuid, "applyCondition", { slug: "drained", value: 1 });
      }
    }

    // Remove the passive rune effect from its bearer now that it has been invoked
    await executeOnTargetActor(entry.targetActorUuid, "deleteEffect", {
      effectId: entry.effectItemId,
      runeEntryId: entry.id
    });

    // Healing formulas (e.g. Germantria, Xinsala, Cruonign self-heal) rolled as native PF2e Healing rolls
    let healingFormula = null;
    if (rune.invocation?.special === "heal-partnership" && typeof rune.invocation.healAmount === "function") {
      healingFormula = `${rune.invocation.healAmount(limits.level)}[healing]`;
    } else if (rune.slug === "xinsala") {
      healingFormula = `70[healing]`;
    } else if (typeof rune.invocation?.selfHeal === "function") {
      extraNotes.push(`If any creature takes damage, wielder regains @Damage[${rune.invocation.selfHeal(limits.level)}[healing]] HP.`);
    }

    const combinedTraits = Array.from(
      new Set([
        "invocation",
        "magical",
        "runesmith",
        ...(rune.traits || []).filter((t) => t !== "rune"),
        ...(rune.invocation?.traits || []),
        ...damageModifiers
      ])
    );

    const combinedTitle = diacritic ? `${diacritic.prefix}${rune.name}` : rune.name;
    invocationBlocks.push({
      blockId: foundry.utils.randomID(),
      runeSlug: rune.slug,
      runeName: combinedTitle,
      shortName: diacritic ? `${diacritic.prefix}${rune.shortName}` : rune.shortName,
      icon: rune.icon,
      color: rune.color,
      traits: combinedTraits,
      usageText: rune.usageText || "",
      passiveSummary: rune.passiveSummary(limits.level, entry.energyChoice || "fire"),
      bearerName: entry.targetName,
      bearerTokenId: entry.targetTokenId,
      bearerSceneId: entry.targetSceneId,
      bearerActorUuid: entry.targetActorUuid,
      summary: rune.invocation.summary(limits.level, entry.energyChoice || "fire"),
      emanationFeet: diacritic?.slug === "en-diacritic" && dmgSpec ? 15 : (rune.invocation?.emanationFeet ?? null),
      targetMode: rune.invocation?.targetMode ?? "bearer",
      damageDice: dmgSpec?.dice ?? null,
      damageType: dmgSpec?.type ?? null,
      damageModifiers,
      extraPersistentInstances,
      healingFormula,
      critFailPersistent: dmgSpec?.critFailPersistent ?? null,
      critFailPersistentType: dmgSpec?.critFailPersistentType ?? null,
      rolledDamageTotal: null,
      saveStatistic: rune.invocation?.save?.statistic ?? null,
      saveBasic: Boolean(rune.invocation?.save?.basic),
      unwillingOnly: Boolean(rune.invocation?.save?.unwillingOnly),
      special: rune.invocation?.special ?? null,
      grantedEffectMeta,
      successConditions: rune.invocation?.successConditions ?? [],
      failConditions: rune.invocation?.failConditions ?? [],
      critFailConditions: rune.invocation?.critFailConditions ?? [],
      extraNotes,
      targets
    });
  }

  // Remove invoked runes from actor state & record diacritic cooldowns
  const invokedIds = new Set(selectedEntries.map((e) => e.id));
  await mutateActorRuneState(actor, async (s) => {
    s.activeRunes = s.activeRunes.filter((r) => !invokedIds.has(r.id));
    s.diacriticCooldowns = { ...(s.diacriticCooldowns || {}), ...cooldownUpdates };
    return s;
  });

  const cardState = {
    actionLabel,
    classDC,
    level: limits.level,
    sourceTokenId: sourceToken?.id ?? null,
    blocks: invocationBlocks
  };

  // 1) Post expanded Invocation & Effect details card first
  const invMsg = await postInvocationChatCard(actor, cardState);

  // 2) Automatically roll real native PF2e DamageRoll / Healing cards (with Damage | Half | Double | Shield Block buttons!)
  let stateChangedByRolls = false;
  for (const block of cardState.blocks) {
    if (block.damageDice || block.healingFormula) {
      const total = await rollNativePf2eDamageCard(actor, cardState, block);
      if (total !== null) {
        block.rolledDamageTotal = total;
        stateChangedByRolls = true;
      }
    }
  }
  if (stateChangedByRolls && invMsg?.update) {
    await updateInvocationMessage(invMsg, cardState);
  }

  // Handle Sun- Preservation auto-retrace
  for (const prev of sunRetraces) {
    const bTok = prev.targetTokenId && canvas?.ready ? canvas.tokens?.get(prev.targetTokenId) : null;
    await applyRuneToTarget(actor, {
      runeSlug: prev.runeSlug,
      mode: "traced",
      actionCost: 0,
      targetToken: bTok,
      energyChoice: prev.energyChoice || "fire",
      skipRangeCheck: true,
      sourceLabel: "Sun-, Diacritic Rune of Preservation"
    });
  }
}

async function executeSpecialInvocationEffects(actor, level, entry, rune, diacritic, targets) {
  const spec = rune.invocation?.special;
  if (!spec) return null;

  if (spec === "raise-shield-holtrik") {
    await executeOnTargetActor(entry.targetActorUuid, "raiseShieldHoltrik", { level });
    if (diacritic?.slug === "fob-diacritic" && entry.targetActorUuid !== actor.uuid) {
      await executeOnTargetActor(actor.uuid, "raiseShieldHoltrik", { level });
    }
    return {
      name: "Invocation: Holtrik (+1 Status AC & Raise a Shield)",
      durationLabel: "1 round (until start of bearer's next turn)",
      details: "Immediately Raises the rune-bearing Shield and grants a +1 status bonus to AC while raised.",
      effectItemData: buildEffectItemData({
        name: "Invocation: Holtrik (+1 Status AC)",
        icon: rune.icon,
        description: "<p>Granted by invoking <strong>Holtrik, Rune of Dwarven Ramparts</strong>: +1 status bonus to AC while your shield remains raised until the start of your next turn.</p>",
        level,
        durationRounds: 1,
        expiry: "turn-start",
        rules: [{ key: "FlatModifier", selector: ["ac"], value: 1, type: "status", label: "Holtrik Invocation" }]
      })
    };
  }
  if (spec === "reduce-frightened-2") {
    for (const t of targets) {
      if (t.actorUuid) await executeOnTargetActor(t.actorUuid, "reduceFrightened", { amount: 2 });
    }
    return {
      name: "Baruiel Aura Release",
      durationLabel: "Instantaneous (10-ft emanation)",
      details: "Each ally within 10 feet of the rune-bearer reduces their Frightened condition value by 2.",
      effectItemData: null
    };
  }
  if (spec === "heal-partnership") {
    const heal = rune.invocation.healAmount(level);
    return {
      name: "Germantria Vital Release",
      durationLabel: "Instantaneous Healing",
      details: `Heals both ${actor.name} and ${entry.targetName} for ${heal} HP each (use the PF2e Heal button below on either token, or click Heal Both to apply to both at once).`,
      healPairAmount: heal,
      runesmithUuid: actor.uuid,
      bearerUuid: entry.targetActorUuid,
      effectItemData: null
    };
  }
  if (spec === "grant-marssyl-invocation") {
    const eff = buildEffectItemData({
      name: "Invocation: Marssyl (+1 Weapon Damage Die & Push)",
      icon: rune.icon,
      description: "<p>Next successful bludgeoning Strike before end of wielder's next turn deals +1 weapon damage die and forces a Fortitude save vs Runesmith Class DC or pushes the target 10 ft (20 ft on critical failure).</p>",
      level,
      durationRounds: 1,
      rules: [{ key: "DamageDice", selector: ["strike-damage"], diceNumber: 1, label: "Marssyl Invocation" }]
    });
    await executeOnTargetActor(entry.targetActorUuid, "createEffect", { itemData: eff });
    return {
      name: eff.name,
      durationLabel: "1 round",
      details: "+1 weapon damage die on next bludgeoning Strike; target attempts Fortitude save vs Class DC or is pushed 10 ft (20 ft on crit fail).",
      effectItemData: eff
    };
  }
  if (spec === "grant-rehgog-invocation") {
    const eff = buildEffectItemData({
      name: "Invocation: Rehgog (+1 Unarmed Damage Die)",
      icon: rune.icon,
      description: "<p>Bearer immediately Steps as a free action, and their next unarmed Strike before the start of the Runesmith's next turn deals +1 weapon damage die.</p>",
      level,
      durationRounds: 1,
      rules: [{ key: "DamageDice", selector: ["unarmed-damage"], diceNumber: 1, label: "Rehgog Invocation" }]
    });
    await executeOnTargetActor(entry.targetActorUuid, "createEffect", { itemData: eff });
    return {
      name: eff.name,
      durationLabel: "1 round",
      details: "Free-action Step + next unarmed Strike deals 1 additional weapon damage die.",
      effectItemData: eff
    };
  }
  if (spec === "grant-ulgatus-invocation") {
    const resVal = level >= 17 ? 20 : 10;
    const eff = buildEffectItemData({
      name: `Invocation: Ulgatus (Crit Resistance ${resVal})`,
      icon: rune.icon,
      description: `<p>Wearer gains resistance ${resVal} to critical hits for 1 minute.</p>`,
      level,
      durationRounds: 10,
      rules: [{ key: "Resistance", type: "critical-hits", value: resVal }]
    });
    await executeOnTargetActor(entry.targetActorUuid, "createEffect", { itemData: eff });
    return {
      name: eff.name,
      durationLabel: "1 minute (10 rounds)",
      details: `Grants Resistance ${resVal} against all damage from critical hits.`,
      effectItemData: eff
    };
  }
  if (spec === "grant-yudici-invocation") {
    const shieldHeal = 40 + Math.max(0, Math.floor((level - 9) / 3)) * 10;
    if (entry.targetActorUuid) {
      await executeOnTargetActor(entry.targetActorUuid, "repairShield", {
        amount: shieldHeal,
        subTargetId: entry.subTargetId || null
      });
    }
    const eff = buildEffectItemData({
      name: "Invocation: Yudici (+1 Status Attack & Skills)",
      icon: rune.icon,
      description: "<p>+1 status bonus to attack rolls and skill checks for 1 round.</p>",
      level,
      durationRounds: 1,
      rules: [{ key: "FlatModifier", selector: ["attack-roll", "skill-check"], value: 1, type: "status", label: "Yudici Invocation" }]
    });
    for (const t of targets) {
      if (t.actorUuid) await executeOnTargetActor(t.actorUuid, "createEffect", { itemData: eff });
    }
    return {
      name: eff.name,
      durationLabel: "1 round (10-ft emanation)",
      details: `Rune-bearing shield automatically regains up to ${shieldHeal} HP, and allies in a 10-ft emanation gain +1 status bonus to attack rolls and skill checks.`,
      effectItemData: eff
    };
  }
  if (spec === "grant-xinsala-invocation") {
    const eff = buildEffectItemData({
      name: "Invocation: Xinsala (+20-ft Speed & Quickened)",
      icon: rune.icon,
      description: "<p>+20-ft status bonus to Speeds and Quickened (extra action for Stride or Strike) for 1 round.</p>",
      level,
      durationRounds: 1,
      rules: [
        { key: "FlatModifier", selector: ["speed"], value: 20, type: "status", label: "Xinsala Speed" },
        { key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.nlCjDvLMf2EkV2dl" }
      ]
    });
    for (const t of targets) {
      if (t.actorUuid) await executeOnTargetActor(t.actorUuid, "createEffect", { itemData: eff });
    }
    return {
      name: eff.name,
      durationLabel: "1 round (30-ft aura)",
      details: "70 HP healing pool (select recipient token and Shift+Click PF2e's Heal button below to adjust/split amount per creature); allies in 30-ft aura gain +20-ft status bonus to Speeds and Quickened (Stride/Strike).",
      effectItemData: eff
    };
  }
  return null;
}

/**
 * Inspect and rank all melee Strikes on the actor by readiness, attack modifier, expected damage, and weapon priority.
 */
export function getRankedMeleeStrikes(actor) {
  const actions = actor?.system?.actions ?? [];
  const strMod = Number(actor?.system?.abilities?.str?.mod ?? 0);
  const dexMod = Number(actor?.system?.abilities?.dex?.mod ?? 0);
  const candidates = [];

  actions.forEach((a, actionIndex) => {
    if (!a || !a.variants?.length) return;
    if (a.type && a.type !== "strike") return;
    if (a.item?.isRanged && a.item?.isMelee !== true) return;
    if (a.item?.isMelee === false) return;

    const label = a.label || a.item?.name || "Melee Strike";
    const slug = a.slug || a.item?.slug || "";
    const ready = a.ready !== false;

    let attackMod = Number(a.totalModifier ?? a.modifier ?? NaN);
    if (!Number.isFinite(attackMod)) {
      const m = String(a.variants?.[0]?.label || "").match(/([+-]\d+)/);
      attackMod = m ? Number(m[1]) : 0;
    }

    const traits = a.item?.system?.traits?.value ?? [];
    const isShield =
      a.item?.type === "shield" ||
      a.item?.category === "shield" ||
      /shield/i.test(slug) ||
      /shield/i.test(label);
    const isUnarmed =
      a.item?.category === "unarmed" ||
      slug === "basic-unarmed" ||
      traits.includes("unarmed");
    const isTrueWeapon = a.item?.type === "weapon" && !isShield && !isUnarmed;

    const dmg = a.item?.system?.damage ?? a.item?.baseDamage ?? {};
    const dice = Math.max(1, Number(dmg.dice) || (isShield || isUnarmed ? 1 : 1));
    const dieStr = String(dmg.die || (isUnarmed || isShield ? "d4" : "d6"));
    const dieFaces = Number(dieStr.replace(/\D/g, "")) || 4;
    const dmgType = dmg.damageType || "";
    const flatMod = strMod + (Number(dmg.modifier) || 0);
    const avgDamage = dice * ((dieFaces + 1) / 2) + flatMod;

    const modText = flatMod > 0 ? `+${flatMod}` : flatMod < 0 ? `${flatMod}` : "";
    const damageSummary = `${dice}d${dieFaces}${modText}${dmgType ? ` ${dmgType}` : ""}`;

    const variants = a.variants.slice(0, 3).map((v, vIdx) => {
      const vm = String(v.label || "").match(/([+-]\d+)/);
      const fallbackMod = attackMod - vIdx * (traits.includes("agile") ? 4 : 5);
      const vMod = vm ? Number(vm[1]) : fallbackMod;
      const signStr = vMod >= 0 ? `+${vMod}` : `${vMod}`;
      return {
        index: vIdx,
        mod: vMod,
        shortLabel: vIdx === 0 ? `1st (${signStr})` : vIdx === 1 ? `2nd (${signStr})` : `3rd (${signStr})`
      };
    });

    candidates.push({
      actionIndex,
      slug,
      label,
      img: a.item?.img || "icons/skills/melee/weapons-crossed-swords-yellow.webp",
      ready,
      isShield,
      isUnarmed,
      isTrueWeapon,
      attackMod,
      avgDamage,
      damageSummary,
      variants,
      score:
        (ready ? 100000 : 0) +
        attackMod * 100 +
        avgDamage * 10 +
        (isTrueWeapon ? 3 : !isShield && !isUnarmed ? 2 : isShield ? 1 : 0)
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  candidates.forEach((c, idx) => {
    c.isRecommended = idx === 0;
  });
  return candidates;
}

/**
 * Engraving Strike workflow: roll chosen (or best-ranked) melee weapon Strike -> on hit/crit, automatically Trace chosen rune onto target!
 */
export async function executeEngravingStrike(actor, { actionIndex = null, variantIndex = 0, runeSlug, targetToken = null } = {}) {
  const rune = getRuneBySlug(runeSlug);
  if (!actor || !rune) {
    ui.notifications?.warn("Choose a rune from your repertoire for Engraving Strike!");
    return;
  }
  const resolvedTarget = targetToken ?? Array.from(game.user?.targets ?? [])[0] ?? null;
  if (!resolvedTarget) {
    ui.notifications?.warn("Target an adjacent enemy token first (T or right-click Target) for Engraving Strike!");
    return;
  }

  const ranked = getRankedMeleeStrikes(actor);
  const chosenMeta =
    actionIndex !== null && actionIndex !== undefined
      ? ranked.find((s) => s.actionIndex === Number(actionIndex)) ?? ranked[0]
      : ranked[0];

  const strike = chosenMeta ? actor.system?.actions?.[chosenMeta.actionIndex] : null;
  const variant = strike?.variants?.[variantIndex] ?? strike?.variants?.[0];
  if (!variant?.roll) {
    ui.notifications?.warn(`No ready melee Strike found on ${actor.name}!`);
    return;
  }

  // Ensure Foundry's user target is synced so PF2e evaluates hit vs target AC
  if (resolvedTarget.setTarget && !game.user?.targets?.has(resolvedTarget)) {
    resolvedTarget.setTarget(true, { releaseOthers: true });
  }

  // Listen briefly for the resulting Strike chat message to detect degreeOfSuccess
  let capturedOutcome = null;
  const hookId = Hooks.on("createChatMessage", (msg) => {
    if (msg.author?.id !== game.user?.id) return;
    const ctx = msg.flags?.pf2e?.context;
    if (ctx?.type === "attack-roll") {
      capturedOutcome = ctx.outcome ?? null;
    }
  });

  try {
    await variant.roll({});
  } finally {
    Hooks.off("createChatMessage", hookId);
  }

  const hitSuccess = capturedOutcome === "success" || capturedOutcome === "criticalSuccess";
  if (hitSuccess) {
    ui.notifications?.info(
      `Engraving Strike (${chosenMeta.label}) hit (${capturedOutcome})! Tracing ${rune.shortName} onto ${resolvedTarget.name}!`
    );
    await applyRuneToTarget(actor, {
      runeSlug: rune.slug,
      mode: "traced",
      actionCost: 0,
      targetToken: resolvedTarget,
      skipRangeCheck: true,
      sourceLabel: `Engraving Strike (${chosenMeta.label})`
    });
  } else if (capturedOutcome) {
    ui.notifications?.info(
      `Engraving Strike (${chosenMeta.label}) missed (${capturedOutcome}) — ${rune.shortName} was not traced.`
    );
  }
}

/**
 * Fortifying Knock workflow: Raise a Shield + Trace a shield rune in 1 Flourish action!
 */
export async function executeFortifyingKnock(actor, { runeSlug = "holtrik" } = {}) {
  if (!actor) return;
  const sourceToken = getActorTokenOnCanvas(actor);
  // Apply Raise a Shield effect
  const hasRaise = actor.itemTypes?.effect?.some((e) => e.slug === "effect-raise-a-shield");
  if (!hasRaise) {
    const shieldEff = await fromUuid("Compendium.pf2e.equipment-effects.Item.2YgXoHvJfrDHucMr").catch(() => null);
    if (shieldEff) await actor.createEmbeddedDocuments("Item", [shieldEff.toObject()]);
  }
  await applyRuneToTarget(actor, {
    runeSlug,
    mode: "traced",
    actionCost: 0,
    targetToken: sourceToken,
    skipRangeCheck: true,
    sourceLabel: "Fortifying Knock (Raise Shield + Trace)"
  });
}

/**
 * Save current Etched runes as Daily Preparation preset, or re-apply saved preset.
 */
export async function saveDailyEtchPreset(actor) {
  if (!actor) return;
  await mutateActorRuneState(actor, async (state) => {
    const etched = state.activeRunes.filter((r) => r.mode === "etched");
    state.dailyPreset = etched.map((e) => ({
      runeSlug: e.runeSlug,
      freeSlot: e.freeSlot,
      selfTarget: e.targetActorUuid === actor.uuid,
      targetActorUuid: e.targetActorUuid,
      targetName: e.targetName,
      energyChoice: e.energyChoice || "fire"
    }));
    ui.notifications?.info(`Saved ${state.dailyPreset.length} Etched rune(s) as ${actor.name}'s Daily Preparation Loadout!`);
    return state;
  });
}

export async function applyDailyEtchPreset(actor) {
  if (!actor) return;
  const state = getActorRuneState(actor);
  if (!state.dailyPreset.length) {
    ui.notifications?.warn("No Daily Etching Preset saved yet — etch your favorite runes first, then click 'Save Current Etchings as Daily Preset'.");
    return;
  }
  // Clear existing etched runes first
  for (const old of state.activeRunes.filter((r) => r.mode === "etched")) {
    await dismissActiveRune(actor, old.id, "daily-reset");
  }
  for (const item of state.dailyPreset) {
    const tok = canvas?.ready
      ? canvas.tokens?.placeables?.find((t) => t.actor?.uuid === item.targetActorUuid) ?? getActorTokenOnCanvas(actor)
      : null;
    await applyRuneToTarget(actor, {
      runeSlug: item.runeSlug,
      mode: "etched",
      targetToken: tok,
      freeSlot: Boolean(item.freeSlot),
      energyChoice: item.energyChoice || "fire",
      skipRangeCheck: true,
      sourceLabel: "Daily Preparations"
    });
  }
  ui.notifications?.info(`Applied ${state.dailyPreset.length} Daily Preparation Etched rune(s)!`);
}

/**
 * Combat turn hook: expire Traced runes at the end of the Runesmith's next turn.
 */
export function registerLifecycleHooks() {
  Hooks.on("pf2e.endTurn", async (combatant) => {
    const actor = combatant?.actor;
    if (!actor || !actor.isOwner) return;
    // Only primary owner (or primary GM if NPC/unowned) mutates to avoid duplicate runs
    const activeNonGM = Object.entries(actor.ownership ?? {}).find(
      ([uid, lvl]) => lvl === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && !game.users.get(uid)?.isGM && game.users.get(uid)?.active
    );
    if (activeNonGM && game.user.id !== activeNonGM[0]) return;
    if (!activeNonGM && !isPrimaryGM()) return;

    const state = getActorRuneState(actor);
    if (!state.activeRunes.some((r) => r.mode === "traced")) return;

    const expired = [];
    await mutateActorRuneState(actor, async (s) => {
      const kept = [];
      for (const r of s.activeRunes) {
        if (r.mode !== "traced") {
          kept.push(r);
          continue;
        }
        const rem = (Number(r.turnsRemaining) || 1) - 1;
        if (rem <= 0) {
          expired.push(r);
        } else {
          r.turnsRemaining = rem;
          kept.push(r);
        }
      }
      s.activeRunes = kept;
      return s;
    });

    for (const exp of expired) {
      await executeOnTargetActor(exp.targetActorUuid, "deleteEffect", {
        effectId: exp.effectItemId,
        runeEntryId: exp.id
      });
      const rDef = getRuneBySlug(exp.runeSlug);
      ui.notifications?.info(`Traced rune ${rDef?.shortName ?? "Rune"} on ${exp.targetName} faded at end of turn.`);
    }
  });

  // Sync if a Rune Effect item is manually deleted from a token/sheet
  Hooks.on("deleteItem", async (item) => {
    if (item?.type !== "effect") return;
    const meta = item.flags?.[MODULE_ID];
    if (!meta?.runeEntryId || !meta?.sourceActorId) return;
    const sourceActor = game.actors?.get(meta.sourceActorId);
    if (!sourceActor || !sourceActor.isOwner) return;
    const state = getActorRuneState(sourceActor);
    if (!state.activeRunes.some((r) => r.id === meta.runeEntryId)) return;
    await mutateActorRuneState(sourceActor, async (s) => {
      s.activeRunes = s.activeRunes.filter((r) => r.id !== meta.runeEntryId);
      return s;
    });
  });

  // Daily rest hook
  Hooks.on("pf2e.restForTheNight", async (actor) => {
    if (!actor || !actor.isOwner || !isRunesmithActor(actor)) return;
    const state = getActorRuneState(actor);
    if (state.dailyPreset.length > 0) {
      ui.notifications?.info(`${actor.name} rested — open the Runesmith Command Deck (Daily Prep tab) to 1-click apply your Daily Etched Runes!`);
    }
  });
}

// ===========================================================================
// CHAT CARDS, EXPANDED EFFECTS & NATIVE PF2E DAMAGE ROLLS
// ===========================================================================

const PF2E_CONDITION_UUIDS = {
  blinded: "Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2",
  clumsy: "Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm",
  concealed: "Compendium.pf2e.conditionitems.Item.DmAIPqOBomZ7H95W",
  dazzled: "Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh",
  doomed: "Compendium.pf2e.conditionitems.Item.3uh1r86TzbQvosxv",
  drained: "Compendium.pf2e.conditionitems.Item.4D2KBtexWXa6oUMR",
  enfeebled: "Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7",
  "off-guard": "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg",
  quickened: "Compendium.pf2e.conditionitems.Item.nlCjDvLMf2EkV2dl",
  restrained: "Compendium.pf2e.conditionitems.Item.VcDeM8A5oI6VqhbM",
  slowed: "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3",
  stupefied: "Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg"
};

function formatConditionEnricher(cond) {
  const slug = String(cond?.slug || "").toLowerCase();
  const labelCap = slug.charAt(0).toUpperCase() + slug.slice(1);
  const label = cond?.value ? `${labelCap} ${cond.value}` : labelCap;
  const dur = cond?.durationRounds ? ` (${cond.durationRounds} round${cond.durationRounds > 1 ? "s" : ""})` : "";
  const uuid = PF2E_CONDITION_UUIDS[slug];
  return uuid ? `@UUID[${uuid}]{${label}}${dur}` : `<strong>${escapeHtml(label)}</strong>${escapeHtml(dur)}`;
}

async function enrichHtmlSafe(html, rollData = {}) {
  try {
    const enricher = foundry?.applications?.ux?.TextEditor?.implementation?.enrichHTML;
    if (typeof enricher === "function") {
      return await enricher(html, { rollData, async: true });
    }
  } catch (_e) {
    // Fallback to raw HTML in headless test environments
  }
  return html;
}

/**
 * Convert a rune invocation block's damage / healing spec into a PF2e InstancePool DamageRoll formula.
 */
export function buildPf2eDamagePoolFormula(block) {
  if (block.healingFormula) {
    return `(${block.healingFormula.replace(/\[healing\]/i, "")})[healing]`;
  }
  if (!block.damageDice) return null;

  const mods = Array.isArray(block.damageModifiers) && block.damageModifiers.length > 0
    ? `,${block.damageModifiers.join(",")}`
    : "";

  let primaryExpr;
  if (block.damageDice.includes("[")) {
    // Multi-instance expression e.g. "3d10[bludgeoning] + 8d6[fire]" -> comma-separated InstancePool
    primaryExpr = block.damageDice.replace(/\]\s*\+\s*/g, "], ");
    if (mods) {
      primaryExpr = primaryExpr.replace(/\[([^\]]+)\]/g, (_m, inner) => `[${inner}${mods}]`);
    }
  } else {
    const typeTag = `${block.damageType || "untyped"}${mods}`;
    primaryExpr = `(${block.damageDice})[${typeTag}]`;
  }

  const parts = [primaryExpr];
  for (const pInst of block.extraPersistentInstances || []) {
    parts.push(pInst);
  }
  return parts.join(", ");
}

/**
 * Roll and post a genuine PF2e DamageRoll chat card so the GM and players get native
 * PF2e [Damage] | [Half] | [Double] | [Shield Block] / [Heal] buttons and full IWR automation!
 */
export async function rollNativePf2eDamageCard(actor, cardState, block) {
  const formula = buildPf2eDamagePoolFormula(block);
  if (!formula) return null;

  const DamageRollClass = CONFIG?.Dice?.rolls?.find((R) => R.name === "DamageRoll") || Roll;
  const rollData = actor?.getRollData?.() ?? {};

  let dRoll;
  try {
    dRoll = new DamageRollClass(formula, rollData);
    await dRoll.evaluate();
  } catch (err) {
    console.warn(`${MODULE_ID} | DamageRoll fallback to standard Roll for "${formula}":`, err);
    dRoll = await new Roll(formula, rollData).evaluate();
  }

  const allTraits = Array.from(new Set(block.traits || ["invocation", "magical", "runesmith"]));
  const traitsTagsHtml = allTraits
    .map((t) => `<span class="tag" data-trait="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
    .join("");

  const saveSubHeader = block.saveStatistic
    ? `<div class="rcd-dmg-flavor-sub">Save: <strong>${block.saveBasic ? "Basic " : ""}${escapeHtml(block.saveStatistic.charAt(0).toUpperCase() + block.saveStatistic.slice(1))}</strong> vs <strong>DC ${cardState.classDC}</strong> &bull; Target: <strong>${escapeHtml(block.targets.map((t) => t.name).join(", ") || block.bearerName)}</strong></div>`
    : `<div class="rcd-dmg-flavor-sub">Target: <strong>${escapeHtml(block.targets.map((t) => t.name).join(", ") || block.bearerName)}</strong></div>`;

  const critFailExtraNote = block.critFailPersistent
    ? `<div class="rcd-dmg-flavor-note">Crit Fail Rider: <strong>${escapeHtml(block.critFailPersistent)} persistent ${escapeHtml(block.critFailPersistentType || block.damageType || "")}</strong></div>`
    : "";

  const flavorHtml = `
    <h4 class="action"><strong>${escapeHtml(block.runeName)}</strong> — ${block.healingFormula ? "Invocation Healing" : "Invocation Damage"}</h4>
    <div class="tags" data-tooltip-class="pf2e">${traitsTagsHtml}</div>
    <hr />
    ${saveSubHeader}
    ${critFailExtraNote}
  `;

  // Resolve primary target token UUID for PF2e context & Toolbelt Target Helper
  const firstTarget = block.targets?.[0] ?? null;
  const firstTok = firstTarget?.tokenId && canvas?.ready ? canvas.tokens?.get(firstTarget.tokenId) : null;
  const targetTokenUuid = firstTok?.document?.uuid ?? (firstTarget?.sceneId && firstTarget?.tokenId ? `Scene.${firstTarget.sceneId}.Token.${firstTarget.tokenId}` : null);

  const pf2eFlags = {
    context: {
      type: "damage-roll",
      sourceType: block.saveStatistic ? "save" : "attack",
      actor: actor?.id ?? null,
      domains: ["damage", "all"],
      traits: allTraits,
      options: [
        ...allTraits.map((t) => `item:trait:${t}`),
        ...(block.saveBasic ? ["damaging-effect"] : [])
      ],
      target: targetTokenUuid && firstTarget?.actorUuid ? { actor: firstTarget.actorUuid, token: targetTokenUuid } : null,
      outcome: null
    },
    origin: {
      actor: actor?.uuid ?? null,
      sourceId: actor?.id ?? null,
      type: "action"
    }
  };

  const msgFlags = {
    pf2e: pf2eFlags,
    [MODULE_ID]: {
      cardType: "invocation-damage",
      runeSlug: block.runeSlug,
      blockId: block.blockId
    }
  };

  if (block.saveStatistic && game.modules?.get?.("pf2e-toolbelt")?.active) {
    const targetUuids = (block.targets || [])
      .map((t) => {
        const tk = t.tokenId && canvas?.ready ? canvas.tokens?.get(t.tokenId) : null;
        return tk?.document?.uuid ?? (t.sceneId && t.tokenId ? `Scene.${t.sceneId}.Token.${t.tokenId}` : null);
      })
      .filter(Boolean);

    msgFlags["pf2e-toolbelt"] = {
      targetHelper: {
        type: "action",
        author: actor?.uuid ?? null,
        traits: allTraits,
        options: block.saveBasic ? ["damaging-effect"] : [],
        saveVariants: {
          null: {
            basic: Boolean(block.saveBasic),
            dc: cardState.classDC,
            statistic: block.saveStatistic
          }
        },
        targets: targetUuids
      }
    };
  }

  const sourceTok = cardState.sourceTokenId && canvas?.ready ? canvas.tokens?.get(cardState.sourceTokenId) : null;
  await dRoll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor, token: sourceTok?.document ?? sourceTok }),
    flavor: flavorHtml,
    flags: msgFlags
  });

  return Math.max(0, Number(dRoll.total) || 0);
}

async function postRuneAppliedChatCard(actor, {
  rune,
  mode,
  actionCost,
  freeSlot,
  targetDisplayName,
  subTargetName,
  passiveDesc,
  sourceLabel,
  level,
  energyChoice
}) {
  const glyphHtml =
    mode === "etched"
      ? `<span class="rcd-badge rcd-badge-etched">ETCHED${freeSlot ? " (FREE)" : ""}</span>`
      : `<span class="rcd-badge rcd-badge-traced">TRACED ${actionCost > 0 ? `[${actionCost}A]` : "[FREE]"}</span>`;

  const subTxt = subTargetName ? ` <em>(${escapeHtml(subTargetName)})</em>` : "";
  const viaTxt = sourceLabel ? `<div class="rcd-chat-via">Via ${escapeHtml(sourceLabel)}</div>` : "";
  const traitsHtml = rune.traits
    .map((t) => `<span class="rcd-trait">${escapeHtml(t)}</span>`)
    .join("");
  const durationNote = mode === "etched" ? "Sustained (unlimited until invoked/replaced)" : "Until end of Runesmith's next turn";

  const rawHtml = `
    <div class="rcd-chat-card" style="--rcd-accent:${rune.color}">
      <div class="rcd-chat-header">
        <img src="${escapeHtml(rune.icon)}" alt="${escapeHtml(rune.shortName)}" />
        <div class="rcd-chat-title-wrap">
          <div class="rcd-chat-title">${escapeHtml(rune.name)}</div>
          <div class="rcd-chat-sub">${glyphHtml} &rarr; <strong>${escapeHtml(targetDisplayName)}</strong>${subTxt}</div>
        </div>
      </div>
      ${viaTxt}
      <div class="rcd-trait-row">${traitsHtml}</div>
      <div class="rcd-chat-body">
        <div class="rcd-effect-box">
          <div class="rcd-effect-hdr">
            <span><strong>Active Bearer Effect</strong> (${escapeHtml(rune.usageText)})</span>
            <span class="rcd-effect-dur">${escapeHtml(durationNote)}</span>
          </div>
          <p>${escapeHtml(passiveDesc)}</p>
        </div>
        <p class="rcd-chat-inv-preview"><strong>When Invoked [1A]:</strong> ${escapeHtml(rune.invocation.summary(level, energyChoice || "fire"))}</p>
      </div>
    </div>
  `;

  const enrichedContent = await enrichHtmlSafe(rawHtml, actor?.getRollData?.() ?? {});
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: enrichedContent,
    flags: { [MODULE_ID]: { cardType: "rune-applied", runeSlug: rune.slug } }
  });
}

async function renderInvocationCardHtml(cardState, rollData = {}) {
  const blocksHtml = cardState.blocks
    .map((b) => {
      const traitsRow = (b.traits || [])
        .map((t) => `<span class="rcd-trait">${escapeHtml(t)}</span>`)
        .join("");

      const inlineCheckStr = b.saveStatistic
        ? `@Check[${b.saveStatistic}|dc:${cardState.classDC}${b.saveBasic ? "|basic" : ""}|traits:${(b.traits || []).join(",")}]`
        : "";

      const templateStr = b.emanationFeet
        ? `@Template[type:${b.runeSlug === "cruonign" ? "cone" : b.runeSlug === "ochygholl" ? "burst" : "emanation"}|distance:${b.emanationFeet}]`
        : "";

      const saveAndAreaLine =
        inlineCheckStr || templateStr
          ? `<div class="rcd-inv-meta rcd-enriched-line">${inlineCheckStr ? `<strong>Save:</strong> ${inlineCheckStr}${b.unwillingOnly ? " <em>(unwilling only)</em>" : ""}` : ""} ${templateStr ? `<strong>Area:</strong> ${templateStr}` : ""}</div>`
          : "";

      // Degree condition breakdown with clickable PF2e @UUID condition pills + GM 1-click apply
      const condOutcomeParts = [];
      if (b.successConditions?.length) {
        condOutcomeParts.push(`<div><strong>Success:</strong> ${b.successConditions.map(formatConditionEnricher).join(", ")}</div>`);
      }
      if (b.failConditions?.length) {
        condOutcomeParts.push(`<div><strong>Failure:</strong> ${b.failConditions.map(formatConditionEnricher).join(", ")}</div>`);
      }
      if (b.critFailConditions?.length || b.critFailPersistent) {
        const cfItems = (b.critFailConditions || []).map(formatConditionEnricher);
        if (b.critFailPersistent) {
          cfItems.push(`@Damage[${b.critFailPersistent}[persistent,${b.critFailPersistentType || b.damageType || "untyped"}]]`);
        }
        condOutcomeParts.push(`<div><strong>Critical Failure:</strong> ${cfItems.join(", ")}</div>`);
      }
      const degreeBoxHtml = condOutcomeParts.length
        ? `<div class="rcd-effect-box rcd-outcomes-box">${condOutcomeParts.join("")}</div>`
        : "";

      // Expanded Granted Invocation Effect details + Apply to Selected Token button
      const grantedBoxHtml = b.grantedEffectMeta
        ? `<div class="rcd-effect-box">
            <div class="rcd-effect-hdr">
              <span>&#10024; <strong>${escapeHtml(b.grantedEffectMeta.name)}</strong></span>
              <span class="rcd-effect-dur">${escapeHtml(b.grantedEffectMeta.durationLabel)}</span>
            </div>
            <p>${escapeHtml(b.grantedEffectMeta.details)}</p>
            ${
              b.grantedEffectMeta.effectItemData
                ? `<button type="button" class="rcd-chat-btn rcd-btn-cyan" data-rcd-action="grant-effect-selected" data-block-id="${b.blockId}"><i class="fas fa-magic"></i> Apply Effect to Selected Token(s)</button>`
                : ""
            }
            ${
              b.grantedEffectMeta.healPairAmount
                ? `<button type="button" class="rcd-chat-btn rcd-btn-cyan" data-rcd-action="heal-germantria-pair" data-block-id="${b.blockId}"><i class="fas fa-heart"></i> Heal Both Runesmith &amp; Bearer (+${b.grantedEffectMeta.healPairAmount} HP)</button>`
                : ""
            }
          </div>`
        : "";

      const dmgRollLine =
        b.damageDice || b.healingFormula
          ? `<div class="rcd-inv-meta">
              <strong>${b.healingFormula ? "Healing:" : "Damage:"}</strong>
              <code>${escapeHtml(b.healingFormula || `${b.damageDice} ${b.damageType || ""}`)}</code>
              ${
                b.rolledDamageTotal !== null
                  ? `<span class="rcd-rolled-pill">Rolled below (${b.rolledDamageTotal}) &mdash; use PF2e Damage / Half / Double / Block buttons</span>`
                  : ""
              }
              <button type="button" class="rcd-chat-btn" data-rcd-action="roll-block-damage" data-block-id="${b.blockId}" title="Roll a fresh native PF2e Damage Card in chat">
                <i class="fas fa-dice-d20"></i> ${b.rolledDamageTotal !== null ? "Re-Roll Damage Card" : "Roll Damage Card"}
              </button>
            </div>`
          : "";

      const zohkBtn =
        b.special === "teleport-adjacent" && b.bearerTokenId
          ? `<div class="rcd-inv-meta"><button type="button" class="rcd-chat-btn rcd-btn-cyan" data-rcd-action="zohk-teleport" data-block-id="${b.blockId}"><i class="fas fa-bolt"></i> Teleport ${escapeHtml(b.bearerName)} Adjacent to Runesmith</button></div>`
          : "";

      const notesHtml = b.extraNotes?.length
        ? `<ul class="rcd-inv-notes">${b.extraNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
        : "";

      const targetsRows = b.targets
        .map((t, idx) => {
          const degBadge = t.degree
            ? `<span class="rcd-deg rcd-deg-${t.degree}">${escapeHtml(formatDegreeLabel(t.degree))} (${t.saveRoll})</span>`
            : "";

          const rollSaveBtn = t.saveStatistic
            ? `<button type="button" class="rcd-chat-mini-btn" data-rcd-action="roll-target-save" data-block-id="${b.blockId}" data-target-idx="${idx}" title="Roll ${escapeHtml(t.saveStatistic)} save vs DC ${cardState.classDC}${t.savePenalty ? ` (${t.savePenalty} status)` : ""}"><i class="fas fa-shield-alt"></i> Save</button>`
            : "";

          const condListForDeg =
            t.degree === "criticalFailure"
              ? b.critFailConditions
              : t.degree === "failure"
                ? b.failConditions
                : t.degree === "success"
                  ? b.successConditions
                  : [];

          const hasCritPersistent = t.degree === "criticalFailure" && Boolean(b.critFailPersistent);
          const applyCondBtn =
            condListForDeg?.length > 0 || hasCritPersistent
              ? `<button type="button" class="rcd-chat-mini-btn" data-rcd-action="apply-target-conditions" data-block-id="${b.blockId}" data-target-idx="${idx}" title="Apply save condition(s) / persistent damage to ${escapeHtml(t.name)}">+ Cond</button>`
              : "";

          return `
            <div class="rcd-target-row">
              <img src="${escapeHtml(t.img)}" alt="" />
              <span class="rcd-target-name">${escapeHtml(t.name)}</span>
              <div class="rcd-target-controls">
                ${degBadge}
                ${rollSaveBtn}
                ${applyCondBtn}
              </div>
            </div>
          `;
        })
        .join("");

      const rollAllSavesBtn =
        b.saveStatistic && b.targets.some((t) => !t.degree)
          ? `<button type="button" class="rcd-chat-btn" data-rcd-action="roll-all-saves" data-block-id="${b.blockId}"><i class="fas fa-dice"></i> Roll All Saves (DC ${cardState.classDC})</button>`
          : "";

      return `
        <div class="rcd-inv-block" style="--rcd-accent:${b.color}">
          <div class="rcd-chat-header">
            <img src="${escapeHtml(b.icon)}" alt="${escapeHtml(b.shortName)}" />
            <div class="rcd-chat-title-wrap">
              <div class="rcd-chat-title">&#9889; ${escapeHtml(b.runeName)}</div>
              <div class="rcd-chat-sub">Invoked from <strong>${escapeHtml(b.bearerName)}</strong></div>
            </div>
          </div>
          <div class="rcd-trait-row">${traitsRow}</div>
          <div class="rcd-chat-body">
            <p class="rcd-inv-fulltext">${escapeHtml(b.summary)}</p>
            ${saveAndAreaLine}
            ${degreeBoxHtml}
            ${grantedBoxHtml}
            ${dmgRollLine}
            ${zohkBtn}
            ${notesHtml}
            <div class="rcd-targets-box">
              <div class="rcd-targets-hdr">
                <span>Targets (${b.targets.length})</span>
                ${rollAllSavesBtn}
              </div>
              ${targetsRows}
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const rawHtml = `
    <div class="rcd-chat-card rcd-invocation-card">
      <div class="rcd-inv-banner">${escapeHtml(cardState.actionLabel)} [1A] &bull; Class DC ${cardState.classDC}</div>
      ${blocksHtml}
    </div>
  `;
  return enrichHtmlSafe(rawHtml, rollData);
}

function formatDegreeLabel(deg) {
  switch (deg) {
    case "criticalSuccess":
      return "Crit Success";
    case "success":
      return "Success";
    case "failure":
      return "Failure";
    case "criticalFailure":
      return "Crit Failure";
    default:
      return deg;
  }
}

function computeDegreeOfSuccess(total, naturalDie, dc) {
  let deg = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (naturalDie === 20) deg = Math.min(3, deg + 1);
  if (naturalDie === 1) deg = Math.max(0, deg - 1);
  return ["criticalFailure", "failure", "success", "criticalSuccess"][deg];
}

async function postInvocationChatCard(actor, cardState) {
  const html = await renderInvocationCardHtml(cardState, actor?.getRollData?.() ?? {});
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: html,
    flags: {
      [MODULE_ID]: {
        cardType: "invocation",
        actorId: actor.id,
        cardState
      }
    }
  });
}

export function registerChatCardListeners() {
  // Foundry v13 & v14 compatible hook: renderChatMessageHTML passes an HTMLElement
  const bindCardEvents = (message, rootEl) => {
    const container = rootEl instanceof HTMLElement ? rootEl : rootEl?.[0];
    if (!container) return;
    const flagData = message.flags?.[MODULE_ID];
    if (!flagData || flagData.cardType !== "invocation") return;

    if (container.dataset.rcdBound === "1") return;
    container.dataset.rcdBound = "1";

    container.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-rcd-action]");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();

      const action = btn.dataset.rcdAction;
      const blockId = btn.dataset.blockId;
      const targetIdx = btn.dataset.targetIdx !== undefined ? Number(btn.dataset.targetIdx) : null;

      const latestMsg = game.messages?.get(message.id) ?? message;
      const actorId = latestMsg.flags?.[MODULE_ID]?.actorId;
      const actor = (actorId && game.actors?.get(actorId)) || latestMsg.actor || null;
      const state = foundry.utils.deepClone(latestMsg.flags?.[MODULE_ID]?.cardState);
      if (!state) return;
      const block = state.blocks.find((b) => b.blockId === blockId);
      if (!block) return;

      if (action === "roll-block-damage" && (block.damageDice || block.healingFormula)) {
        const total = await rollNativePf2eDamageCard(actor, state, block);
        if (total !== null) {
          block.rolledDamageTotal = total;
          await updateInvocationMessage(latestMsg, state);
        }
      } else if (action === "roll-target-save" && targetIdx !== null) {
        await rollTargetSaveInBlock(state, block, targetIdx);
        await updateInvocationMessage(latestMsg, state);
      } else if (action === "roll-all-saves") {
        for (let i = 0; i < block.targets.length; i++) {
          if (!block.targets[i].degree) await rollTargetSaveInBlock(state, block, i);
        }
        await updateInvocationMessage(latestMsg, state);
      } else if (action === "apply-target-conditions" && targetIdx !== null) {
        const t = block.targets[targetIdx];
        if (!t?.actorUuid) return;
        const condList =
          t.degree === "criticalFailure"
            ? block.critFailConditions
            : t.degree === "failure"
              ? block.failConditions
              : t.degree === "success"
                ? block.successConditions
                : [];
        for (const c of condList || []) {
          await executeOnTargetActor(t.actorUuid, "applyCondition", { slug: c.slug, value: c.value });
        }
        if (t.degree === "criticalFailure" && block.critFailPersistent) {
          await executeOnTargetActor(t.actorUuid, "applyPersistent", {
            formula: block.critFailPersistent,
            damageType: block.critFailPersistentType || block.damageType || "untyped"
          });
        }
        ui.notifications?.info(`Applied save outcome effect(s) to ${t.name}.`);
      } else if (action === "grant-effect-selected" && block.grantedEffectMeta?.effectItemData) {
        const controlled = canvas?.tokens?.controlled ?? [];
        if (!controlled.length) {
          ui.notifications?.warn("Select one or more tokens on the canvas first to apply this effect!");
          return;
        }
        for (const tok of controlled) {
          if (tok.actor?.uuid) {
            await executeOnTargetActor(tok.actor.uuid, "createEffect", {
              itemData: foundry.utils.deepClone(block.grantedEffectMeta.effectItemData)
            });
          }
        }
        ui.notifications?.info(`Applied ${block.grantedEffectMeta.name} to ${controlled.length} token(s).`);
      } else if (action === "heal-germantria-pair" && block.grantedEffectMeta?.healPairAmount) {
        const amt = block.grantedEffectMeta.healPairAmount;
        if (block.grantedEffectMeta.bearerUuid) {
          await executeOnTargetActor(block.grantedEffectMeta.bearerUuid, "applyHealing", { amount: amt });
        }
        if (block.grantedEffectMeta.runesmithUuid && block.grantedEffectMeta.runesmithUuid !== block.grantedEffectMeta.bearerUuid) {
          await executeOnTargetActor(block.grantedEffectMeta.runesmithUuid, "applyHealing", { amount: amt });
        }
        ui.notifications?.info(`Germantria healed both Runesmith and Rune-bearer for ${amt} HP!`);
      } else if (action === "zohk-teleport") {
        await performZohkTeleport(state, block);
      }
    });
  };

  Hooks.on("renderChatMessageHTML", bindCardEvents);
}

async function rollTargetSaveInBlock(state, block, idx) {
  const t = block.targets[idx];
  if (!t || !t.saveStatistic) return;
  const doc = t.actorUuid ? await fromUuid(t.actorUuid).catch(() => null) : null;
  const targetActor = doc?.actor ?? (doc?.documentName === "Actor" ? doc : null);
  const saveMod = Number(targetActor?.saves?.[t.saveStatistic]?.mod ?? targetActor?.system?.saves?.[t.saveStatistic]?.value ?? 0);
  const totalMod = saveMod + (Number(t.savePenalty) || 0);
  const sign = totalMod >= 0 ? `+ ${totalMod}` : `- ${Math.abs(totalMod)}`;
  const roll = await new Roll(`1d20 ${sign}`).evaluate();
  const die = roll.dice?.[0]?.total ?? 10;
  t.saveRoll = roll.total;
  t.degree = computeDegreeOfSuccess(roll.total, die, state.classDC);
}

async function updateInvocationMessage(message, nextState) {
  const actorId = message.flags?.[MODULE_ID]?.actorId;
  const actor = (actorId && game.actors?.get?.(actorId)) || message.actor || null;
  const content = await renderInvocationCardHtml(nextState, actor?.getRollData?.() ?? {});
  if (game.user?.isGM || message.isAuthor) {
    await message.update({
      content,
      [`flags.${MODULE_ID}.cardState`]: nextState
    });
  }
}

async function performZohkTeleport(state, block) {
  if (!canvas?.ready) return;
  const sourceTok = state.sourceTokenId ? canvas.tokens?.get(state.sourceTokenId) : null;
  const bearerTok = block.bearerTokenId ? canvas.tokens?.get(block.bearerTokenId) : null;
  if (!sourceTok || !bearerTok) {
    ui.notifications?.warn("Both Runesmith and Rune-bearer tokens must be on the active scene to teleport!");
    return;
  }
  const gridPx = Number(canvas.grid?.size) || 100;
  const offsets = [
    [gridPx, 0],
    [-gridPx, 0],
    [0, gridPx],
    [0, -gridPx],
    [gridPx, gridPx],
    [-gridPx, gridPx],
    [gridPx, -gridPx],
    [-gridPx, -gridPx]
  ];
  let dest = { x: sourceTok.document.x + gridPx, y: sourceTok.document.y };
  for (const [dx, dy] of offsets) {
    const cx = sourceTok.document.x + dx;
    const cy = sourceTok.document.y + dy;
    const occupied = canvas.tokens.placeables.some(
      (o) => o.id !== bearerTok.id && Math.hypot(o.document.x - cx, o.document.y - cy) < gridPx * 0.6
    );
    if (!occupied) {
      dest = { x: cx, y: cy };
      break;
    }
  }
  await executeOnTargetActor(block.bearerActorUuid, "teleportToken", {
    sceneId: bearerTok.scene.id,
    tokenId: bearerTok.id,
    x: dest.x,
    y: dest.y
  });
  ui.notifications?.info(`Zohk, Rune of Homecoming teleported ${bearerTok.name} adjacent to ${sourceTok.name}!`);
}
