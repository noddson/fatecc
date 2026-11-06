# Initial implementation on main

This initial commit establishes Fate Core Companion as an offline-capable static
browser application for preparing and running Fate Core campaigns. It includes
the complete first implementation and its regression coverage, plus automated
GitHub Pages publication. This is a development release; the physical-device,
cross-network relay, and real-table gates in [delivery.md](delivery.md) remain open.

## Application foundation

React and TypeScript provide the interface; Vite builds static assets and an
installable PWA. Dexie/IndexedDB stores local campaign records and image bytes.
Zod validates saved/imported records, MiniSearch indexes offline references, and
Vitest/Playwright provide rules, persistence, privacy, and browser verification.
Pure rules operations and validated commands are separated from the interface,
storage, and WebRTC transport.

The app supports localhost and static HTTPS hosting. Service-worker paths,
manifest scope, public assets, and the version footer respect the deployment base.
The footer identifies the built commit using `YYYY.MM.shortSHA[.d]`; cached older
builds retain their own identity. No campaign account or storage backend is required.

## Campaign preparation and durable data

Campaigns and one-shots can be created, opened, copied, archived, and deleted.
Game creation includes setting, scale, issues, faces/places, participant ownership,
and versioned configurable Core rules. House-rule changes have impact previews
and explicit revalidation rather than silently rewriting historical play.

Full and quick character creation cover aspects, phase history, skills, stunts,
extras, refresh, Fate points, stress, consequences, and advancement. Drafts may
remain intentionally incomplete. NPC profiles, world notes, factions, locations,
session summaries, shared resources, and character ownership support continuity.

Committed changes autosave locally. JSON embeds images; ZIP stores the same
manifest with binary assets. Import validation and integrity checks happen before
commit. Independent-copy import is the default, with an explicit restore path.
Public/player exports are filtered before serialization. Relay credentials never
enter campaign records or exports. Browser storage still requires external backups.

## Local play and campaign continuity

The session workspace provides four Fate dice, skills/modifiers, opposition,
four-action outcomes, invocations, boosts, compels, Fate-point expenditures,
teamwork, challenges, contests, conflict exchanges, rated stress and consequences,
recovery, concessions, and explicit scene/session/scenario boundaries. Accepted
commands and corrections produce an auditable chronological log. Narrative
permissions, costs, and custom stunt judgments stay with the table.

Inventory has Shared, GM-only, and Character visibility. Private possessions and
history are sent only to authenticated character holders and the GM. Transfers
preserve historical audiences. Deleting a character preserves private possessions
as GM-only party inventory. Milestones record choices and banked skill points.

Map tools accept raster images and retain immutable image revisions with editable
normalized zones, connections, aspects, annotations, and tokens. GMs select what
revision to share. Token dragging preserves exact destinations during saving,
zone arrivals avoid occupied positions, and unchanged fields do not spam the log.
The original Lantern Coast example includes a coastal map, five travel zones,
and party tokens. Fog of war remains deferred.

## Shared browser sessions

The GM browser is the single live authority, initially supporting seven players.
Device approval, character grants, revocable reconnect credentials, command IDs,
and revision checks govern accepted changes. Permission-filtered snapshots,
events, search data, exports, and verified chunked assets protect GM/character
secrets before they leave the host.

Invitations and responses use QR codes with scanning, image upload, and text
fallbacks. Connection settings offer no STUN, Cloudflare STUN, Google STUN, or
custom STUN, plus independent Cloudflare/custom TURN configuration. Temporary
credentials live only in memory. Shared changes pause without the host; cached
reading and narrative drafts remain available. Automatic host election and
independent concurrent campaign hosts are outside scope.

## Rules provenance, design, and printed play

The complete reference library contains 310 Core entries derived from the
original CC BY HTML in `fate-srd/fate-srd-content`, pinned to commit
`93ed848e723f31b4994b466b7241011ba24be885`. The importer verifies source hashes,
generates local Markdown, retains attribution, and runs offline. The upstream
abridged OGL Markdown is not used as the complete CC BY source.

Human-facing reading links use Fate-SRD.com. All 90 linked pages' heading metadata
was audited; 227 entries now use verified subsection anchors. Repository links
remain separately available as source provenance. Additional repository material
is catalogued for future reviewed packs rather than mixed into the Core preset.

The interface follows the book's blue/white/black design and prefers installed
Gotham/Adobe Garamond Pro, with licensed bundled substitutes. The official Powered
by Fate logo and glyph font retain attribution. Commercial PDF font subsets and
book illustrations are not redistributed. Approved generated welcome dice and
the original sample map have documented visual provenance.

Original printable layouts support character/NPC sheets, game-creation and table
worksheets, and optional story/inventory pages. Paper choices are US Letter and
A4 in portrait or landscape, with matching scaled previews and PDF dimensions.
Player printing preserves authorized private belongings. The character dialog
offers character sheets only. Each printed page retains attribution and a footer
with local timestamp at left and centered Fate Campaign Companion branding.

## Verification recorded for the initial commit

The implementation has 244 passing unit tests across 14 files. Focused production
browser checks cover creation, configurable mechanics, reload, JSON/ZIP
restoration, banner uploads, responsive screens, printing, direct rule anchors,
map movement, and private inventory. All four PDF dimensions were verified.
Offline checks exercise the actual built `/fatecc/` PWA, fonts, rules, artwork,
sample map, and saved campaign data.

Two local WebRTC regressions exercise approval, privacy, retries, reconnect,
revocation, asset transfer, and one GM plus seven players. Configuration checks
intercept public provider calls; they do not prove live TURN or separate-network
reliability. Physical Safari/iOS, Firefox, Android, printers, and full human-table
playtests remain release gates, not claims made by this initial commit.

The Pages workflow repeats locked installation, source/anchor audits, unit tests,
production build, and offline browser checks before deploying `dist/`. See
[github-pages.md](github-pages.md) for first publication and operating instructions.
