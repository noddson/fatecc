# Peer-to-peer table

The GM's open browser is the authority. Players connect to that browser with WebRTC using QR or text invitation/response exchange. The first multiplayer version supports one GM and seven players. The GM approves a new device and grants access to specific shared player characters.

## QR pairing and manual connection

QR pairing exchanges the complete connection offer and response without a signaling service. Open the app on both devices first; scan using the controls inside **Connect**, rather than a general-purpose phone camera app.

1. The GM opens a campaign, chooses **Connect → Host a table → Create player invitation**, and keeps the dialog open. An invitation QR appears.
2. The player chooses **Connect to a table → Join a table**, enters their name, and selects **Scan invitation QR**. Alternatively, the GM downloads the invitation PNG and the player uses **Upload invitation QR image**. Reading a code fills the connection text; it does not start or approve a connection automatically.
3. The player selects **Create connection answer**, then displays or downloads the response QR. Keep the player's tab open.
4. The GM selects **Scan response QR** or **Upload response QR image**, then **Connect player**. When the player appears, choose their characters and select **Approve player**.
5. Create a separate invitation for each additional player. Both browsers must stay open during pairing; old screenshots do not restore a closed connection.

The **Copy/paste invitation** and **Copy/paste response** sections retain the complete original connection text. Copy it through a trusted communication channel into the corresponding incoming text box, then use the same connection buttons. This also works when there is no camera or a connection description is too large for one readable QR. Downloaded QR images can be shared through an existing chat for remote play.

QR generation, image reading, and camera decoding run on the device. No external QR API receives connection information. Camera access starts only after selecting Scan and requires browser permission on HTTPS or localhost. Camera tracks stop when a code is read, scanning is cancelled, the dialog/tab mode closes, a connection starts, or the page becomes hidden. Image upload accepts PNG, JPEG, and WebP up to 10 MB and 24 megapixels, with a bounded scan resolution. Compressed QR messages have version/type checks and bounded decompression; wrong-direction or unrelated QR codes leave the input unchanged. They carry connection details, not campaign records or saved reconnect credentials.

## Connection settings

Open **Connect → Connection settings · STUN and TURN** before creating an invitation or response, on each device. Settings survive closing the dialog but remain in tab memory only: a reload resets them, and exports contain no server credentials. Once a host or player connection has started, choose **Disconnect table** before editing settings and making a fresh invitation. Invalid endpoints or missing TURN credentials are rejected before an existing connection is replaced.

Under **STUN service**, choose:

