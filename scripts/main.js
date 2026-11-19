import {
  MODULE_ID,
  applyDailyEtchPreset,
  applyRecommendedLoadout,
  applyRuneToTarget,
  attachDiacriticToActiveRune,
  dismissActiveRune,
  executeEngravingStrike,
  executeFortifyingKnock,
  getActorRuneState,
  getRankedMeleeStrikes,
  invokeActiveRunes,
  registerChatCardListeners,
  registerLifecycleHooks,
  resolveRunesmithActor,
  setupSocketListener,
  toggleRepertoireRune,
  transposeActiveRune
} from "./rune-engine.js?v=1.3.0b";
import { RUNES_DB, getRuneBySlug, getRunesmithLimits } from "./runes-db.js?v=1.3.0b";
import { refreshAllTokenRuneBadges, registerCanvasBadgeHooks } from "./canvas-badges.js?v=1.3.0b";
import {
  closeCommandDeck,
  dismissHudCompletely,
  registerUIHooks,
  renderCommandDeck,
  renderLauncherPill,
  restoreHudVisibility,
  toggleCommandDeck
} from "./ui-deck.js?v=1.3.0b";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing PF2e Runesmith Command Deck v1.3.0`);

  game.settings.register(MODULE_ID, "showLauncherPill", {
    name: "Show Runesmith HUD on Screen",
    hint: "Displays the Runesmith Command Deck HUD / launcher pill. Clicking × on the HUD turns this off completely so zero HUD elements remain on your screen (re-enable here or click 'Open Command Deck' on a Runesmith's Character Sheet).",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: (val) => {
      if (!val) {
        closeCommandDeck(false);
        delete ui.controls?.controls?.tokens?.tools?.["runesmith-command-deck"];
        document
          .querySelectorAll('[data-tool="runesmith-command-deck"], [aria-label="Toggle Runesmith Command Deck"]')
          .forEach((el) => el.closest("li")?.remove() || el.remove());
      }
      renderLauncherPill();
      try {
        ui.controls?.render?.({ reset: true });
      } catch (_e) {
        // Ignore early init control render
      }
    }
  });

  game.settings.register(MODULE_ID, "autoOpenOnSheetAction", {
    name: "Open Command Deck on Runesmith Sheet Actions",
    hint: "Automatically opens the Runesmith Command Deck when clicking Trace Rune, Invoke Rune, or Engraving Strike on a character sheet (ignored when HUD is dismissed via ×).",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "autoPickBestStrike", {
    name: "Engraving Strike: Auto-Roll Best Melee Weapon",
    hint: "If enabled, Engraving Strike immediately rolls your highest-attack, highest-damage held melee weapon without showing the weapon picker.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "allowAnyCharacter", {
    name: "Allow Command Deck for Any Character",
    hint: "If enabled, shows the Runesmith Command Deck launcher even for characters without the Runesmith class or archetype.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => renderLauncherPill()
  });

  registerUIHooks();
  registerChatCardListeners();
  registerCanvasBadgeHooks();
});

Hooks.once("ready", () => {
  setupSocketListener();
  registerLifecycleHooks();
  renderLauncherPill();
  refreshAllTokenRuneBadges();

  const api = {
    open: (opts) => restoreHudVisibility(opts),
    close: () => closeCommandDeck(true),
    dismissCompletely: () => dismissHudCompletely(),
    toggle: (force, opts) => toggleCommandDeck(force, opts),
    render: () => renderCommandDeck(),
    runes: RUNES_DB,
    getRuneBySlug,
    getRunesmithLimits,
    getRankedMeleeStrikes,
    resolveRunesmithActor,
    getActorRuneState,
    toggleRepertoireRune,
    applyRecommendedLoadout,
    applyRuneToTarget,
    attachDiacriticToActiveRune,
    invokeActiveRunes,
    dismissActiveRune,
    transposeActiveRune,
    executeEngravingStrike,
    executeFortifyingKnock,
    applyDailyEtchPreset
  };

  globalThis.RunesmithCommandDeck = api;
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = api;

  console.log(`${MODULE_ID} | Ready v1.3.0 (${RUNES_DB.length} Impossible Magic runes loaded).`);
});
