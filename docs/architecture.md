---
type: decision
status: accepted
decided: 2026-11-05
---

# Local-first Fate Core architecture

The accepted product is a static offline PWA, with React and TypeScript over a pure Core rules engine and IndexedDB persistence. The user selected configurable Core rules, guided adjudication, private campaigns, desktop GM tools, and responsive player screens. The initial useful milestone is game setup, characters, reference search, and portable backups; later features build on the same contracts.

## Accepted decisions

- Use localhost or static HTTPS, not a file:// application. Cache code and references after first load for offline use.
- Store complete state locally and export versioned JSON with embedded assets, with an equivalent ZIP format for efficient images. External backups remain the recovery mechanism.
- Use a single GM browser as the live campaign authority. WebRTC carries approved actions and selective replicas. QR/text exchanges connection descriptions; optional Cloudflare/custom STUN and TURN provide network traversal. Connection settings and temporary TURN credentials stay in memory outside campaign records and exports.
- Keep disconnected player changes as separate drafts requiring revision-aware GM review. Do not silently merge mechanical state or automatically elect another host.
- Keep a campaign's rules and content version explicit. Use named Core configuration values, not user-supplied executable plugins.
- Import rules from pinned `fate-srd/fate-srd-content` repository files. Prefer reviewed Markdown; for Core, generate Markdown from the repository's original CC-BY HTML because its Markdown edition is abridged OGL. Keep per-source attribution, hashes, and source links; render reference text without executing source markup. Other editions and supplements require distinct reviewed content packs.
- Derive player-visible state before sending it. Filtering a screen is insufficient to protect secrets; snapshots, history, indexes, references, and image bytes must all respect visibility.
- Publish complete selected map revisions. Fog of war, published adventure packages, other Fate editions, and always-on cloud campaign storage are deferred.

## Tradeoffs

GM authority makes spending, stress, roll history, ownership, and secret disclosure tractable, but requires the GM tab to remain available for shared changes. The direct peer path keeps campaign storage out of an external service, but some internet networks need a TURN relay. The same application runs entirely locally even when these optional services are unavailable.

Deterministic arithmetic and rule validation are testable; whether an aspect applies or a fictional consequence has had enough recovery time remains a human decision. The application records those decisions rather than inventing them.

## Evidence and release status

See `rules-verification.md` for source-linked mechanical coverage, `content-sources.md` for licensed SRD provenance, `networking.md` for connection details, and `delivery.md` for implemented features and incomplete external verification gates.
