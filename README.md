# PF2e Runesmith Command Deck

Complete tactical **Command Deck HUD**, built-in **Runic Repertoire Builder** (all 44 official *Pathfinder: Impossible Magic* Lv 1–17 Base & Diacritic runes), full combat automation, **Runic Crafter** formula manager, and visual PIXI token rune badges for **Pathfinder 2e** on **Foundry VTT v13 / v14**.

## Key Features

- **Zero External Dependencies**: Uses native Foundry VTT `socket` relay and self-contained PF2e Rule Element effects — no extra helper modules required on local or cloud servers.
- **Built-in *Pathfinder: Impossible Magic* Rune Compendium (All 44 Runes)**:
  - **16 Level 1 Base Runes**: *Atryl*, *Baruiel*, *Camonica*, *Esvadir*, *Holtrik*, *Ledria*, *Lyskel*, *Marssyl*, *Oljinex*, *Pluuna*, *Ranshu*, *Rehgog*, *Sertum*, *Thullax*, *Tilus*, *Zohk*.
  - **8 Level 5 Diacritic Runes**: *Av-*, *En-*, *Fob-*, *Kit-*, *Per-*, *Sun-*, *Ti-*, *Ur-*.
  - **12 Level 9 Base Runes**: *Astillu*, *Cruonign*, *Feikris*, *Germantria*, *Ichelsu*, *Jurroz*, *Kojastri*, *Oraloq*, *Piteregrin*, *Trolistri*, *Ulgatus*, *Yudici*.
  - **4 Level 13 Diacritic Runes**: *Eck-*, *Inth-*, *Nesh-*, *Sar-*.
  - **4 Level 17 Capstone Runes**: *Aiuen*, *Ochygholl*, *Rovan*, *Xinsala*.
- **Full Combat Lifecycle Automation**:
  - **Etch Rune** (FIFO slot cap `2` -> `6` + free slot support for *Runic Tattoo*, *Drawn in Vital Ink*, *Living Lexicon*).
  - **Trace Rune** (`1A` Adjacent & `2A` 30-ft range validation + automatic expiration at the end of your next turn).
  - **Engraving Strike** (`1A` Flourish): Rolls your melee weapon Strike and automatically Traces your selected rune onto the struck foe on a hit or crit!
  - **Fortifying Knock** (`1A` Flourish): Raises your Shield and Traces a shield rune in one click.
  - **Invoke Rune** (`1A`): Invoke up to 2 runes within 30 ft (60 ft with *Distant Invocation*), enforcing duplicate-rune protection, Diacritic combinations (*Ti-* element swap, *Ur-* status damage bonus, *En-* 15-ft emanation expansion, *Kit-* save penalty, *Eck-* spirit conversion, *Sun-* auto-retrace, etc.), *Zohk* canvas teleportation, *Holtrik* instant Shield Raise, and interactive Save + Apply Damage chat cards!
- **Visual PIXI Token Badges**: Displays Etched (molten gold) and Traced (arcane cyan) rune sigil orbs on Runebearer tokens across all clients, plus hover range rings.
- **Daily Preparations & Runic Crafter**: Save and re-apply Morning Etchings in 1 click, and track auto-unlocked Fundamental & Property Rune formulas.

## Installation (Cloud or Local Server)

1. In Foundry VTT Setup, open **Add-on Modules** -> **Install Module**.
2. Paste the **Manifest URL**:
   ```text
   https://github.com/CuriosityTAU/pf2e-runesmith-command-deck/releases/latest/download/module.json
   ```
3. Launch your PF2e world, go to **Settings** -> **Manage Modules**, and enable **PF2e Runesmith Command Deck**.
