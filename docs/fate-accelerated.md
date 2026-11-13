# Fate Accelerated campaigns

Each campaign uses one system. Creation defaults to Core and offers Accelerated with a short explanation of its approaches and shared stress. Campaign cards, the left navigation, and the top breadcrumb name the system with a small badge. Text remains visible on mobile and does not depend on color. Page titles remain campaign- or task-specific.

## Rules and compatibility

The system is stored on the saved rules definition, independently of editable preset names and custom rules IDs. Old rules definitions without a system retain Core behavior. Presets are cloned for each campaign. Changing systems through imported game settings is blocked; cross-system character imports are blocked with an explanation. New campaigns are the supported way to choose another system. Existing campaigns, samples, historical rolls, browser database names, and backup format identifiers remain compatible.

Accelerated PCs use six approaches and starting ratings +3/+2/+2/+1/+1/+0. Validation requires a high concept, trouble, and a third aspect for full creation; two further aspects are optional. No phase trio is created. The first three stunts are free; choosing one to begin or discovering it during play follows the SRD. Approaches do not grant stress bonuses or extra consequence slots. One shared track has rated boxes 1/2/3, with normal 2/4/6 consequences. Core extreme consequences are unavailable.

Physical initiative compares Quick; mental initiative compares Careful. The displayed order is a suggestion and the GM settles ties using the fiction. Helpers add +1 regardless of approach rating and spend their proactive action in a conflict exchange. Undo restores the rolling character and helpers' available actions only within that same exchange.

A significant or major milestone grants one approach increase, capped at +5, independently of the starting +3 cap and without skill columns. Any pair of approaches may be swapped as a minor change. A major milestone also adds one refresh. The existing audited milestone command flow records these changes.

Stress clears at scene boundaries. Consequence recovery needs appropriate narrative care and a GM-confirmed recovery period, not a Core treatment roll. Guidance distinguishes mild recovery at scene end after rest, moderate recovery at the next session's end, and severe recovery at scenario end. It also explains the alternate two-session milestone guidance in the pinned SRD. Consequences are never silently deleted by a boundary command; the GM confirms recovery in Growth & recovery.

Accelerated nameless NPCs are mooks with free-text specialties (+2), weaknesses (−2), and everything else (+0), plus zero to two stress boxes for an individual. A grouped mook receives one stress box per two members, and no consequences. Groups are bounded at 40 members to preserve the existing 20-box import limit; split larger forces into multiple groups. Other NPC profiles use the full approaches-based rules. Core mob overflow is reserved for Core; use a grouped mook in Accelerated.

The approach map continues to use the existing serialized rating and roll fields. System-specific interpretation lives in the domain rules and commands. JSON/ZIP exports, duplication, indexed storage schemas, player projections, and printed character/game worksheets retain the system and mook fields. Older application builds reject the new approach allocation rather than silently treating an Accelerated campaign as Core; all players should use the current build.

## Rules library sources and attribution

The canonical input is `source/fate-accelerated-SRD.html` from the same pinned `fate-srd/fate-srd-content` revision as Core. The upstream Markdown conversion omits linked text, so it is not used. The original HTML, original copyright and CC-BY notice, exact blob ID, SHA-256, byte count, transformation description, generated Markdown, and heading-based reference entries are retained. `scripts/import-accelerated.py` reuses Core's text-preserving HTML reader and supports `--check` without writing. The existing Rules library selects the campaign’s Core or Accelerated entries, with campaign-authored references alongside them. It retains the same search, reading dialog, custom references, and offline caching workflow. Accelerated uses the same topic categories and sidebar order as Core. Reading destinations use verified official section anchors where available; the four action headings have no IDs on the official site and use their enclosing Actions anchor. Boosts help opens the section that explains aspect types, including boosts. Rules prose, source lines, and campaign content versions remain pinned.

## Verification

`src/domain/accelerated.test.ts` covers creation, three-aspect validation, approach allocation, shared rated stress, initiative, swaps and advancement, stunt costs, teamwork and undo, narrative recovery, mooks, cross-system imports, JSON/ZIP round trips, projections, duplication, and source reproducibility. `src/content/accelerated-reference.test.ts` checks category alignment, reading mappings against the saved official heading IDs, and the Boosts help destination. `tests/reference-provenance.spec.ts` exercises both editions through the same Rules library and reader while offline. `tests/accelerated.spec.ts` covers creation and identity on desktop and mobile, reloading, approach rolls, and the selected offline library. Existing Core tests remain regression coverage.

Run `npm test`, `npm run check`, `npm run build`, `python3 scripts/import-accelerated.py --check`, and the Playwright suites. These checks do not substitute for physical-device or real-group playtesting.
