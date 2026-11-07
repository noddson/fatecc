# Fate Core Companion

A local-first Fate Core campaign application. Create a game, build characters, search the bundled Core SRD, run sessions, keep a campaign journal and inventory, and share a table over WebRTC. Data lives in your browser; complete JSON and ZIP backups are portable.

## Run locally

Use Node.js 22.x (22.12 or newer) or Node.js 24+, with npm 11.17 or newer. These versions are enforced by the project so the dependency install-script policy is respected. Node.js 23 is unsupported by the test runner.

```sh
npm ci
npm start
```

Install scripts are reviewed in the project's `package.json`: the pinned esbuild setup script is allowed, and fsevents lifecycle scripts are denied. The optional prebuilt macOS watcher remains installed. Unknown dependency scripts stop installation for review; no global npm approval is needed.

The current audit has no critical, high, or moderate findings, and `npm audit --omit=dev` is clean. Four low findings remain in one build-only dependency chain with no upstream patch. Do not run `npm audit fix --force`: its proposed fix downgrades the PWA plugin to an incompatible old release. See [dependency security status](docs/dependency-security.md).

Open **http://127.0.0.1:4173/fatecc/** for the production build. On macOS, you can also double-click **Start Fate.command** after installing Node. Keep the same address and port: browser storage belongs to its origin. Development (`npm run dev`) opens at **http://127.0.0.1:4173/**. The supplied PDF stays outside the built application.

The production build registers an offline service worker. After the first successful load, the app and its Core references are available offline. Use your browser's install option where supported. Apply available updates between sessions after making a backup. Development mode (`npm run dev`) does not install the production offline worker.

For phones/tablets, serve the `dist/` directory from static HTTPS hosting and open it once on each device. This serves application files only, not a campaign database. Ordinary HTTP on another computer's LAN address does not meet PWA secure-context requirements. No publishing or cloud account is needed for local desktop use.

Production defaults to the GitHub Pages path **https://noddson.github.io/fatecc/**. Set `VITE_BASE_PATH=/` when building for a root-hosted site. The footer follows Waypoint's `YYYY.MM.shortSHA[.d]` version format and links to the exact GitHub commit when built from a Git checkout or CI. Unversioned source folders display **Local build**. See [build identity and hosting paths](docs/build-version.md) and the publishing instructions below.

## Publish on GitHub Pages

The [Pages workflow](.github/workflows/pages.yml) tests, builds, verifies offline use,
and deploys on pushes to `main`. Enable **Settings → Pages → Source → GitHub Actions**
in the repository. GitHub Actions publishes the generated `dist/` directory; it
stays ignored locally. Follow the [first-publication guide](docs/github-pages.md)
for repository setup, workflow troubleshooting, updates, and moving campaigns
from localhost. The [initial implementation record](docs/initial-implementation.md)
details everything included in the first commit and its verification limits.

## Start a story

1. Create a campaign or one-shot. The optional **Lantern Coast** sample is original material for exploring the interface. Newly created examples include an illustrated coast map, five connected travel zones, and party tokens at Bellweather Harbor. The image is bundled for offline use and embedded in JSON/ZIP backups; `public/sample/lantern-coast.png` is also available to upload or print separately.
2. Define the setting and issues in Overview. In Game settings, review/apply changes to the Core preset before creating characters.
3. Create full or quick characters. Draft edits save locally; character checks explain missing choices and invalid mechanics. NPCs have separate profiles.
4. Use At the table for rolls, invocations, compels, stress, consequences, scene/session boundaries, and a permanent activity log. The table still decides fictional permissions and narrative costs.
5. Add private/shared journal entries and inventory. For a private possession, set inventory **Visibility** to **Character** and choose its character under **Held by**. Only that character’s assigned player and the GM receive the item and its private activity; general shared exports exclude it. Deleting the character preserves those possessions as GM-only party items. Upload exported map images under Maps & zones. Publish a selected map revision when ready to share it.
6. Download a **Full campaign JSON** regularly. It contains images as well as game data. Compact ZIP backups preserve the same content with binary images. Import as a copy by default; explicit restore replaces matching local state and requires fresh device pairing.

