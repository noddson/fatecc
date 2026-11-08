# Hearts of Steel starter provenance

The optional **Hearts of Steel** campaign adapts only the vendored Fate Core CC-BY SRD, pinned to `93ed848e723f31b4994b466b7241011ba24be885`. It is a second example alongside the original Lantern Coast campaign. Creating either example makes a fresh local campaign; both remain available from the campaign list.

`src/hearts-of-steel.ts` contains `HEARTS_SOURCES`, an element-by-element register of source sections, original HTML line numbers, short evidence strings, changes, and visibility. The starter copies the shared register and complete Core attribution into a shared journal reference entry, so JSON/ZIP exports and player copies retain them. Opening-scene provenance stays in a GM-only reference entry. The unit checks verify the source hash, section/line identities, evidence strings, and all retained aspect/stunt names against the cited offline SRD sections.

The premise, Riverton, campaign issues, Scar Triad, Cult of Tranquility, Ivory Shroud, Collegia Arcana, named cast, retained aspects, backstory connections, stunt rules, and magic extra derive from those sections. Descriptions and rules are condensed. The Primarch's identity and the conflicting prophecies remain unresolved. Later hypothetical adventures and campaign outcomes are not established history.

Landon and Cynere have independently completed skill pyramids. Zird's pyramid follows the allocation explicitly described in the SRD's Skills section. All three have independently selected sets of three SRD stunts and start in ready/quick mode, allowing the table to expand their phases in play. The characters are playable companion builds, not reproductions of the retail character sheets. In particular, Backup Weapon follows the SRD's fate-point cost. Stunts and magical permissions continue to require table adjudication.

The fifth Cynere aspect, **I choose my own contracts**, the fifth Zird aspect, **Answers before payment**, Old Finn's **Landon’s mentor** aspect, NPC skill allocations, tagline, and opening/follow-up prompts are original companion additions or adaptations, identified in the campaign itself. The original opening develops the SRD's shopkeeper/extortion situation without deciding outcomes or inventing a settled connection between the Triad and the cult.

No retail-PDF text, retail-sheet distributions, Tower of the Serpents additions, community lore, or book artwork is an input. No geographic map is asserted by this starter. Future additions need their own evidence in the pinned SRD or an explicit companion-origin label.

The SRD-derived parts use Creative Commons Attribution 3.0 Unported. Complete attribution is in the campaign journal and `public/LICENSE-SRD.txt`; source and transformation details are in `docs/content-sources.md`. No additional permissions for the separately published adventure are assumed.

Verification: `npm test`, `npm run check`, `npm run build`, and `npx playwright test tests/hearts-of-steel.spec.ts tests/lantern-map.spec.ts`.
