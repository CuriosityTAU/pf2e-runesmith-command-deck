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
} from "./rune-engine.js";
import { RUNES_DB, getRuneBySlug, getRunesmithLimits } from "./runes-db.js";
import { refreshAllTokenRuneBadges, registerCanvasBadgeHooks } from "./canvas-badges.js";
import { closeCommandDeck, registerUIHooks, renderCommandDeck, renderLauncherPill, toggleCommandDeck } from "./ui-deck.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing PF2e Runesmith Command Deck v1.1.0`);

  game.settings.register(MODULE_ID, "autoOpenOnSheetAction", {
    name: "Open Command Deck on Runesmith Sheet Actions",
    hint: "Automatically opens the Runesmith Command Deck when clicking Trace Rune, Invoke Rune, or Engraving Strike on a character sheet.",
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
    open: (opts) => toggleCommandDeck(true, opts),
    close: () => closeCommandDeck(),
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

  console.log(`${MODULE_ID} | Ready (${RUNES_DB.length} Impossible Magic runes loaded).`);
});