The initial release has implemented features across all development stages. Completion of a feature is distinguished from its release verification gate in [the delivery register](docs/delivery.md). Cross-network TURN, the full physical-device/browser matrix, and real-group playtesting remain outstanding.

## Campaign banners

On **Overview**, choose **Add banner** (or **Change banner**) and upload a PNG, JPEG, or WebP image up to 10 MB. A landscape image works best. Adjust **Vertical position** to choose the visible crop, then **Save banner**. The image appears on the campaign overview and its card in **My campaigns**. **Remove banner**, followed by **Save banner**, restores the default artwork; **Cancel** discards unsaved image and crop changes.

Banners are shared with connected players. Image bytes and crop position are stored locally and included in campaign JSON and ZIP backups, so restored or duplicated campaigns retain their banners without relying on an external image URL.

## Play on paper

Open **Print sheets** in campaign navigation to select character/NPC sheets, the **Game creation worksheet**, or the **Table worksheet**. **Print** on a character opens a dialog limited to character sheets. Choose **US Letter (Portrait)**, **US Letter (Landscape)**, **A4 (Portrait)**, or **A4 (Landscape)**. US Letter portrait is the default. The preview fits the selected paper shape to the available screen width, and printing uses that same size and direction. Optional story pages include backstory, connections, personal inventory, notes, and advancement; the table worksheet includes the cast, scene aspects, inventory, and session notes.

**Shared handout** is the GM's default and excludes GM-only and character-private material before rendering the preview. A local GM can explicitly choose **GM copy (includes secrets)**. Connected and cached players get **Your copy**, which retains their assigned characters' private belongings and excludes other players' secrets. Sheets use current campaign data, including configured skills and stress tracks, derived refresh, current Fate points, marked stress, and consequences. Empty fields provide space for pencil notes, and long entries continue onto additional pages.

Select **Print / Save PDF**, then choose a printer or your browser's PDF destination. Match the selected paper size, use 100% scale, and turn off the browser's **Headers and footers** to remove its title and URL/IP address. The app's footer keeps the local date/time at bottom left and **Fate Campaign Companion** centered. Printing works with locally available data and assets; it does not need an external document service. Paper notes are not synchronized back into the app—enter changes manually when you return to digital play.

