import {
  ELEMENTAL_TYPES,
  RUNES_DB,
  RUNIC_CRAFTER_FUNDAMENTALS,
  getRuneBySlug,
  getRunesmithLimits,
  isDiacriticCompatible
} from "./runes-db.js";
import {
  MODULE_ID,
  applyDailyEtchPreset,
  applyRecommendedLoadout,
  applyRuneToTarget,
  attachDiacriticToActiveRune,
  dismissActiveRune,
  escapeHtml,
  executeEngravingStrike,
  executeFortifyingKnock,
  getActorRuneState,
  getActorTokenOnCanvas,
  getCandidateRunesmithActors,
  getRankedMeleeStrikes,
  getRunesmithClassDC,
  invokeActiveRunes,
  isRunesmithActor,
  measureDistanceFeet,
  mutateActorRuneState,
  resolveRunesmithActor,
  saveDailyEtchPreset,
  toggleRepertoireRune,
  transposeActiveRune
} from "./rune-engine.js";
import { clearCanvasRangeHighlight, highlightBearerOnCanvas } from "./canvas-badges.js";

let deckElement = null;
let launcherElement = null;
let lastToggleTimestamp = 0;
let dragState = null;

const uiState = {
  isOpen: false,
  activeTab: "battle", // "battle" | "repertoire" | "daily" | "guide"
  selectedActorId: null,
  quickRuneSlug: null,
  quickTargetSelf: false,
  quickFreeSlot: false,
  quickEnergy: "fire",
  showStrikePicker: false,
  selectedInvokeIds: new Set(),
  repFilterLevel: "available", // "available" | "all" | "1" | "5" | "9" | "13" | "17"
  repFilterRole: "all",        // "all" | "base" | "diacritic" | "damage" | "buff" | "debuff" | "utility"
  repSearch: "",
  posLeft: 110,
  posTop: 76
};

/**
 * Debounced toggle to prevent Foundry v14 SceneControls double-fire (see BUG-261024-01).
 */
export function toggleCommandDeck(forceState = null, options = {}) {
  const now = Date.now();
  if (forceState === null && now - lastToggleTimestamp < 200) return;
  lastToggleTimestamp = now;

  if (options.actorId) uiState.selectedActorId = options.actorId;
  if (options.tab) uiState.activeTab = options.tab;

  const nextOpen = forceState !== null ? Boolean(forceState) : !uiState.isOpen;
  uiState.isOpen = nextOpen;

  if (uiState.isOpen) {
    renderCommandDeck();
  } else {
    closeCommandDeck();
  }
  renderLauncherPill();
}

export function closeCommandDeck() {
  uiState.isOpen = false;
  clearCanvasRangeHighlight();
  if (deckElement) {
    deckElement.remove();
    deckElement = null;
  }
  renderLauncherPill();
}

function shouldShowRunesmithUI() {
  if (game.user?.isGM) return true;
  if (game.settings?.get(MODULE_ID, "allowAnyCharacter")) return true;
  if (game.user?.character && isRunesmithActor(game.user.character)) return true;
  return (game.actors?.contents ?? []).some((a) => a.isOwner && isRunesmithActor(a));
}

export function renderLauncherPill() {
  if (!shouldShowRunesmithUI()) {
    if (launcherElement) {
      launcherElement.remove();
      launcherElement = null;
    }
    return;
  }

  if (uiState.isOpen) {
    if (launcherElement) {
      launcherElement.remove();
      launcherElement = null;
    }
    return;
  }

  const actor = resolveRunesmithActor(uiState.selectedActorId);
  const state = actor ? getActorRuneState(actor) : { activeRunes: [] };
  const activeCount = state.activeRunes.length;

  if (!launcherElement) {
    launcherElement = document.createElement("button");
    launcherElement.type = "button";
    launcherElement.id = "rcd-launcher-pill";
    launcherElement.className = "rcd-launcher-pill";
    launcherElement.addEventListener("click", (ev) => {
      ev.preventDefault();
      toggleCommandDeck(true);
    });
    document.body.appendChild(launcherElement);
  }

  launcherElement.innerHTML = `
    <span class="rcd-launcher-glyph">&#9768;</span>
    <span class="rcd-launcher-text">Runesmith Deck</span>
    ${activeCount > 0 ? `<span class="rcd-launcher-count">${activeCount}</span>` : ""}
  `;
}