- **Local network only (no STUN)**: the default empty ICE server list, intended for participants on the same network.
- **Cloudflare STUN**: `stun:stun.cloudflare.com:3478`. This public service is free and unlimited; it does not require an account or credentials. [Cloudflare FAQ](https://developers.cloudflare.com/realtime/turn/faq/).
- **Google STUN**: `stun:stun.l.google.com:19302`, using UDP port 19302 without credentials.
- **Custom STUN**: enter one `stun:` or `stuns:` endpoint. Hostnames, IPv4, and bracketed IPv6 are supported, with an optional port.

STUN helps browsers discover an internet route. Some networks also need TURN to relay the encrypted traffic. **TURN service** offers no relay, **Cloudflare TURN**, or **Custom TURN**. The Cloudflare preset uses TLS over TCP at `turns:turn.cloudflare.com:443?transport=tcp`; custom relays accept a `turn:` or `turns:` endpoint and an optional `?transport=udp` or `?transport=tcp`. Both relay choices require the issued **TURN username** and **TURN credential**. **Use relay only** forces the selected relay, which is useful when testing fallback connectivity. [Cloudflare endpoints](https://developers.cloudflare.com/realtime/turn/).

### Set up Cloudflare TURN

Selecting **Cloudflare TURN** reveals **Set up Cloudflare TURN** with these official instructions. The help stays hidden for no relay or Custom TURN:

1. Create a TURN key through your Cloudflare account using the [TURN documentation](https://developers.cloudflare.com/realtime/turn/).
2. Follow [Generate Credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/) from a trusted local terminal or private backend. Generate short-lived credentials for each participant, with a lifetime covering the session. Keep the administrative TURN key/API token outside this public application.
3. From the returned TURN `iceServers` entry, copy its `username` into **TURN username** and its `credential` into **TURN credential**. Select **Cloudflare TURN** on each participant's device before pairing. The app uses these temporary credentials directly; it does not call the credential-generation API or refresh expired credentials automatically.
4. When credentials expire, generate replacements, disconnect, and pair again. For a different relay provider or your own server, choose **Custom TURN** and enter that relay's endpoint and issued credentials.

Cloudflare TURN has a usage allowance and metered billing beyond it; review the [current pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/) for your account. No credentials or account are bundled. The app can remain a static browser application with manually issued credentials; automatic issuance would require a private helper that protects the provider API token.

The earlier room-code controls have been removed from Connect. The legacy broker implementation and low-level routing tests remain in the source tree, outside the current pairing workflow.

## Reconnection, authority, and drafts

Each approved device receives a random revocable reconnect credential. The host stores grants separately from the campaign in its browser's local storage; clients store only their own credential. Ordinary campaign exports contain neither. Restoring a backup onto another installation requires fresh pairing. Transport failures do not revoke saved permission, including a failure while delivering the first approved snapshot.

### Sleep and temporary interruptions

The application remains fully serverless. A WebRTC `disconnected` state retains the player's approval and the GM's pending approval request. On wake, page restoration, or network restoration, an approved client checks the existing connection by requesting a fresh authorized snapshot. It shows **reconnecting** and pauses player actions until the host returns a matching resynchronization acknowledgement. The browser reporting `connected`, or accepting a buffered send, is insufficient. Older hosts can confirm recovery with their returned snapshot.

The client retries this check every three seconds for up to 45 seconds of active recovery time. Duplicate wake events do not reset that deadline; a suspended/hidden client receives a fresh recovery window when it resumes. A closed or failed transport ends the attempt immediately. Missing images can be requested again after an interrupted transfer. Session observers, timers, and old connection callbacks cannot carry over into a replacement attempt.

If the phone's browser closes the transport or discards the tab, its original QR/text exchange cannot recreate it. That exchange belongs to a particular live session. With no always-on signaling service, a new invitation and response are still required. Even a short phone lock can end the browser's session; there is no guaranteed safe idle duration.

### Replacing a dead connection

1. On the GM's **Host a table** screen, open **Approved devices and revocation**, then choose **Reconnect device** beside the player. This closes that device's old transport and replaces any outstanding invitation without revoking its permission.
2. The player scans the fresh invitation and creates a response. Their name is remembered on this browser. The GM scans the response and selects **Connect player**.
3. A valid saved credential reconnects with the same member and character access, without another approval. Once admitted, only one live transport remains for that device.
4. If the credential is stale, the same new connection waits for explicit GM approval. It does not require the player to clear pairing. For a targeted device retry, the GM reviews the previous character assignments, approves, and issues a replacement token for the existing member. An invalid or revoked token alone never restores access or permits campaign data to be sent. A revoked device requires a new invitation and explicit approval.

Names persist across reloads. Live invitation/response text survives closing and reopening the dialog, but a page reload destroys the live WebRTC exchange. Creating an answer again for the same live invitation reuses the existing answer instead of invalidating the QR already being exchanged. Sending the same answer to the host twice is harmless; a different answer for an already-used invitation requires a fresh invitation.

A player response that never opens a channel expires after two minutes. Once the GM accepts a response, an attempt that does not open times out after 45 seconds. Waiting for an explicit GM approval has no fixed expiry while the connection remains alive. Failed attempts provide a retry instruction and retain saved approval. **Clear saved pairing** and **Revoke access** remain explicit permission-management actions, not reconnection steps.

### Recovery verification boundary

Unit regressions exercise silent channels despite native `connected` status, matching resync acknowledgements, bounded retries, late callbacks, grant retention when snapshot delivery fails, stale-token approval, invitation cleanup, and duplicate exchange handling. Browser tests use real local WebRTC channels. The repeated-rejoin scenario reloads the player three times to destroy each original transport, reuses its approval, repairs a deliberately stale credential with explicit GM approval, and verifies a shared roll afterward. A separate test drops control-channel messages while native WebRTC still reports connected, verifies retries before recovery, injects connection-state changes, and freezes/resumes Chrome's page lifecycle. These controlled tests do not establish reliable iPhone lock/wake recovery. The user's reported failure after less than a minute idle remains the required physical-device verification case, along with Wi-Fi/cellular switching and browser tab eviction.

### Shared actions and drafts

The host's domain processor validates the action and commits state/history before acknowledging it. Accepted command identifiers persist on the host; resubmitting the same identifier cannot repeat its effect. The current UI does not keep a durable outgoing command queue or automatically replay actions after a disconnect. If an acknowledgement is interrupted, reconnect and check the shared log before issuing the action again. The network derives actor and permissions from the live authenticated connection, ignoring claimed identity in the command. A reconnect receives a fresh authorized snapshot; history is sequenced within the visible projection. There is no automatic host election or background server keeping the table alive.

When disconnected, keep reading cached authorized material and prepare a separate character draft. Drafts currently cover description, notes, and extras; mechanical sheet changes remain GM-controlled. Drafts preserve the original character revision. The comparison helper identifies conflicting fields, and the GM cannot apply a stale proposal: review the latest sheet and start a fresh draft containing the changes you still want. Local drafts are local browser data until explicitly exported or submitted.

## Visibility and assets

Player projections exclude GM-only entities, hidden aspects, secret portraits and notes, unshared map revisions, private tokens/annotations, and events involving hidden characters/aspects. Assets are sent only if referenced by visible content. The host's command deduplication ledger and connection secrets are not replicated. Changing visibility cannot erase information that a player previously received or exported.

Control messages and assets use separate WebRTC data channels, small frames, and buffering limits. The client requests missing images after receiving their authorized metadata. Every received image is size-limited and checked against its SHA-256 digest and declared file signature. Live rolls publish immediately while new images download; incomplete image references appear after verification and the connection reports `syncing-assets` until then. Asset bytes are cached across subsequent snapshots, avoiding repeated map downloads. A reconnect can resend assets; partial transport frames are discarded and restarted, not resumed byte-for-byte.

## Verification status

QR pairing adds 35 unit tests for compression, normalized legacy text, direction/version validation, allocation limits, and real encoded-pixel round trips. Five browser regressions pass: a complete invitation/response PNG exchange with GM approval, secret filtering, and a shared roll; invalid-image rejection; complete copy/paste pairing with stale-response clearing; camera denial/cancellation/late-permission cleanup; and successful synthetic-camera decoding with track release. The image-pairing flow also checks a 390px player viewport. QR camera tests use simulated media; scanning between physical phones/computers remains a real-device check. The production build and offline regression pass with the QR libraries bundled locally. Their licenses are included in [LICENSE-QR.txt](../public/LICENSE-QR.txt).

The connection-settings update passes 202 unit tests across nine files, including 33 cases for endpoint validation, presets, credentials, and relay policy. Nine new browser tests verify host/player configuration at the WebRTC boundary, removal of room controls, settings locking, modal persistence, reload reset, credential exclusion from both backup modes, and a 390px layout. These tests intercept the peer constructor before networking; they verify configuration without contacting Cloudflare or a custom relay. All five QR pairing regressions and the production offline regression also pass with this update.

Earlier browser integration tests verified real two-context WebRTC connections, GM approval, hidden-content filtering, a generated PNG transfer, forged-role rejection, duplicate command handling, revocation, and a fresh peer connection using saved credentials. A second browser test verified one GM with seven independent player contexts, identical accepted dice history, and the eighth-player limit. The legacy broker's routing and closed-room behavior passed an integration test. Its former room-code UI test has been replaced by the current connection-settings and QR pairing tests.

The earlier peer tests use separate browser contexts on one development machine, not separate physical devices. The cached headless Chromium required test-only launch arguments `--disable-features=WebRtcHideLocalIpsWithMdns` and `--force-webrtc-ip-handling-policy=default` to gather usable local ICE candidates. QR and manual offer/answer exchange pass locally. The deployed-site test below adds separate Chrome processes without those overrides. Real devices on separate networks, forced TURN with supplied credentials, host-tab suspension, and mobile behavior remain release gates. Browser suspension can interrupt hosting; autosave and reconnect are the recovery path.

### Deployed-site two-client test

On November 6, 2026, two independent headless Chrome processes loaded `https://noddson.github.io/fatecc/` (build `2026.11.05254aa`) and passed copy/paste pairing with default WebRTC networking and no STUN or TURN. The GM opened the sample campaign, exchanged an invitation and answer with a fresh player browser, approved Mara Voss, and reached `connected` with a `direct` route. The player received shared journal content without the private entry. A GM roll and a player roll appeared on both clients with identical dice, totals, and activity counts. Native connection statistics confirmed a successful host-to-host candidate pair with bytes flowing in both directions. No application change was needed for this result.

The same workflow passed with Cloudflare STUN and Google STUN selected on both clients. Those connections also used host-to-host local routes. Both presets gathered server-reflexive (`srflx`) candidates as well, alongside a browser ICE error 701, `STUN host lookup received error.` Discovery therefore produced internet candidates despite the reported lookup error. These passes establish that local pairing still works with those settings; they do **not** verify STUN traversal between networks or explain a particular physical device's failure.

Repeat the test with an installed Playwright Chromium and its video recorder:

```sh
npx playwright install chromium ffmpeg
FATE_TEST_URL=https://noddson.github.io/fatecc npx playwright test tests/deployed-connection.spec.ts
# Run only the local route case:
FATE_TEST_URL=https://noddson.github.io/fatecc npx playwright test tests/deployed-connection.spec.ts --grep 'none STUN'
```

For an existing Chrome installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable instead of installing Chromium. The test launches two fresh processes with separate storage and native peer connections; its observer records diagnostics without changing ICE configuration or candidate handling. It is skipped unless `FATE_TEST_URL` is supplied, so the ordinary local suite does not contact public STUN services through these tests.

Each case saves GM/player videos, connected-state and shared-roll screenshots, and JSON with the deployed build, ICE settings/errors, candidate types, selected pair types, connection state, and byte counts. Diagnostics omit candidate addresses, SDP, and reconnect tokens. Videos show the invitation/answer exchange, so use these fresh test campaigns when sharing recordings. The default artifact directory is `test-results/`; pass `--output=output/live-connection` to keep a separate local evidence directory.

References: [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections), [TURN](https://webrtc.org/getting-started/turn-server), [data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels).

## Player identity and saved campaigns

The host's connection dialog shows **Players & characters** with each character assignment and the human player's name. Saved-device controls also name the assigned characters instead of just counting them. Character sheets, the live roster, and printed sheets show the player under the character name.

A joined player's **Make your move** choices contain only characters they currently control. Their character sheet, roll review, print selection, and local draft selection default to those assignments. Other shared characters remain visible as targets, teammates, and reference sheets, but their play controls and map tokens cannot be operated by that player. Assignment changes are checked against both the active grant and current character ownership.

**My campaigns → Joined campaigns** lists the saved authorized copies of previously joined campaigns, including an existing older “last player cache.” Each copy is labeled read-only. Opening one never turns it into a GM campaign or starts a connection. During a disconnection or recovery check, rolls, harm, invocations, stunt use, and token movement pause; viewing, printing, and exporting remain available. Local narrative drafts stay separate and do not modify the campaign. Play resumes only after the client confirms an active connection to the GM. The cache stores each campaign separately, so joining another table no longer replaces the only saved reference copy.

The mobile QR scanner requests the rear camera with a 4:3 capture preference and presents a full-width 3:4 portrait viewfinder, bounded by the screen height. It centers the preview in the dialog when scanning starts and uses a cover fit instead of narrow portrait letterboxing. Browser camera preferences are advisory: the actual sensor resolution and framing still depend on the device. Decoder and camera cleanup checks use synthetic browser streams; physical iPhone camera and sleep/wake verification remain outstanding.
