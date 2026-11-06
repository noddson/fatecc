# Fate Core rules verification

The default preset is verified against the **Fate Core System CC-BY SRD in the `fate-srd/fate-srd-content` repository**, pinned to commit `93ed848e723f31b4994b466b7241011ba24be885`. The authoritative input is [`source/fate-core-SRD.html`][core], retained byte-for-byte in `src/content/source/fate-core-SRD.html`. Provenance, checksums, conversion details, and the reason for generating Markdown from this source are recorded in `src/content/source-metadata.json` and `docs/content-sources.md`.

Rule explanations, summaries, and validation cite this repository source. The retail PDF and rendered rules website are not content inputs. The PDF remains a visual/font-identification reference only, as documented in `docs/design-sources.md`. Printed page numbers can be useful secondary navigation, but section names and commit-pinned GitHub source lines are the authoritative references here. `src/domain/rule-sources.ts` supplies the same section links to character validation and the interface.

The engine performs arithmetic and state validation. The table still decides fictional permissions, whether an aspect is relevant, negotiated costs, stunt conditions, and what a defeat means. An override or correction is recorded rather than represented as an ordinary rules result.

## Traceability register

| Rule | Repository section | Implementation | Verification |
| --- | --- | --- | --- |
| Configurable game defaults and character creation: five aspects, three phases, 4/3/2/1 pyramid, refresh three and three free stunts | [Setting Up Your Game][game], [Character Creation][creation], [Skills][skills], [Stunts and Refresh][stunts] | `CORE_RULES`, `createCharacter`, `validateCharacter` | Defaults, draft/quick gaps, allocation limits, paid stunt thresholds |
| Combined skill, stunt, and durability calculations | [Skills][skills], [Stunts and Refresh][stunts], [Stress and Consequences][stress] | `deriveCharacter` | Independently authored Harbor guard, Coastal courier, and Archivist pyramids replace the former retail character-sheet fixtures |
| Skill-derived rated stress and restricted bonus mild consequence at +5 | [Stress and Consequences][stress] | `deriveCharacter` | Every threshold from zero to +5; configurable governing skill |
| Four Fate dice and outcome boundaries | [Rolling the Dice][dice], [The Four Outcomes][outcomes], [The Four Actions][actions] | `rollDice`, `resolveAction` | All 81 combinations; unbiased byte rejection; each boundary for every action |
| New/existing advantage distinction and boost benefits | [Create an Advantage][advantage], [Attack][attack], [Defend][defend] | `resolveAction`, `finalizeRoll` | Tie/new versus tie/existing; one-time finalization; attack tie and optional style trade |
| Paid +2/reroll, free invocation stacking, and boost lifetime | [Invoking Aspects][invocations], [Free Invocations][free], [Boosts][boosts] | `invoke` | One paid invocation per aspect/roll; free stacking; reroll all dice; consumed boost versus enduring aspect; interpretation noted below |
| Hostile invocation payment after scene | [Invoking Aspects][invocations], [Earning Fate Points][earning] | Pending-award ledger | Explicit hostile flag or declared target; free invokes never transfer points; settle at scene boundary |
| Compel negotiation and Fate points | [Compelling Aspects][compels], [The Fate Point Economy][economy] | `compel`, `storyDetail`, `adjustFate` | GM confirms negotiated compel; sufficient balance; recorded reasons |
| Session top-up versus scenario reset | [Refresh][refresh] | `boundary` | High current balance preserved at session start; reset to refresh at scenario start |
| NPC scene spending versus unlimited GM awards and carryover exceptions | [The GM and Fate Points][gm-fate] | Scene pool and carryover | Participating PC count; GM awards do not drain NPC pool; carryover for NPC concessions/scene-ending compels |
| Core physical and mental initiative | [Turn Order][initiative] | `initiative` | Notice/Athletics/Physique and Empathy/Rapport/Will tie-break ordering |
| One proactive action per exchange and repeated defenses | [The Exchange][exchange] | Roll/exchange commands | Proactive-action rejection, repeated defenses, pending-roll checks |
| One rated stress box per hit and shared 2/4/6 slots | [Resolving Attacks][harm], [Stress][harm-stress], [Consequences][consequences] | `validateHarm`, `harm` | Full hit absorption; occupied boxes; occupied/shared/restricted consequence slots |
| Recovery treatment and narrative duration | [Recovering from a Consequence][recovery] | `recover` | Difficulty 2/4/6, +2 self-treatment; GM confirms whole scene/session/scenario after recovery begins |
| Extreme consequence | [Extreme Consequences][extreme], [Major Milestones][major] | `harm`, `milestone` | Requires replacement of non-high-concept aspect; once between major milestones; cannot be an ordinary consequence slot |
| Concession before roll and award after conflict | [Conceding the Conflict][concede] | Targeted attack state, `concede` | Reject after attack dice until harm resolved; no repeated concession; count consequences in this conflict |
| Teamwork | [Teamwork][teamwork] | `teamworkBonus` | Qualified +1 helpers, no duplicates or self-help |
| Nameless/supporting/main NPC distinction and mob overflow | [Creating the Opposition][npcs], [Hits and Overflow][mobs] | NPC derivation, `resolveMobHit`, `mobHarm` | Nameless shared stress/no consequences; supporting mild/optional moderate; the repository's three-thug/two-shift overflow example |
| Minor/significant/major milestones and supported columns | [Advancement and Change][advancement], [Skill Columns][columns] | Milestone and skill commands | One minor change; banked skill points; major refresh; column support and cap protection |
| Paid stunts added during quick creation | [Filling Stunts in Play][quick-stunts] | `learnStunt` | Immediate current Fate-point charge and lower future refresh; insufficient-point rejection |