export function renderCommandDeck() {
  if (!uiState.isOpen) return;

  const candidates = getCandidateRunesmithActors();
  const actor = resolveRunesmithActor(uiState.selectedActorId);
  if (actor) uiState.selectedActorId = actor.id;

  if (!deckElement) {
    deckElement = document.createElement("section");
    deckElement.id = "rcd-command-deck";
    deckElement.className = "rcd-deck-window";
    deckElement.style.left = `${uiState.posLeft}px`;
    deckElement.style.top = `${uiState.posTop}px`;
    bindDeckDelegatedEvents(deckElement);
    document.body.appendChild(deckElement);
  }

  if (!actor) {
    deckElement.innerHTML = `
      <header class="rcd-header" data-rcd-drag="1">
        <div class="rcd-brand"><span class="rcd-sigil">&#9768;</span> Runesmith Command Deck</div>
        <button type="button" class="rcd-icon-btn" data-action="close-deck" title="Close">&times;</button>
      </header>
      <div class="rcd-empty-state">
        <p>No owned character found. Create or take ownership of a Runesmith character (such as <strong>Runemaster</strong>) to begin.</p>
      </div>
    `;
    return;
  }

  const state = getActorRuneState(actor);
  const limits = getRunesmithLimits(actor);
  const classDC = getRunesmithClassDC(actor);

  // Prune stale selectedInvokeIds
  for (const id of Array.from(uiState.selectedInvokeIds)) {
    if (!state.activeRunes.some((r) => r.id === id)) uiState.selectedInvokeIds.delete(id);
  }

  // Ensure quickRuneSlug defaults to first learned base rune (or Atryl)
  const learnedBaseRunes = state.repertoire
    .map((s) => getRuneBySlug(s))
    .filter((r) => r && !r.isDiacritic);
  if (!uiState.quickRuneSlug || !getRuneBySlug(uiState.quickRuneSlug) || getRuneBySlug(uiState.quickRuneSlug)?.isDiacritic) {
    uiState.quickRuneSlug = learnedBaseRunes[0]?.slug ?? "atryl";
  }

  const regularEtchedCount = state.activeRunes.filter((r) => r.mode === "etched" && !r.freeSlot).length;
  const tracedCount = state.activeRunes.filter((r) => r.mode === "traced").length;

  // Target status bar
  const sourceToken = getActorTokenOnCanvas(actor);
  const userTarget = Array.from(game.user?.targets ?? [])[0] ?? null;
  const effectiveTargetToken = uiState.quickTargetSelf ? sourceToken : (userTarget ?? sourceToken);
  const distFeet = sourceToken && effectiveTargetToken ? measureDistanceFeet(sourceToken, effectiveTargetToken) : null;

  let rangePill = `<span class="rcd-range-pill rcd-range-ok">Self / Sheet</span>`;
  if (effectiveTargetToken && sourceToken && effectiveTargetToken.id !== sourceToken.id && distFeet !== null) {
    const cls = distFeet <= 10 ? "rcd-range-adj" : distFeet <= 30 ? "rcd-range-ok" : "rcd-range-far";
    const tag = distFeet <= 10 ? "Adjacent (1A)" : distFeet <= 30 ? "In 30ft (2A)" : "Out of 30ft";
    rangePill = `<span class="rcd-range-pill ${cls}">${distFeet} ft &bull; ${tag}</span>`;
  }

  const actorOptionsHtml = candidates
    .map((c) => `<option value="${c.id}" ${c.id === actor.id ? "selected" : ""}>${escapeHtml(c.name)} (Lv ${c.level ?? c.system?.details?.level?.value ?? 1})</option>`)
    .join("");

  deckElement.innerHTML = `
    <header class="rcd-header" data-rcd-drag="1">
      <div class="rcd-brand">
        <span class="rcd-sigil">&#9768;</span>
        <div>
          <div class="rcd-title">Runesmith Command Deck</div>
          <div class="rcd-subtitle">Pathfinder: Impossible Magic</div>
        </div>
      </div>
      <div class="rcd-header-controls">
        <select class="rcd-actor-select" data-action="switch-actor" title="Select Runesmith Character">
          ${actorOptionsHtml}
        </select>
        <button type="button" class="rcd-icon-btn" data-action="open-sheet" title="Open Character Sheet"><i class="fas fa-id-card"></i></button>
        <button type="button" class="rcd-icon-btn" data-action="close-deck" title="Minimize to Pill">&times;</button>
      </div>
    </header>

    <div class="rcd-telemetry-strip">
      <div class="rcd-stat-chip" title="Runesmith Class DC">
        <span class="rcd-stat-lbl">Class DC</span>
        <span class="rcd-stat-val">${classDC}</span>
      </div>
      <div class="rcd-stat-chip" title="Sustained Etched Runes">
        <span class="rcd-stat-lbl">Etched</span>
        <span class="rcd-stat-val">${regularEtchedCount} / ${limits.maxEtched}</span>
      </div>
      <div class="rcd-stat-chip" title="Active Traced Runes (fade at end of next turn)">
        <span class="rcd-stat-lbl">Traced</span>
        <span class="rcd-stat-val rcd-cyan">${tracedCount}</span>
      </div>
      <div class="rcd-stat-chip" title="Learned Runes in Runic Repertoire">
        <span class="rcd-stat-lbl">Repertoire</span>
        <span class="rcd-stat-val">${state.repertoire.length} / ${limits.maxRepertoire}</span>
      </div>
    </div>

    <nav class="rcd-tabs">
      <button type="button" class="rcd-tab ${uiState.activeTab === "battle" ? "active" : ""}" data-action="set-tab" data-tab="battle">
        <i class="fas fa-fire-alt"></i> Battle Deck
      </button>
      <button type="button" class="rcd-tab ${uiState.activeTab === "repertoire" ? "active" : ""}" data-action="set-tab" data-tab="repertoire">
        <i class="fas fa-book-open"></i> Repertoire (${state.repertoire.length}/${limits.maxRepertoire})
      </button>
      <button type="button" class="rcd-tab ${uiState.activeTab === "daily" ? "active" : ""}" data-action="set-tab" data-tab="daily">
        <i class="fas fa-hammer"></i> Daily &amp; Crafter
      </button>
      <button type="button" class="rcd-tab ${uiState.activeTab === "guide" ? "active" : ""}" data-action="set-tab" data-tab="guide">
        <i class="fas fa-scroll"></i> Feats &amp; Rules
      </button>
    </nav>

    <main class="rcd-body">
      ${uiState.activeTab === "battle" ? renderBattleTab(actor, state, limits, effectiveTargetToken, rangePill) : ""}
      ${uiState.activeTab === "repertoire" ? renderRepertoireTab(actor, state, limits, uiState.repSearch) : ""}
      ${uiState.activeTab === "daily" ? renderDailyTab(actor, state, limits) : ""}
      ${uiState.activeTab === "guide" ? renderGuideTab(actor, limits) : ""}
    </main>
  `;
}

