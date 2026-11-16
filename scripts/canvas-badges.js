import { MODULE_ID, getActorRuneState } from "./rune-engine.js";
import { getRuneBySlug } from "./runes-db.js";

const CONTAINER_NAME = "rcdRuneBadgesContainer";
let rangePreviewGraphics = null;

function hexToInt(hexStr) {
  const clean = String(hexStr || "#f59e0b").replace("#", "");
  const parsed = Number.parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : 0xf59e0b;
}

/**
 * Collect all active runes across all Runesmith characters in the world, grouped by target token / actor.
 */
function collectRunesByToken(currentSceneId) {
  const bySceneTokenKey = new Map();
  const byActorId = new Map();

  for (const actor of game.actors?.contents ?? []) {
    const raw = actor.getFlag(MODULE_ID, "state");
    if (!raw?.activeRunes?.length) continue;
    const state = getActorRuneState(actor);
    for (const entry of state.activeRunes) {
      const rune = getRuneBySlug(entry.runeSlug);
      if (!rune) continue;
      const item = { entry, rune, diacritic: entry.diacriticSlug ? getRuneBySlug(entry.diacriticSlug) : null };
      if (entry.targetTokenId && (!entry.targetSceneId || entry.targetSceneId === currentSceneId)) {
        const key = `${entry.targetSceneId || currentSceneId}:${entry.targetTokenId}`;
        if (!bySceneTokenKey.has(key)) bySceneTokenKey.set(key, []);
        bySceneTokenKey.get(key).push(item);
      } else if (!entry.targetTokenId && entry.targetActorUuid && String(entry.targetActorUuid).startsWith("Actor.")) {
        const aId = String(entry.targetActorUuid).split(".")[1];
        if (!byActorId.has(aId)) byActorId.set(aId, []);
        byActorId.get(aId).push(item);
      } else if (entry.targetTokenId && entry.targetSceneId && entry.targetSceneId !== currentSceneId && String(entry.targetActorUuid || "").startsWith("Actor.")) {
        // Persistent linked PC moving across scenes
        const aId = String(entry.targetActorUuid).split(".")[1];
        if (!byActorId.has(aId)) byActorId.set(aId, []);
        byActorId.get(aId).push(item);
      }
    }
  }
  return { bySceneTokenKey, byActorId };
}

/**
 * Render crisp PIXI runic orbs along the top-right edge of any Runebearer token on the canvas.
 */
