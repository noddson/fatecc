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

Each approved device receives a random revocable reconnect credential. The host stores grants separately from the campaign in its browser's local storage; clients store only their own credential. Ordinary campaign exports contain neither. Restoring a backup onto another installation requires fresh pairing. Existing tokens for a revoked device are rejected until its saved pairing is cleared and the GM explicitly approves a new request.

The host's domain processor validates the action and commits state/history before acknowledging it. Accepted command identifiers persist on the host; resubmitting the same identifier cannot repeat its effect. The current UI does not keep a durable outgoing command queue or automatically replay actions after a disconnect. If an acknowledgement is interrupted, reconnect and check the shared log before issuing the action again. The network derives actor and permissions from the live authenticated connection, ignoring claimed identity in the command. A reconnect receives a fresh authorized snapshot; history is sequenced within the visible projection. There is no automatic host election or background server keeping the table alive.

When disconnected, keep reading cached authorized material and prepare a separate character draft. Drafts currently cover description, notes, and extras; mechanical sheet changes remain GM-controlled. Drafts preserve the original character revision. The comparison helper identifies conflicting fields, and the GM cannot apply a stale proposal: review the latest sheet and start a fresh draft containing the changes you still want. Local drafts are local browser data until explicitly exported or submitted.

## Visibility and assets

Player projections exclude GM-only entities, hidden aspects, secret portraits and notes, unshared map revisions, private tokens/annotations, and events involving hidden characters/aspects. Assets are sent only if referenced by visible content. The host's command deduplication ledger and connection secrets are not replicated. Changing visibility cannot erase information that a player previously received or exported.

Control messages and assets use separate WebRTC data channels, small frames, and buffering limits. The client requests missing images after receiving their authorized metadata. Every received image is size-limited and checked against its SHA-256 digest and declared file signature. Live rolls publish immediately while new images download; incomplete image references appear after verification and the connection reports `syncing-assets` until then. Asset bytes are cached across subsequent snapshots, avoiding repeated map downloads. A reconnect can resend assets; partial transport frames are discarded and restarted, not resumed byte-for-byte.

## Verification status

QR pairing adds 35 unit tests for compression, normalized legacy text, direction/version validation, allocation limits, and real encoded-pixel round trips. Five browser regressions pass: a complete invitation/response PNG exchange with GM approval, secret filtering, and a shared roll; invalid-image rejection; complete copy/paste pairing with stale-response clearing; camera denial/cancellation/late-permission cleanup; and successful synthetic-camera decoding with track release. The image-pairing flow also checks a 390px player viewport. QR camera tests use simulated media; scanning between physical phones/computers remains a real-device check. The production build and offline regression pass with the QR libraries bundled locally. Their licenses are included in [LICENSE-QR.txt](../public/LICENSE-QR.txt).

The connection-settings update passes 202 unit tests across nine files, including 33 cases for endpoint validation, presets, credentials, and relay policy. Nine new browser tests verify host/player configuration at the WebRTC boundary, removal of room controls, settings locking, modal persistence, reload reset, credential exclusion from both backup modes, and a 390px layout. These tests intercept the peer constructor before networking; they verify configuration without contacting Cloudflare or a custom relay. All five QR pairing regressions and the production offline regression also pass with this update.

Earlier browser integration tests verified real two-context WebRTC connections, GM approval, hidden-content filtering, a generated PNG transfer, forged-role rejection, duplicate command handling, revocation, and a fresh peer connection using saved credentials. A second browser test verified one GM with seven independent player contexts, identical accepted dice history, and the eighth-player limit. The legacy broker's routing and closed-room behavior passed an integration test. Its former room-code UI test has been replaced by the current connection-settings and QR pairing tests.

The peer tests use separate browser contexts on one development machine, not separate physical devices. The cached headless Chromium required test-only launch arguments `--disable-features=WebRtcHideLocalIpsWithMdns` and `--force-webrtc-ip-handling-policy=default` to gather usable local ICE candidates. QR and manual offer/answer exchange pass locally. This validates the application protocol locally; it does not establish normal-browser interoperability or NAT reliability. Real devices on separate networks, forced TURN with supplied credentials, host-tab suspension, and mobile behavior remain release gates. Browser suspension can interrupt hosting; autosave and reconnect are the recovery path.

References: [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections), [TURN](https://webrtc.org/getting-started/turn-server), [data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels).