## State integrity and multiplayer boundaries

Commands are pure with respect to their input: failure leaves the campaign unchanged. Accepted commands increment the campaign revision and append an event. A persisted command ID prevents a retry from duplicating a roll, Fate-point payment, or map movement. Expected revisions reject stale state. These are companion data-integrity safeguards, not additional Fate rules.

The authenticated actor is supplied by the host transport, not trusted from a player's payload. GM-only commands include campaign boundaries, approved drafts, ownership changes, Fate adjustments, milestones, and corrections. Players may act only for their assigned characters, and may move only their visible tokens on the shared map revision. Private roll visibility is preserved through invocation and finalization.

The log records original rolls and later roll snapshots separately. A finalized attack and its harm are distinct: a targeted hit must be resolved before its target can concede ahead of the next action. Corrections append a reason and do not rewrite past events.

## Intentional human decisions and implementation interpretations

- A stunt's free text is guidance, not executable code. The user applies applicable modifiers and records exceptional effects with the table's approval.
- Challenge tasks and contest victories are tracked after table adjudication. Failure costs, contest twists, and whether circumstances permit an action remain table decisions.
- Consequence recovery uses GM confirmation of fictional time, not elapsed wall-clock time. Starting treatment does not automatically clear an injury.
- A tie in all Core initiative tie-breakers requires table resolution. Alphabetical ordering in the UI is a stable display fallback, not a new game rule.
- The repository's **Earning Fate Points** section describes aspects invoked *against* their owner. The app uses a declared roll target or explicit hostile flag to determine this; beneficial use of an ally's aspect does not award that ally a Fate point. The broader wording in **Invoking Aspects** is read together with that earning condition. No rendered-website clarification is imported.
- The repository's **Boosts** section describes a transient aspect that disappears when invoked for free. **Free Invocations** permits later paid invocation only if the aspect remains. The app implements boosts as one free use, disallows buying paid uses, and requires a new advantage to turn the idea into an enduring aspect. The last restriction is an explicit implementation interpretation of that transient lifecycle, not a verbatim repository rule or a claim that the repository says boosts are not aspects. Existing table behavior is preserved; narrative promotion remains a table decision.
- Ordinary campaign editing can record house rules. The default preset does not silently switch to Condensed stress or elective initiative.

## Content and fixture audit

The pinned CC-BY source explicitly grants three free stunts and documents their refresh costs. No early one-free-stunt draft is used. The repository also contains an abridged OGL Markdown conversion with removed examples and placeholders; it is not silently substituted for this canonical CC-BY source.

The three full Landon/Cynere/Zird retail sheet distributions previously used in `rules.test.ts` have been replaced with independently authored complete pyramids that exercise the same rule combinations. Named examples retained elsewhere, such as the mob overflow case, occur in the pinned SRD. The Lantern Coast sample campaign, Mara/Silas/Wren characters, validation messages, skill summaries, and action-result explanations are companion-authored material based on the repository rules, not claimed to be quoted SRD passages. User-created campaign text remains user content.

## Running verification

`npm test` runs the table-driven mechanics tests, command transition tests, and persistence/network tests. `npm run check` checks TypeScript. Browser workflow tests are separate from these deterministic engine checks; passing unit tests does not establish cross-network TURN reliability or replace a real-table playtest. Source updates require rechecking the section line references as well as rule behavior; existing campaign snapshots are not rewritten automatically.

[core]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html
[game]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L404
[creation]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L556
[skills]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L918
[stunts]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L967
[stress]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L993
[dice]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L157
[outcomes]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3005
[actions]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3078
[advantage]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3131
[attack]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3201
[defend]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3237
[invocations]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L1342
[free]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L1396
[boosts]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L1180
[earning]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L1652
[compels]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L1422
[economy]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L1610
[refresh]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L1618
[gm-fate]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L1664
[initiative]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3597
[exchange]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3611
[harm]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3638
[harm-stress]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3652
[consequences]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3686
[recovery]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3734
[extreme]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3775
[concede]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3785
[teamwork]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L3950
[npcs]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L4600
[mobs]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L4674
[advancement]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L5432
[columns]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L5500
[major]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L5550
[quick-stunts]: https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html#L1090