function renderBattleTab(actor, state, limits, effectiveTargetToken, rangePill) {
  const learnedBase = state.repertoire.map((s) => getRuneBySlug(s)).filter((r) => r && !r.isDiacritic);
  const learnedDiacritics = state.repertoire.map((s) => getRuneBySlug(s)).filter((r) => r && r.isDiacritic);
  // Also allow GMs / testing to pick from all compatible diacritics if none learned yet at Lv 5+
  const availableDiacritics = learnedDiacritics.length > 0
    ? learnedDiacritics
    : RUNES_DB.filter((r) => r.isDiacritic && r.level <= limits.level);

  const selectedQuickRune = getRuneBySlug(uiState.quickRuneSlug);

  const repertoirePrompt =
    learnedBase.length === 0
      ? `<div class="rcd-callout">
          <div>
            <strong>${escapeHtml(actor.name)}'s Runic Repertoire is empty!</strong>
            <p>Load the recommended starter runes (Atryl, Esvadir, Holtrik, Ranshu) in 1 click or customize in the Repertoire tab.</p>
          </div>
          <div class="rcd-callout-actions">
            <button type="button" class="rcd-btn rcd-btn-gold" data-action="load-recommended"><i class="fas fa-bolt"></i> Load Recommended Runes</button>
            <button type="button" class="rcd-btn" data-action="set-tab" data-tab="repertoire">Browse All 44 Runes</button>
          </div>
        </div>`
      : "";

  const quickRuneChips = learnedBase
    .map((r) => {
      const isSel = r.slug === uiState.quickRuneSlug;
      return `
        <button type="button" class="rcd-rune-chip ${isSel ? "selected" : ""}" style="--rcd-accent:${r.color}" data-action="select-quick-rune" data-slug="${r.slug}" title="${escapeHtml(r.name)} — ${escapeHtml(r.usageText)}">
          <img src="${escapeHtml(r.icon)}" alt="" />
          <span>${escapeHtml(r.shortName)}</span>
        </button>
      `;
    })
    .join("");

  const energyPickerHtml = selectedQuickRune?.needsEnergyChoice
    ? `<select class="rcd-mini-select" data-action="set-quick-energy" title="Choose Insulation Energy">
        ${["fire", "cold", "electricity"].map((e) => `<option value="${e}" ${uiState.quickEnergy === e ? "selected" : ""}>${e}</option>`).join("")}
      </select>`
    : "";

  const freeSlotHtml =
    limits.freeEtchedBonus > 0
      ? `<label class="rcd-inline-toggle" title="Etch using free feat slot (Runic Tattoo / Vital Ink / Living Lexicon)">
          <input type="checkbox" data-action="toggle-free-slot" ${uiState.quickFreeSlot ? "checked" : ""} /> Free Slot
        </label>`
      : "";

  const targetName = effectiveTargetToken?.name ?? actor.name;

  const quickPreviewHtml = selectedQuickRune
    ? `<div class="rcd-quick-preview" style="--rcd-accent:${selectedQuickRune.color}">
        <div class="rcd-qp-top">
          <strong>${escapeHtml(selectedQuickRune.name)}</strong>
          <span class="rcd-qp-usage">${escapeHtml(selectedQuickRune.usageText)}</span>
        </div>
        <div class="rcd-qp-desc"><strong>Passive:</strong> ${escapeHtml(selectedQuickRune.passiveSummary(limits.level, uiState.quickEnergy))}</div>
        <div class="rcd-qp-desc"><strong>Invoke:</strong> ${escapeHtml(selectedQuickRune.invocation.summary(limits.level, uiState.quickEnergy))}</div>
      </div>`
    : "";

  const etchedRunes = state.activeRunes.filter((r) => r.mode === "etched");
  const tracedRunes = state.activeRunes.filter((r) => r.mode === "traced");
  const selCount = uiState.selectedInvokeIds.size;

  return `
    ${repertoirePrompt}

    <div class="rcd-panel-box">
      <div class="rcd-target-bar">
        <div class="rcd-target-info">
          <span class="rcd-lbl">Target:</span>
          <strong>${escapeHtml(targetName)}</strong>
          ${rangePill}
        </div>
        <div class="rcd-target-toggles">
          <label class="rcd-inline-toggle" title="Force apply onto yourself / your own gear even if targeting an enemy">
            <input type="checkbox" data-action="toggle-target-self" ${uiState.quickTargetSelf ? "checked" : ""} /> Self / Own Gear
          </label>
          ${freeSlotHtml}
          ${energyPickerHtml}
        </div>
      </div>

      ${learnedBase.length > 0 ? `<div class="rcd-chip-strip">${quickRuneChips}</div>` : ""}
      ${quickPreviewHtml}

      <div class="rcd-action-grid">
        <button type="button" class="rcd-btn rcd-btn-gold" data-action="apply-quick" data-mode="etched" title="Etch Rune (10m Exploration or Daily Prep; sustains up to ${limits.maxEtched} runes)">
          <i class="fas fa-pen-nib"></i> Etch Rune
        </button>
        <button type="button" class="rcd-btn rcd-btn-cyan" data-action="apply-quick" data-mode="traced" data-cost="1" ${selectedQuickRune?.etchOnly ? "disabled" : ""} title="1-Action Trace Rune onto adjacent target (lasts until end of next turn)">
          <span class="rcd-act-glyph">1A</span> Trace (Adj)
        </button>
        <button type="button" class="rcd-btn rcd-btn-cyan" data-action="apply-quick" data-mode="traced" data-cost="2" ${selectedQuickRune?.etchOnly ? "disabled" : ""} title="2-Action Trace Rune onto target within 30 feet">
          <span class="rcd-act-glyph">2A</span> Trace (30 ft)
        </button>
        ${
          limits.features.hasEngravingStrike
            ? `<button type="button" class="rcd-btn rcd-btn-crimson ${uiState.showStrikePicker ? "is-open" : ""}" data-action="engraving-strike" ${selectedQuickRune?.etchOnly ? "disabled" : ""} title="Engraving Strike (1A Flourish): Choose melee weapon (or auto-use ★ Best) &amp; Trace ${escapeHtml(selectedQuickRune?.shortName ?? "Rune")} on hit!">
                <i class="fas fa-gavel"></i> Engraving Strike
              </button>`
            : ""
        }
        ${
          limits.features.hasFortifyingKnock
            ? `<button type="button" class="rcd-btn rcd-btn-steel" data-action="fortifying-knock" title="Fortifying Knock (1A Flourish): Raise a Shield + Trace shield rune!">
                <i class="fas fa-shield-alt"></i> Fortifying Knock
              </button>`
            : ""
        }
      </div>
      ${uiState.showStrikePicker && limits.features.hasEngravingStrike ? renderStrikePickerHtml(actor, selectedQuickRune) : ""}
    </div>

    <div class="rcd-invoke-bar">
      <div class="rcd-invoke-hdr">
        <span>Active Runes (${state.activeRunes.length})</span>
        <span class="rcd-hint">Check up to 2 runes or click &#9889; on any rune</span>
      </div>
      <button type="button" class="rcd-btn rcd-btn-invoke" data-action="invoke-selected" ${selCount === 0 ? "disabled" : ""}>
        &#9889; Invoke Selected (${selCount}/2) [1A]
      </button>
    </div>

    <div class="rcd-lanes">
      <div class="rcd-lane">
        <div class="rcd-lane-title">
          <span>&#9670; Etched Runes (${etchedRunes.filter((e) => !e.freeSlot).length}/${limits.maxEtched})</span>
          ${etchedRunes.length > 0 ? `<button type="button" class="rcd-link-btn" data-action="save-daily-preset" title="Save current Etchings as Daily Prep Preset">Save as Daily</button>` : ""}
        </div>
        ${
          etchedRunes.length > 0
            ? etchedRunes.map((e) => renderActiveRuneCard(e, limits.level, availableDiacritics)).join("")
            : `<div class="rcd-lane-empty">No Etched runes active. Etch up to ${limits.maxEtched} runes for persistent passive bonuses &amp; ready invocations.</div>`
        }
      </div>

      <div class="rcd-lane">
        <div class="rcd-lane-title">
          <span>&#10022; Traced Runes (${tracedRunes.length})</span>
          ${tracedRunes.length > 0 ? `<button type="button" class="rcd-link-btn" data-action="clear-all-traced">Clear Traced</button>` : ""}
        </div>
        ${
          tracedRunes.length > 0
            ? tracedRunes.map((e) => renderActiveRuneCard(e, limits.level, availableDiacritics)).join("")
            : `<div class="rcd-lane-empty">No Traced runes active. Use Trace Rune or Engraving Strike in combat!</div>`
        }
      </div>
    </div>
  `;
}