export function refreshAllTokenRuneBadges() {
  if (!canvas?.ready || !canvas.tokens?.placeables) return;
  const currentSceneId = canvas.scene?.id ?? "";
  const showBadges = game.settings?.get(MODULE_ID, "showTokenBadges") !== false;
  const { bySceneTokenKey, byActorId } = collectRunesByToken(currentSceneId);

  for (const token of canvas.tokens.placeables) {
    const prev = token.children?.find((c) => c.name === CONTAINER_NAME);
    if (prev) {
      token.removeChild(prev);
      prev.destroy({ children: true });
    }
    if (!showBadges) continue;

    const sceneKey = `${currentSceneId}:${token.id}`;
    const list = bySceneTokenKey.get(sceneKey) ?? (token.actor?.id ? byActorId.get(token.actor.id) : null) ?? [];
    if (!list.length) continue;

    const container = new PIXI.Container();
    container.name = CONTAINER_NAME;
    container.eventMode = "none";

    const badgeRadius = 10;
    const step = 22;
    const tokenW = Math.max(48, Number(token.w) || 100);
    const maxCols = Math.max(2, Math.floor((tokenW - 6) / step));

    list.slice(0, 6).forEach(({ entry, rune, diacritic }, idx) => {
      const col = idx % maxCols;
      const row = Math.floor(idx / maxCols);
      const orb = new PIXI.Graphics();
      const cx = Math.max(badgeRadius + 2, tokenW - badgeRadius - 3 - col * step);
      const cy = badgeRadius + 3 + row * step;
      const isEtched = entry.mode === "etched";

      // Outer aura ring (solid molten gold for Etched, bright arcane cyan for Traced)
      orb.lineStyle(2.2, isEtched ? 0xfbbf24 : 0x22d3ee, 0.95);
      orb.beginFill(0x0f172a, 0.92);
      orb.drawCircle(cx, cy, badgeRadius);
      orb.endFill();

      // Inner elemental rune core
      orb.lineStyle(1.2, hexToInt(rune.color), 0.9);
      orb.beginFill(hexToInt(rune.color), 0.35);
      orb.drawCircle(cx, cy, badgeRadius - 3);
      orb.endFill();

      // Diacritic diamond crown indicator if modified
      if (diacritic) {
        orb.lineStyle(1, 0xffffff, 0.95);
        orb.beginFill(hexToInt(diacritic.color), 1);
        orb.drawPolygon([cx, cy - badgeRadius - 3, cx + 4, cy - badgeRadius + 1, cx, cy - badgeRadius + 5, cx - 4, cy - badgeRadius + 1]);
        orb.endFill();
      }

      container.addChild(orb);

      const glyphLetter = (diacritic ? `${diacritic.shortName[0]}·` : "") + rune.shortName.slice(0, 2).toUpperCase();
      const label = new PIXI.Text(glyphLetter, {
        fontFamily: "Signika, sans-serif",
        fontSize: diacritic ? 8 : 9,
        fontWeight: "bold",
        fill: 0xf8fafc,
        stroke: 0x020617,
        strokeThickness: 2.5
      });
      label.anchor.set(0.5, 0.5);
      label.position.set(cx, cy);
      container.addChild(label);
    });

    token.addChild(container);
  }
}

/**
 * Highlight a Runebearer token and optionally draw a range ring from the Runesmith token on hover.
 */
export function highlightBearerOnCanvas(sourceToken, targetTokenId, rangeFeet = 30) {
  clearCanvasRangeHighlight();
  if (!canvas?.ready) return;

  if (targetTokenId) {
    const tok = canvas.tokens?.get(targetTokenId);
    if (tok) {
      try {
        const g = new PIXI.Graphics();
        g.name = "rcdRangeHighlight";
        g.eventMode = "none";
        g.lineStyle(3, 0x38bdf8, 0.9);
        g.beginFill(0x38bdf8, 0.12);
        g.drawRoundedRect(tok.x - 4, tok.y - 4, (tok.w || 100) + 8, (tok.h || 100) + 8, 10);
        g.endFill();

        if (sourceToken && rangeFeet > 0) {
          const pxPerFt = (Number(canvas.grid?.size) || 100) / (Number(canvas.scene?.grid?.distance) || 5);
          const radiusPx = rangeFeet * pxPerFt + (sourceToken.w || 100) * 0.5;
          g.lineStyle(1.8, 0xfbbf24, 0.55);
          g.drawCircle(sourceToken.center.x, sourceToken.center.y, radiusPx);
        }

        canvas.interface?.grid?.addChild(g);
        rangePreviewGraphics = g;
      } catch (_e) {
        // Ignore PIXI overlay errors during scene teardown
      }
    }
  }
}

export function clearCanvasRangeHighlight() {
  if (rangePreviewGraphics) {
    try {
      rangePreviewGraphics.parent?.removeChild(rangePreviewGraphics);
      rangePreviewGraphics.destroy();
    } catch (_e) {
      // Already destroyed
    }
    rangePreviewGraphics = null;
  }
}

export function registerCanvasBadgeHooks() {
  Hooks.on("canvasReady", () => refreshAllTokenRuneBadges());
  Hooks.on("refreshToken", () => {
    // Lightweight debounced badge sync
    if (registerCanvasBadgeHooks._timer) return;
    registerCanvasBadgeHooks._timer = setTimeout(() => {
      registerCanvasBadgeHooks._timer = null;
      refreshAllTokenRuneBadges();
    }, 120);
  });
  Hooks.on(`${MODULE_ID}.refreshBadges`, () => refreshAllTokenRuneBadges());
}
