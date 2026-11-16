const CONTAINER_NAME = "rcdRuneBadgesContainer";
let rangePreviewGraphics = null;

/**
 * Clean up any legacy PIXI letter badges from tokens.
 * Native PF2e effect icons (and modules like pf2e-effects-halo) handle token status icons cleanly.
 */
export function refreshAllTokenRuneBadges() {
  if (!canvas?.ready || !canvas.tokens?.placeables) return;
  for (const token of canvas.tokens.placeables) {
    const prev = token.children?.find((c) => c.name === CONTAINER_NAME);
    if (prev) {
      token.removeChild(prev);
      prev.destroy({ children: true });
    }
  }
}

/**
 * Highlight a Runebearer token and draw a subtle invocation range ring when hovering an active rune card in the deck.
 */
export function highlightBearerOnCanvas(sourceToken, targetTokenId, rangeFeet = 30) {
  clearCanvasRangeHighlight();
  if (!canvas?.ready || !targetTokenId) return;

  const tok = canvas.tokens?.get(targetTokenId);
  if (!tok) return;

  try {
    const g = new PIXI.Graphics();
    g.name = "rcdRangeHighlight";
    g.eventMode = "none";
    g.lineStyle(2.5, 0x38bdf8, 0.85);
    g.beginFill(0x38bdf8, 0.1);
    g.drawRoundedRect(tok.x - 3, tok.y - 3, (tok.w || 50) + 6, (tok.h || 50) + 6, 8);
    g.endFill();

    if (sourceToken && rangeFeet > 0) {
      const pxPerFt = (Number(canvas.grid?.size) || 100) / (Number(canvas.scene?.grid?.distance) || 5);
      const radiusPx = rangeFeet * pxPerFt + (sourceToken.w || 50) * 0.5;
      g.lineStyle(1.5, 0xfbbf24, 0.5);
      g.drawCircle(sourceToken.center.x, sourceToken.center.y, radiusPx);
    }

    canvas.interface?.grid?.addChild(g);
    rangePreviewGraphics = g;
  } catch (_e) {
    // Ignore PIXI overlay errors during scene teardown
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
}