The print layouts are original HTML inspired by the book's worksheets and [Evil Hat's official blank character sheet](https://evilhat.com/wp-content/uploads/2022/03/Fate-Core-Character-Sheet-Formfillable.pdf). No book artwork, website rules prose, or commercial font files are copied into these sheets. Rules content remains sourced from the pinned GitHub repository. See [print design sources](docs/design-sources.md#printable-play-sheets).

## Play together

Open **Connect**. One GM hosts; up to seven players connect from their own browser copies of the app. Choose **Host a table → Create player invitation** to display an invitation QR. The player scans or uploads it under **Join a table**, then selects **Create connection answer**. The GM scans or uploads that response, selects **Connect player**, and approves character access. Camera scans run inside the app; downloaded QR images and copy/paste text are available as fallbacks. QR pairing needs no signaling service. See the [pairing instructions](docs/networking.md#qr-pairing-and-manual-connection).

Before pairing across the internet, open **Connection settings · STUN and TURN** on each device. Select **Cloudflare STUN** (`stun:stun.cloudflare.com:3478`), **Google STUN** (`stun:stun.l.google.com:19302`, UDP port 19302), or **Custom STUN** to enter another server. The default uses no external server for local-network play. If a direct connection fails, select **Cloudflare TURN** or **Custom TURN** and enter issued credentials. **Set up Cloudflare TURN** links the official account/key and credential-generation instructions. See the [connection settings guide](docs/networking.md#connection-settings) for the full setup.

Settings stay in memory until the page reloads and are excluded from campaign backups. Disconnect the table before changing settings for a new invitation. TURN relays encrypted peer traffic; campaign storage remains on participants' devices.

The GM browser must stay open during shared play. A disconnected player keeps a sanitized cached view and can prepare a local narrative draft. Reconnect, submit the draft, and let the GM review it against its base revision. There is no automatic host election. Read [networking and deployment details](docs/networking.md) for credentials, ownership, and test limitations.

Temporary interruptions retain device approval and refresh the shared state when the existing connection recovers or the tab wakes. A phone that closes its connection or discards the tab still needs a fresh invitation/response exchange; saved device approval is reused. The app remains fully serverless. See [sleep and recovery limits](docs/networking.md#sleep-and-temporary-interruptions).

## Verification

```sh
npm run check        # TypeScript
npm test             # Rules, commands, persistence, privacy, content, maps
npm run build        # Static production application + offline precache
npx playwright install chromium
npm run test:e2e     # UI, QR pairing, connection settings, WebRTC, legacy broker
npm run test:offline # Build and verify offline operation against production
```

For an existing compatible Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Automated tests use isolated browser profiles. The protocol tests use test-only ICE flags to expose local candidates in headless Chromium; the application does not change browser security settings.

To test the deployed site in two independent Chrome processes with default WebRTC networking, run:

```sh
FATE_TEST_URL=https://noddson.github.io/fatecc npx playwright test tests/deployed-connection.spec.ts
```

This opt-in suite exchanges invitations and answers through the UI, approves a player, checks privacy, and verifies identical rolls in both directions. It tests no STUN, Cloudflare STUN, and Google STUN, saving videos, screenshots, and connection diagnostics. Both clients run on the same machine; a passing STUN-selected case can still use a local route. See [live connection verification](docs/networking.md#deployed-site-two-client-test).

## Project structure

- `src/domain/`: typed state, verified Core preset, pure rules, authorized/idempotent commands.
- `src/storage/`: IndexedDB records and image blobs, bounded import schemas, migrations, portable backups.
- `src/network/`: selective player projections, device grants, WebRTC, asset transport, and drafts.
- `src/content/`: pinned GitHub SRD source, generated Markdown/references, source catalog, attribution, and search.
- `src/components/`: local campaign, builder, reference, session, journal, inventory, map, and connection interfaces.
- `signaling/`: legacy connection-only WebSocket prototype; the current interface uses QR/text pairing.

Rules text and mechanical references come from a pinned revision of [fate-srd/fate-srd-content](https://github.com/fate-srd/fate-srd-content). The bundled Core SRD is CC BY 3.0 with attribution in [LICENSE-SRD.txt](public/LICENSE-SRD.txt). Its original CC-BY repository HTML is converted locally into Markdown and offline entries because the repository's Core Markdown identifies itself as abridged OGL. See [source provenance](docs/content-sources.md) and the [repository-linked rules verification register](docs/rules-verification.md).

Run `python3 scripts/import-srd.py --check` to verify the pinned source bytes and reproducible outputs, or `python3 scripts/import-srd.py` to regenerate them offline. No rules are fetched at application runtime. Existing campaigns keep their saved content version; the library explicitly identifies an older edition when applicable.

The [content roadmap](docs/content-roadmap.md) inventories 19 upstream Markdown documents and plans optional reference packs, settings, and alternate presets with their own attribution and tests. Core remains the automated preset. Arbitrary scripts, cloud campaign storage, marketplace content, and fog of war remain outside this implementation.

## Fate Core design

The interface follows the supplied book's blue cover, white pages, geometric headings, and Garamond prose. It uses the official, unchanged Powered by Fate logo and official action/dice glyphs with the required attribution. Fonts are served locally and cached for offline use.

The book uses **Gotham** and **Adobe Garamond Pro**. The app prefers installed copies of those families; their commercial files are not bundled. **Montserrat** and **EB Garamond** provide licensed offline alternatives. See [design sources and font permissions](docs/design-sources.md) for the exact files, source records, and licensing distinction.

## Storage and recovery

Images support PNG, JPEG, and WebP up to 10 MB each. Full imports and expanded ZIP packages are limited to 64 MB. Exports that exceed the supported restore limit fail explicitly. Imported assets have content hashes checked, unexpected archive files are rejected, and failed imports leave existing campaigns unchanged.

Browser storage can be cleared or exhausted. The Backup dialog offers a persistence request; even when granted, keep external backups. A player-safe export is not a complete GM recovery backup. Connection credentials are deliberately excluded from every export. Already disclosed information cannot be recalled from another participant's device.
