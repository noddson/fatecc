# Future content from the Fate SRD repository

This is a reviewed inventory and integration plan, not a list of features already enabled. The application currently bundles **Fate Core only**. Additional rules must not silently change the Core preset or an existing campaign.

Inventory snapshot: [`docs/markdown/` at commit `93ed848e723f31b4994b466b7241011ba24be885`](https://github.com/fate-srd/fate-srd-content/tree/93ed848e723f31b4994b466b7241011ba24be885/docs/markdown), reviewed 2026-11-06. The source lock records the upstream files. Paths below are relative to that repository.

## Upstream inventory

“CC BY 3.0” below means an explicit document-level attribution block was found; it does not mean the Core credit can be reused unchanged. Each book's named authors and copyright must accompany its content. “Review required” means the inspected Markdown lacks a document-level license/attribution notice; it is not a claim that the work has no license.

| Document | Repository Markdown path | License/attribution finding | Potential use |
| --- | --- | --- | --- |
| Fate Core | `docs/markdown/fate-core.md` | Explicit OGL; formatter removed examples. **Not used.** The repository's complete CC-BY `source/fate-core-SRD.html` is the current canonical input. | Verified default rules and full reference library |
| Fate Accelerated | `docs/markdown/fate-accelerated-SRD.md` | CC BY 3.0; Core/Accelerated attribution | A separately selected approaches-based rules preset |
| Fate Condensed | `docs/markdown/Fate-Condensed-SRD-CC-BY.md` | CC BY 3.0; distinct Condensed credits and additional credited material | A separate edition preset; stress, initiative, and advancement need independent verification |
| Fate System Toolkit | `docs/markdown/fate-system-toolkit-SRD.md` | CC BY 3.0; separate Toolkit authors; file contains mixed/malformed HTML and Markdown | Optional setting and rules variants, extras, and configuration guidance |
| Fate Adversary Toolkit | `docs/markdown/fate-adversary-toolkit.md` | Review required; no document-level notice found in Markdown, and the source HTML also starts directly with rules | Enemies, obstacles, constraints, and encounter preparation |
| Fate Accessibility Toolkit | `docs/markdown/fate-accessibility.md` | CC BY 3.0; its own named contributors | Table accessibility references and guidance |
| Fate Horror Toolkit | `docs/markdown/fate-horror-toolkit.md` | CC BY 3.0; separate Horror Toolkit authors | Optional horror campaign tools and references |
| Fate Space Toolkit | `docs/markdown/fate-space-srd.md` | CC BY 3.0; separate Space Toolkit authors | Optional space campaign tools and references |
| Atomic Robo RPG SRD | `docs/markdown/atomic-robo-SRD.md` | CC BY 3.0; Atomic Robo SRD attribution | Setting mechanics and character options as a distinct pack |
| Venture City | `docs/markdown/venture-city.md` | CC BY 3.0; Venture City SRD attribution | Superpower suites, enhancements, drawbacks, and collateral effects |
| War of Ashes | `docs/markdown/war-of-ashes.md` | CC BY 3.0; War of Ashes: Fate of Agaptus SRD attribution | Equipment stunts, advanced conflicts, magic, artifacts, and adventure tools |
| Frontier Spirit | `docs/markdown/frontier-spirit.md` | CC BY 3.0; Frontier Spirit Skills and Stunts SRD attribution | Setting-specific skills and stunts |
| Gods and Monsters | `docs/markdown/gods-and-monsters-SRD.md` | CC BY 3.0; Gods and Monsters SRD attribution | Divine-character and setting rules |
| Sails Full of Stars | `docs/markdown/sails-full-of-stars-SRD.md` | CC BY 3.0; Sails Full of Stars SRD attribution | Setting-specific reference and character options |
| Fate Conspiracies | `docs/markdown/three-rocketeers-fate-conspiracies-SRD.md` | CC BY 3.0; Fate Conspiracies SRD attribution | Conspiracy design and campaign preparation |
| No-Skill Swashbuckling | `docs/markdown/three-rocketeers-no-skill-swashbuckling-SRD.md` | CC BY 3.0; No-Skill Swashbuckling SRD attribution | A deliberately selected skill-free variant |
| Factions | `docs/markdown/Factions.md` | CC BY 3.0; specific Factions for Fate attribution at the end, crediting commissioner Declan Feeney, author Mark Diaz Truman, and editor John Adamus | Faction beliefs, paragons, faction skills, and status |
| Words of Power | `docs/markdown/words-of-power.md` | Review required; author/editor/layout credits appear, but no license/attribution notice was found | Optional word-based magic extras |
| The Book of Hanz | `docs/markdown/The-Book-of-Hanz-Fate-Core-Thought-of-the-Day.md` | Review required; author and compilation/formatting credits appear, but no document-level license was found | Advice and play interpretation, distinguished from binding Core mechanics |

The repository contains other formats and supporting assets as well. The 19 Markdown files are the inventory reviewed here; a future import must separately inspect the rights and usefulness of any image, font, layout, or non-Markdown asset.

## Staged integration

### 1. Keep the Core baseline reproducible

Retain the unmodified, pinned repository CC-BY input and its original notices. Generate Markdown and offline search entries locally. Maintain source paths, headings, commit IDs, hashes, and tests for the supported rules. Preserve a clear distinction between imported reference text, companion-authored explanations, and user-created material.

### 2. Add optional reference packs

Start with references that complement Core without replacing its mechanics, such as System Toolkit guidance, Accessibility material, and the Factions supplement. Each pack needs a stable ID, its own version, exact attribution, source links, and a deliberate opt-in. Search must show which book an entry belongs to. Keep the current Core library available offline.

Before shipping a pack, check the complete source for omitted sections, conversion artifacts, embedded images, cross-references, notices, and additional credited material. The System Toolkit file's mixed markup illustrates why a `.md` extension alone does not establish a clean input. Resolve the missing document-level notices for Adversary, Words of Power, and Hanz before copying them into the application.

### 3. Add reviewed campaign templates and extras

Venture City, Frontier Spirit, Gods and Monsters, Sails Full of Stars, Atomic Robo, War of Ashes, and the Three Rocketeers supplements can inform optional settings, skills, stunts, NPCs, and extras. Build templates only from material actually present in the pinned SRD. An SRD's presence does not imply that its full commercial adventure, illustrations, or every setting detail is included.

Preview mechanical changes before applying a template to an existing game. Distinguish narrative-only references from implemented automation. Keep the chosen content pack and rule versions in portable campaign data; include their attribution when copied source material is exported.

### 4. Introduce alternate editions separately

Accelerated, Condensed, and the No-Skill Swashbuckling variant require separately identified presets and tests. Never blend their skill/approach choices, stress behavior, initiative, or milestones into Core implicitly. Importing references is not the same as implementing the edition's mechanics.

Condensed's pinned repository author list differs from the current website licensing guidance. Reconcile the required credit when that edition is selected for inclusion; do not silently discard the pinned notice or invent a replacement author list.

### 5. Maintain pack updates deliberately

Review upstream changes at selected commits, update hashes and conversion fixtures, and show users the impact of changed rules. Existing campaigns retain pinned versions until an explicit reviewed update. Archive historical source notices with the versions they describe.

## Acceptance criteria for any new pack

- The repository file, commit, hash, license, copyright, required author credit, and local transformation are recorded.
- Original notices remain intact; app attribution includes every used SRD's specific credit and identifies modifications.
- A content audit confirms the imported edition and checks examples, tables, cross-references, and graphics omissions.
- The UI labels the source book and whether a rule is reference-only, automated, or a chosen house rule.
- Runtime code does not scrape or fetch rule text; search, reading, and attribution work offline.
- Import/export and existing-campaign behavior preserve the selected rules and content versions.
- Mechanical automation has independent tests; narrative permissions remain explicit table decisions.

The [official licensing guide](https://fate-srd.com/official-licensing-fate) and [CC guidance](https://fate-srd.com/official-licensing-fate/cc) remain the authority for attribution requirements. See [content-sources.md](content-sources.md) for the implemented Core pipeline.