function renderStrikePickerHtml(actor, selectedQuickRune) {
  const ranked = getRankedMeleeStrikes(actor);
  const autoBest = Boolean(game.settings?.get(MODULE_ID, "autoPickBestStrike"));

  if (!ranked.length) {
    return `<div class="rcd-strike-picker"><div class="rcd-lane-empty">No melee strikes available on ${escapeHtml(actor.name)}.</div></div>`;
  }

  const rows = ranked
    .map((s) => {
      const bestBadge = s.isRecommended ? `<span class="rcd-best-badge">&#9733; Best</span>` : "";
      const stowedTag = !s.ready ? `<span class="rcd-stowed-tag">Not Held</span>` : "";
      const mapBtns = s.variants
        .map(
          (v) =>
            `<button type="button" class="rcd-map-btn ${v.index === 0 && s.isRecommended ? "primary" : ""}" data-action="roll-engraving-strike" data-strike-idx="${s.actionIndex}" data-variant-idx="${v.index}">
              ${escapeHtml(v.shortLabel)}
            </button>`
        )
        .join("");

      return `
        <div class="rcd-strike-row ${s.isRecommended ? "recommended" : ""} ${!s.ready ? "stowed" : ""}">
          <img src="${escapeHtml(s.img)}" alt="" />
          <div class="rcd-strike-meta">
            <div class="rcd-strike-title">
              <strong>${escapeHtml(s.label)}</strong>
              ${bestBadge}
              ${stowedTag}
            </div>
            <div class="rcd-strike-dmg">${escapeHtml(s.damageSummary)}</div>
          </div>
          <div class="rcd-strike-variants">
            ${mapBtns}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="rcd-strike-picker">
      <div class="rcd-sp-hdr">
        <span><strong>Engraving Strike</strong> &rarr; Trace <strong>${escapeHtml(selectedQuickRune?.shortName ?? "Rune")}</strong> on Hit</span>
        <div class="rcd-sp-hdr-right">
          <label class="rcd-inline-toggle" title="Skip this picker and always roll the ★ Best melee weapon automatically">
            <input type="checkbox" data-action="toggle-auto-best-strike" ${autoBest ? "checked" : ""} /> Auto-use &#9733; Best
          </label>
          <button type="button" class="rcd-mini-x" data-action="close-strike-picker" title="Close">&times;</button>
        </div>
      </div>
      <div class="rcd-strike-list">${rows}</div>
    </div>
  `;
}

function renderActiveRuneCard(entry, level, availableDiacritics) {
  const rune = getRuneBySlug(entry.runeSlug);
  if (!rune) return "";
  const diacritic = entry.diacriticSlug ? getRuneBySlug(entry.diacriticSlug) : null;
  const checked = uiState.selectedInvokeIds.has(entry.id);
  const titleText = diacritic ? `${diacritic.prefix}${rune.shortName}` : rune.shortName;
  const subTxt = entry.subTargetName ? ` &bull; <em>${escapeHtml(entry.subTargetName)}</em>` : "";

  const expiryBadge =
    entry.mode === "traced"
      ? `<span class="rcd-expiry-pill ${entry.turnsRemaining <= 1 ? "urgent" : ""}" title="Auto-expires at end of Runesmith's next turn">&#9203; ${
          entry.turnsRemaining >= 2 ? "End of Next Turn" : "End of This Turn"
        }</span>`
      : entry.freeSlot
        ? `<span class="rcd-expiry-pill free">Free Etch</span>`
        : `<span class="rcd-expiry-pill etched">Sustained</span>`;

  const compatibleDiacritics = availableDiacritics.filter((d) => isDiacriticCompatible(d, rune));
  let diacriticControlHtml = "";
  if (diacritic) {
    const elemSelect =
      diacritic.slug === "ti-diacritic"
        ? `<select class="rcd-diacritic-elem" data-action="set-diacritic-elem" data-entry-id="${entry.id}">
            ${ELEMENTAL_TYPES.map((el) => `<option value="${el}" ${(entry.diacriticElement || "fire") === el ? "selected" : ""}>${el}</option>`).join("")}
          </select>`
        : "";
    diacriticControlHtml = `
      <div class="rcd-diacritic-bar">
        <span class="rcd-diacritic-tag">${escapeHtml(diacritic.name)}</span>
        ${elemSelect}
        <button type="button" class="rcd-mini-x" data-action="remove-diacritic" data-entry-id="${entry.id}" title="Remove Diacritic">&times;</button>
      </div>
    `;
  } else if (compatibleDiacritics.length > 0) {
    diacriticControlHtml = `
      <div class="rcd-diacritic-bar">
        <select class="rcd-diacritic-select" data-action="attach-diacritic" data-entry-id="${entry.id}">
          <option value="">+ Attach Diacritic...</option>
          ${compatibleDiacritics.map((d) => `<option value="${d.slug}">${escapeHtml(d.name)}</option>`).join("")}
        </select>
      </div>
    `;
  }

  return `
    <div class="rcd-active-card ${checked ? "is-checked" : ""}" style="--rcd-accent:${rune.color}" data-entry-id="${entry.id}" data-bearer-token="${entry.targetTokenId || ""}">
      <div class="rcd-ac-top">
        <label class="rcd-ac-check" title="Select for multi-rune Invoke">
          <input type="checkbox" data-action="toggle-invoke-select" data-entry-id="${entry.id}" ${checked ? "checked" : ""} />
        </label>
        <img class="rcd-ac-rune-img" src="${escapeHtml(rune.icon)}" alt="" />
        <div class="rcd-ac-info">
          <div class="rcd-ac-name-row">
            <strong>${escapeHtml(titleText)}</strong>
            <span class="rcd-ac-subname">${escapeHtml(rune.subtitle)}</span>
            ${expiryBadge}
          </div>
          <div class="rcd-ac-bearer">
            <img src="${escapeHtml(entry.targetImg)}" alt="" />
            <span>on <strong>${escapeHtml(entry.targetName)}</strong>${subTxt}</span>
          </div>
        </div>
        <div class="rcd-ac-btns">
          <button type="button" class="rcd-icon-action rcd-bolt" data-action="invoke-single" data-entry-id="${entry.id}" title="Invoke ${escapeHtml(titleText)} immediately">&#9889;</button>
          <button type="button" class="rcd-icon-action" data-action="transpose-rune" data-entry-id="${entry.id}" title="Transpose rune onto currently targeted token">&#8644;</button>
          <button type="button" class="rcd-icon-action rcd-danger" data-action="dismiss-rune" data-entry-id="${entry.id}" title="Dismiss / Erase Rune">&times;</button>
        </div>
      </div>
      <div class="rcd-ac-summary">
        <span><strong>Invoke:</strong> ${escapeHtml(rune.invocation.summary(level, entry.energyChoice || "fire"))}</span>
      </div>
      ${diacriticControlHtml}
    </div>
  `;
}

function renderRepertoireListItemsHtml(state, limits, searchVal) {
  const learnedSet = new Set(state.repertoire);
  const query = String(searchVal || "").trim().toLowerCase();

  const filtered = RUNES_DB.filter((r) => {
    if (uiState.repFilterLevel === "available" && r.level > limits.level) return false;
    if (["1", "5", "9", "13", "17"].includes(uiState.repFilterLevel) && r.level !== Number(uiState.repFilterLevel)) {
      return false;
    }
    if (uiState.repFilterRole === "base" && r.isDiacritic) return false;
    if (uiState.repFilterRole === "diacritic" && !r.isDiacritic) return false;
    if (["damage", "buff", "debuff", "utility"].includes(uiState.repFilterRole) && r.role !== uiState.repFilterRole) {
      return false;
    }
    if (query) {
      const hay = `${r.name} ${r.usageText} ${r.traits.join(" ")} ${r.passiveSummary(limits.level)} ${r.invocation.summary(limits.level)}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  }).sort((a, b) => {
    const aL = learnedSet.has(a.slug) ? 0 : 1;
    const bL = learnedSet.has(b.slug) ? 0 : 1;
    if (aL !== bL) return aL - bL;
    return a.level - b.level || a.name.localeCompare(b.name);
  });

  return filtered
    .map((r) => {
      const isLearned = learnedSet.has(r.slug);
      const locked = r.level > limits.level;
      return `
        <div class="rcd-rep-card ${isLearned ? "learned" : ""} ${locked ? "locked" : ""}" style="--rcd-accent:${r.color}">
          <div class="rcd-rc-hdr">
            <img src="${escapeHtml(r.icon)}" alt="" />
            <div class="rcd-rc-titles">
              <div class="rcd-rc-name">
                <span>${escapeHtml(r.name)}</span>
                <span class="rcd-lvl-tag">Lv ${r.level}</span>
                ${r.isDiacritic ? `<span class="rcd-dia-pill">Diacritic</span>` : ""}
              </div>
              <div class="rcd-rc-usage">${escapeHtml(r.usageText)}</div>
            </div>
            <div class="rcd-rc-actions">
              ${
                isLearned && !r.isDiacritic
                  ? `<button type="button" class="rcd-mini-btn" data-action="quick-use-from-rep" data-slug="${r.slug}" data-mode="etched" data-cost="0" title="Etch Now">Etch</button>
                     <button type="button" class="rcd-mini-btn" data-action="quick-use-from-rep" data-slug="${r.slug}" data-mode="traced" data-cost="1" ${r.etchOnly ? "disabled" : ""} title="1A Trace (Adjacent)">1A</button>
                     <button type="button" class="rcd-mini-btn" data-action="quick-use-from-rep" data-slug="${r.slug}" data-mode="traced" data-cost="2" ${r.etchOnly ? "disabled" : ""} title="2A Trace (30 ft)">2A</button>`
                  : ""
              }
              <button type="button" class="rcd-learn-btn ${isLearned ? "active" : ""}" data-action="toggle-learn" data-slug="${r.slug}" ${locked && !isLearned ? "disabled" : ""}>
                ${isLearned ? "&#10003; Learned" : locked ? `Lv ${r.level}` : "+ Learn"}
              </button>
            </div>
          </div>
          <div class="rcd-trait-row">
            ${r.traits.map((t) => `<span class="rcd-trait">${escapeHtml(t)}</span>`).join("")}
          </div>
          <div class="rcd-rc-body">
            <div><strong>Passive:</strong> ${escapeHtml(r.passiveSummary(limits.level))}</div>
            <div><strong>Invocation:</strong> ${escapeHtml(r.invocation.summary(limits.level))}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRepertoireTab(_actor, state, limits, searchVal) {
  return `
    <div class="rcd-rep-toolbar">
      <div class="rcd-rep-top-row">
        <input type="text" id="rcd-rep-search-input" class="rcd-search-input" placeholder="Search runes (e.g. fire, shield, bleed, teleport)..." value="${escapeHtml(searchVal)}" />
        <button type="button" class="rcd-btn rcd-btn-gold" data-action="load-recommended" title="Auto-fill recommended melee/shield Runesmith loadout">
          <i class="fas fa-magic"></i> Starter Loadout
        </button>
      </div>
      <div class="rcd-filter-row">
        <select class="rcd-mini-select" data-action="set-rep-level">
          <option value="available" ${uiState.repFilterLevel === "available" ? "selected" : ""}>Available (&le; Lv ${limits.level})</option>
          <option value="all" ${uiState.repFilterLevel === "all" ? "selected" : ""}>All Levels (Lv 1–17)</option>
          <option value="1" ${uiState.repFilterLevel === "1" ? "selected" : ""}>Level 1 (16 Base)</option>
          <option value="5" ${uiState.repFilterLevel === "5" ? "selected" : ""}>Level 5 (8 Diacritics)</option>
          <option value="9" ${uiState.repFilterLevel === "9" ? "selected" : ""}>Level 9 (12 Base)</option>
          <option value="13" ${uiState.repFilterLevel === "13" ? "selected" : ""}>Level 13 (4 Diacritics)</option>
          <option value="17" ${uiState.repFilterLevel === "17" ? "selected" : ""}>Level 17 (4 Capstone)</option>
        </select>
        <select class="rcd-mini-select" data-action="set-rep-role">
          <option value="all" ${uiState.repFilterRole === "all" ? "selected" : ""}>All Roles</option>
          <option value="base" ${uiState.repFilterRole === "base" ? "selected" : ""}>Base Runes Only</option>
          <option value="diacritic" ${uiState.repFilterRole === "diacritic" ? "selected" : ""}>Diacritics Only</option>
          <option value="damage" ${uiState.repFilterRole === "damage" ? "selected" : ""}>Damage</option>
          <option value="buff" ${uiState.repFilterRole === "buff" ? "selected" : ""}>Buff / Defense</option>
          <option value="debuff" ${uiState.repFilterRole === "debuff" ? "selected" : ""}>Debuff / Control</option>
          <option value="utility" ${uiState.repFilterRole === "utility" ? "selected" : ""}>Utility / Mobility</option>
        </select>
      </div>
    </div>

    <div class="rcd-rep-list">
      ${renderRepertoireListItemsHtml(state, limits, searchVal)}
    </div>
  `;
}

function renderDailyTab(actor, state, limits) {
  const presetRows = state.dailyPreset.length
    ? state.dailyPreset
        .map((p) => {
          const r = getRuneBySlug(p.runeSlug);
          return `<div class="rcd-preset-item">
            <img src="${escapeHtml(r?.icon || "")}" alt="" />
            <span><strong>${escapeHtml(r?.name ?? p.runeSlug)}</strong> &rarr; ${escapeHtml(p.targetName || actor.name)}</span>
          </div>`;
        })
        .join("")
    : `<div class="rcd-lane-empty">No Morning Etchings saved yet. Etch your preferred daily runes on the Battle Deck, then click <strong>Save Current Etchings</strong>!</div>`;

  // Runic Crafter formulas
  const maxPropSlots = limits.level >= 4 ? Math.floor((limits.level - 2) / 2) : 0;
  const propInputs = [];
  for (let i = 0; i < maxPropSlots; i++) {
    const unlockLvl = 4 + i * 2;
    const savedVal = state.propertyFormulas[i] || "";
    propInputs.push(`
      <div class="rcd-prop-row">
        <span class="rcd-lvl-tag">Lv ${unlockLvl}</span>
        <input type="text" class="rcd-prop-input" data-prop-idx="${i}" placeholder="Record chosen weapon/armor property rune formula..." value="${escapeHtml(savedVal)}" />
      </div>
    `);
  }

  return `
    <div class="rcd-panel-box">
      <div class="rcd-sec-hdr">
        <div>
          <strong>&#9728; Morning Daily Etchings</strong>
          <p class="rcd-muted">Save and re-apply up to ${limits.maxEtched} daily Etched runes in 1 click after resting.</p>
        </div>
        <div class="rcd-btn-group">
          <button type="button" class="rcd-btn" data-action="save-daily-preset"><i class="fas fa-save"></i> Save Current</button>
          <button type="button" class="rcd-btn rcd-btn-gold" data-action="apply-daily-preset" ${state.dailyPreset.length === 0 ? "disabled" : ""}><i class="fas fa-sun"></i> Apply Daily Etchings</button>
        </div>
      </div>
      <div class="rcd-preset-list">${presetRows}</div>
    </div>

    <div class="rcd-panel-box">
      <div class="rcd-sec-hdr">
        <div>
          <strong>&#9874; Runic Crafter — Memorized Formulas</strong>
          <p class="rcd-muted">Drawn from memory (no formula book required). Auto-unlocks fundamental runes as your level matches theirs.</p>
        </div>
      </div>
      <div class="rcd-crafter-grid">
        ${RUNIC_CRAFTER_FUNDAMENTALS.map((f) => {
          const unlocked = limits.level >= f.level;
          return `
            <div class="rcd-formula-chip ${unlocked ? "unlocked" : "locked"}">
              <span class="rcd-lvl-tag">Lv ${f.level}</span>
              <div>
                <div class="rcd-f-name">${unlocked ? "&#10003; " : "&#128274; "}${escapeHtml(f.name)}</div>
                <div class="rcd-f-cat">${escapeHtml(f.category)}</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <div class="rcd-sub-hdr">Free Property Rune Formulas (${maxPropSlots} unlocked at Lv ${limits.level})</div>
      ${
        maxPropSlots > 0
          ? `<div class="rcd-prop-list">${propInputs.join("")}<button type="button" class="rcd-btn rcd-btn-cyan" data-action="save-prop-formulas"><i class="fas fa-check"></i> Save Property Formulas</button></div>`
          : `<div class="rcd-lane-empty">Unlocks at Level 4 (and every 2 levels thereafter: Lv 4, 6, 8, 10...).</div>`
      }
    </div>
  `;
}

function renderGuideTab(actor, limits) {
  const detectedFeats = (actor.itemTypes?.feat ?? []).filter(
    (f) => f.system?.traits?.value?.includes("runesmith") || ["runic-repertoire", "runes", "runic-crafter", "shield-block"].includes(f.slug)
  );

  return `
    <div class="rcd-panel-box">
      <strong>Detected Runesmith Features &amp; Feats on ${escapeHtml(actor.name)}</strong>
      <div class="rcd-feat-pills">
        ${detectedFeats.map((f) => `<span class="rcd-feat-pill">${escapeHtml(f.name)}</span>`).join("") || `<span class="rcd-muted">None detected</span>`}
      </div>
    </div>

    <div class="rcd-panel-box rcd-guide-rules">
      <h4>Quick Tactical Reference (Pathfinder: Impossible Magic)</h4>
      <ul>
        <li><strong>Etching Runes (Exploration 10m / Daily Prep):</strong> Requires artisan's toolkit. Sustain up to <strong>${limits.maxEtched}</strong> Etched runes indefinitely. Etching past your cap causes your oldest Etched rune to fade.</li>
        <li><strong>Trace Rune (1A or 2A):</strong> Spend <strong>1 Action</strong> to trace onto an adjacent target, or <strong>2 Actions</strong> to trace in the air onto a target within <strong>30 feet</strong>. Fades at the <strong>end of your next turn</strong>.</li>
        <li><strong>Engraving Strike (1A Flourish):</strong> Make a melee weapon Strike; on a Success or Critical Success, automatically Trace a Rune onto the struck target!</li>
        <li><strong>Invoke Rune (1A):</strong> Utter the names of up to <strong>2 active runes within ${limits.features.hasDistantInvocation ? 60 : 30} feet</strong>. Each blazes with its Invocation power and then fades. Duplicate copies of the same rune affect a creature only once.</li>
        <li><strong>Scaling &amp; Saves:</strong> All applied runes scale automatically to your character level (<strong>Lv ${limits.level}</strong>, counteract rank <strong>${Math.ceil(limits.level / 2)}</strong>) and use your Runesmith Class DC.</li>
      </ul>
    </div>
  `;
}

// ===========================================================================
// EVENT HANDLING & DRAGGING
// ===========================================================================

function bindDeckDelegatedEvents(root) {
  // Header drag support using DOM clientX/clientY
  root.addEventListener("pointerdown", (ev) => {
    const dragHdr = ev.target.closest("[data-rcd-drag]");
    if (!dragHdr || ev.target.closest("button, select, input")) return;
    const rect = root.getBoundingClientRect();
    dragState = {
      offsetX: ev.clientX - rect.left,
      offsetY: ev.clientY - rect.top
    };
    const onMove = (me) => {
      if (!dragState || !deckElement) return;
      uiState.posLeft = Math.max(8, Math.min(window.innerWidth - 120, me.clientX - dragState.offsetX));
      uiState.posTop = Math.max(8, Math.min(window.innerHeight - 80, me.clientY - dragState.offsetY));
      deckElement.style.left = `${uiState.posLeft}px`;
      deckElement.style.top = `${uiState.posTop}px`;
    };
    const onUp = () => {
      dragState = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  // Hover highlight on active rune cards
  root.addEventListener("pointerover", (ev) => {
    const card = ev.target.closest(".rcd-active-card");
    if (!card) return;
    const tokId = card.dataset.bearerToken;
    const actor = resolveRunesmithActor(uiState.selectedActorId);
    const limits = actor ? getRunesmithLimits(actor) : { features: {} };
    highlightBearerOnCanvas(getActorTokenOnCanvas(actor), tokId, limits.features?.hasDistantInvocation ? 60 : 30);
  });

  root.addEventListener("pointerout", (ev) => {
    if (ev.target.closest(".rcd-active-card") && !ev.relatedTarget?.closest?.(".rcd-active-card")) {
      clearCanvasRangeHighlight();
    }
  });

  // Input & select changes (update list container directly so search input focus/IME is untouched)
  root.addEventListener("input", (ev) => {
    if (ev.target.id === "rcd-rep-search-input") {
      uiState.repSearch = ev.target.value;
      const listEl = root.querySelector(".rcd-rep-list");
      const actor = resolveRunesmithActor(uiState.selectedActorId);
      if (listEl && actor) {
        listEl.innerHTML = renderRepertoireListItemsHtml(
          getActorRuneState(actor),
          getRunesmithLimits(actor),
          uiState.repSearch
        );
      }
    }
  });

  root.addEventListener("change", async (ev) => {
    const el = ev.target;
    const action = el.dataset.action;
    const actor = resolveRunesmithActor(uiState.selectedActorId);

    if (action === "switch-actor") {
      uiState.selectedActorId = el.value;
      uiState.selectedInvokeIds.clear();
      renderCommandDeck();
    } else if (action === "toggle-target-self") {
      uiState.quickTargetSelf = el.checked;
      renderCommandDeck();
    } else if (action === "toggle-free-slot") {
      uiState.quickFreeSlot = el.checked;
    } else if (action === "toggle-auto-best-strike") {
      await game.settings?.set(MODULE_ID, "autoPickBestStrike", Boolean(el.checked));
      renderCommandDeck();
    } else if (action === "set-quick-energy") {
      uiState.quickEnergy = el.value;
      renderCommandDeck();
    } else if (action === "set-rep-level") {
      uiState.repFilterLevel = el.value;
      renderCommandDeck();
    } else if (action === "set-rep-role") {
      uiState.repFilterRole = el.value;
      renderCommandDeck();
    } else if (action === "toggle-invoke-select") {
      const id = el.dataset.entryId;
      if (el.checked) {
        if (uiState.selectedInvokeIds.size >= 2) {
          el.checked = false;
          ui.notifications?.warn("Invoke Rune can invoke at most 2 runes in a single action!");
          return;
        }
        uiState.selectedInvokeIds.add(id);
      } else {
        uiState.selectedInvokeIds.delete(id);
      }
      renderCommandDeck();
    } else if (action === "attach-diacritic" && actor) {
      const entryId = el.dataset.entryId;
      if (el.value) {
        await attachDiacriticToActiveRune(actor, entryId, el.value, "fire");
        renderCommandDeck();
      }
    } else if (action === "set-diacritic-elem" && actor) {
      const entryId = el.dataset.entryId;
      await attachDiacriticToActiveRune(actor, entryId, "ti-diacritic", el.value);
      renderCommandDeck();
    }
  });

  // Button clicks
  root.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn || btn.tagName === "SELECT" || btn.tagName === "INPUT") return;
    ev.preventDefault();

    const action = btn.dataset.action;
    const actor = resolveRunesmithActor(uiState.selectedActorId);

    switch (action) {
      case "close-deck":
        closeCommandDeck();
        break;
      case "open-sheet":
        actor?.sheet?.render(true);
        break;
      case "set-tab":
        uiState.activeTab = btn.dataset.tab;
        renderCommandDeck();
        break;
      case "select-quick-rune":
        uiState.quickRuneSlug = btn.dataset.slug;
        renderCommandDeck();
        break;
      case "load-recommended":
        if (actor) {
          await applyRecommendedLoadout(actor);
          renderCommandDeck();
        }
        break;
      case "toggle-learn":
        if (actor) {
          await toggleRepertoireRune(actor, btn.dataset.slug);
          renderCommandDeck();
        }
        break;
      case "quick-use-from-rep":
        if (actor) {
          uiState.quickRuneSlug = btn.dataset.slug;
          uiState.activeTab = "battle";
          const sourceTok = getActorTokenOnCanvas(actor);
          const targetTok = uiState.quickTargetSelf ? sourceTok : (Array.from(game.user?.targets ?? [])[0] ?? sourceTok);
          await applyRuneToTarget(actor, {
            runeSlug: btn.dataset.slug,
            mode: btn.dataset.mode,
            actionCost: btn.dataset.mode === "traced" ? Number(btn.dataset.cost || 1) : 0,
            targetToken: targetTok,
            energyChoice: uiState.quickEnergy
          });
          renderCommandDeck();
        }
        break;
      case "apply-quick":
        if (actor && uiState.quickRuneSlug) {
          const sourceTok = getActorTokenOnCanvas(actor);
          const targetTok = uiState.quickTargetSelf ? sourceTok : (Array.from(game.user?.targets ?? [])[0] ?? sourceTok);
          await applyRuneToTarget(actor, {
            runeSlug: uiState.quickRuneSlug,
            mode: btn.dataset.mode,
            actionCost: Number(btn.dataset.cost || 0),
            targetToken: targetTok,
            freeSlot: btn.dataset.mode === "etched" && uiState.quickFreeSlot,
            energyChoice: uiState.quickEnergy
          });
          renderCommandDeck();
        }
        break;
      case "engraving-strike":
        if (actor && uiState.quickRuneSlug) {
          const ranked = getRankedMeleeStrikes(actor);
          const autoBest = Boolean(game.settings?.get(MODULE_ID, "autoPickBestStrike"));
          if (autoBest || ranked.length <= 1) {
            uiState.showStrikePicker = false;
            await executeEngravingStrike(actor, {
              actionIndex: ranked[0]?.actionIndex ?? null,
              variantIndex: 0,
              runeSlug: uiState.quickRuneSlug
            });
          } else {
            uiState.showStrikePicker = !uiState.showStrikePicker;
          }
          renderCommandDeck();
        }
        break;
      case "roll-engraving-strike":
        if (actor && uiState.quickRuneSlug) {
          uiState.showStrikePicker = false;
          await executeEngravingStrike(actor, {
            actionIndex: Number(btn.dataset.strikeIdx),
            variantIndex: Number(btn.dataset.variantIdx || 0),
            runeSlug: uiState.quickRuneSlug
          });
          renderCommandDeck();
        }
        break;
      case "close-strike-picker":
        uiState.showStrikePicker = false;
        renderCommandDeck();
        break;
      case "fortifying-knock":
        if (actor) {
          const shieldSlug = ["holtrik", "oljinex", "yudici"].includes(uiState.quickRuneSlug)
            ? uiState.quickRuneSlug
            : "holtrik";
          await executeFortifyingKnock(actor, { runeSlug: shieldSlug });
          renderCommandDeck();
        }
        break;
      case "invoke-single":
        if (actor) {
          clearCanvasRangeHighlight();
          await invokeActiveRunes(actor, [btn.dataset.entryId], { maxAllowed: 1 });
          uiState.selectedInvokeIds.delete(btn.dataset.entryId);
          renderCommandDeck();
        }
        break;
      case "invoke-selected":
        if (actor && uiState.selectedInvokeIds.size > 0) {
          clearCanvasRangeHighlight();
          const ids = Array.from(uiState.selectedInvokeIds);
          uiState.selectedInvokeIds.clear();
          await invokeActiveRunes(actor, ids, { maxAllowed: 2 });
          renderCommandDeck();
        }
        break;
      case "remove-diacritic":
        if (actor) {
          await attachDiacriticToActiveRune(actor, btn.dataset.entryId, null);
          renderCommandDeck();
        }
        break;
      case "transpose-rune":
        if (actor) {
          const newTarget = Array.from(game.user?.targets ?? [])[0] ?? null;
          await transposeActiveRune(actor, btn.dataset.entryId, newTarget);
          renderCommandDeck();
        }
        break;
      case "dismiss-rune":
        if (actor) {
          clearCanvasRangeHighlight();
          await dismissActiveRune(actor, btn.dataset.entryId);
          uiState.selectedInvokeIds.delete(btn.dataset.entryId);
          renderCommandDeck();
        }
        break;
      case "clear-all-traced":
        if (actor) {
          const st = getActorRuneState(actor);
          for (const t of st.activeRunes.filter((r) => r.mode === "traced")) {
            await dismissActiveRune(actor, t.id, "cleared");
          }
          renderCommandDeck();
        }
        break;
      case "save-daily-preset":
        if (actor) {
          await saveDailyEtchPreset(actor);
          renderCommandDeck();
        }
        break;
      case "apply-daily-preset":
        if (actor) {
          await applyDailyEtchPreset(actor);
          renderCommandDeck();
        }
        break;
      case "save-prop-formulas":
        if (actor && deckElement) {
          const inputs = Array.from(deckElement.querySelectorAll(".rcd-prop-input"));
          const vals = inputs.map((inp) => inp.value.trim());
          await mutateActorRuneState(actor, async (s) => {
            s.propertyFormulas = vals;
            return s;
          });
          ui.notifications?.info("Saved Runic Crafter property rune formulas!");
          renderCommandDeck();
        }
        break;
      default:
        break;
    }
  });
}

// ===========================================================================
// FOUNDRY V14 SCENE CONTROLS, SHEET INJECTION & ACTION INTERCEPTION
// ===========================================================================

export function registerUIHooks() {
  // Foundry v13 & v14 safe SceneControls registration (uses ONLY onChange on object tools per BUG-261024-01)
  Hooks.on("getSceneControlButtons", (controls) => {
    if (!shouldShowRunesmithUI()) return;

    if (Array.isArray(controls)) {
      const tokenCtrl = controls.find((c) => c.name === "token" || c.name === "tokens");
      if (tokenCtrl && Array.isArray(tokenCtrl.tools)) {
        tokenCtrl.tools.push({
          name: "runesmith-command-deck",
          title: "Toggle Runesmith Command Deck",
          icon: "fas fa-fire-alt",
          visible: true,
          button: true,
          onClick: () => toggleCommandDeck()
        });
      }
      return;
    }

    const tokenGroup = controls?.tokens ?? controls?.token;
    if (!tokenGroup?.tools) return;
    const toolDef = {
      name: "runesmith-command-deck",
      title: "Toggle Runesmith Command Deck",
      icon: "fas fa-fire-alt",
      order: 98,
      visible: true,
      button: true,
      onChange: () => toggleCommandDeck()
    };
    if (Array.isArray(tokenGroup.tools)) {
      tokenGroup.tools.push(toolDef);
    } else if (typeof tokenGroup.tools === "object") {
      tokenGroup.tools["runesmith-command-deck"] = toolDef;
    }
  });

  // Inject sleek Command Deck launcher strip into PF2e Character Sheet (100% native DOM, zero jQuery)
  Hooks.on("renderCharacterSheetPF2e", (sheet, html) => {
    const actor = sheet?.actor;
    if (!actor || !actor.isOwner || !isRunesmithActor(actor)) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".rcd-sheet-banner")) return;

    const state = getActorRuneState(actor);
    const limits = getRunesmithLimits(actor);
    const banner = document.createElement("div");
    banner.className = "rcd-sheet-banner";
    banner.innerHTML = `
      <div class="rcd-sb-left">
        <span class="rcd-sigil">&#9768;</span>
        <div>
          <strong>Runesmith Command Deck</strong>
          <span>Repertoire ${state.repertoire.length}/${limits.maxRepertoire} &bull; Active Runes: ${state.activeRunes.length}</span>
        </div>
      </div>
      <button type="button" class="rcd-btn rcd-btn-gold rcd-sb-open"><i class="fas fa-fire-alt"></i> Open Command Deck</button>
    `;
    banner.querySelector(".rcd-sb-open")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      toggleCommandDeck(true, { actorId: actor.id, tab: "battle" });
    });

    const strikesTarget =
      root.querySelector(".sheet-body .strikes-list") ||
      root.querySelector('[data-tab="actions"] .actions-list') ||
      root.querySelector('[data-tab="actions"]');
    if (strikesTarget?.parentNode) {
      strikesTarget.parentNode.insertBefore(banner, strikesTarget);
    }
  });

  // Intercept PF2e sheet action posts (Trace Rune, Invoke Rune, Engraving Strike, Fortifying Knock)
  Hooks.on("createChatMessage", (msg, _opts, userId) => {
    if (game.user?.id !== userId) return;
    if (!game.settings?.get(MODULE_ID, "autoOpenOnSheetAction")) return;
    const slug = msg?.item?.slug || msg?.item?.system?.slug || "";
    const actor = msg?.actor;
    if (!actor || !actor.isOwner || !isRunesmithActor(actor)) return;

    if (["trace-rune", "invoke-rune", "solitary-invocation", "engraving-strike", "fortifying-knock", "transpose-etching"].includes(slug)) {
      // Avoid re-triggering on Strike attack rolls
      if (msg.flags?.pf2e?.context?.type) return;
      toggleCommandDeck(true, { actorId: actor.id, tab: "battle" });
    }
  });

  // Refresh live UI when targets, control, combat, or state change
  Hooks.on("targetToken", () => {
    if (uiState.isOpen) renderCommandDeck();
  });
  Hooks.on("controlToken", () => {
    if (uiState.isOpen) renderCommandDeck();
    renderLauncherPill();
  });
  Hooks.on("updateCombat", () => {
    if (uiState.isOpen) renderCommandDeck();
  });
  Hooks.on(`${MODULE_ID}.stateChanged`, () => {
    if (uiState.isOpen) renderCommandDeck();
    renderLauncherPill();
  });
}
