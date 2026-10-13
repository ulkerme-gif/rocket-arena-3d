# Architecture

- `src/main.js` awaits Rapier WASM initialization, then instantiates `App`.
- `App` is the browser composition root; it owns `Renderer`, `ArenaView`, `CameraRig`, `InputManager`, `Settings`, `GameLoop` and the active `Simulation`/`GameView` pair.
- `Simulation` is renderer- and DOM-independent; it is step-driven at a fixed time step and owns physics, cars, ball, match rules, pads, bot updates and event dispatch.
- `GameLoop` executes fixed physics steps and calls per-frame rendering; pause stops stepping but not rendering.
- `GameView` copies interpolated transforms from cars and the ball. It never owns physics bodies.
- `CameraRig` operates on Three.js vectors and interpolated car/ball transforms.
- DOM HUD reads immutable state snapshots from `Simulation.getState()`; settings write only to the mutable `CONFIG` object.
- Bots issue human-shaped `ControlState`, not teleports or direct rigid body mutations.

The HTML frontend does not change the simulation's API. The original WIP architecture is preserved.

## Online (serverless, since 2026-10-12)

- `online.html` → `src/online-main.js`. No WebSocket server exists any more; `server/`, `render.yaml` and the Pi scripts were removed.
- **Host tablet** (whoever presses ODA KUR): `MatchHost` (`src/net/MatchHost.js`) owns the authoritative `Simulation` for one room. Every car is a seat (`blue-1..N`, `orange-1..N`, see `src/game/teams.js`); empty seats get a `BotController`. Mid-match joins take over a bot seat, leavers are replaced by a bot. The host's own car is fed by `setLocalControls()` every frame and rendered with the normal `GameView` at render-alpha (zero latency). The host steps the simulation at `CONFIG.physics.world.tickRate` (120 Hz) inside its `requestAnimationFrame` loop via `advanceAccumulator()`.
- **Guests**: send controls ~60 Hz (`{type:'input', controls:{…, sequence, timestamp}}`) and render the host's compact snapshots (`src/net/snapshot.js`, 60 Hz; 40 Hz in 3v3) with `RemoteGameView`. `SnapshotTimeline` places snapshots on the host's simulation clock (tick / tickRate), runs a playback clock that is nudged (±10 % speed) toward "newest minus an adaptive buffer" (1.5 snapshot intervals + p95 network jitter, 30–160 ms). Every car, including the guest's own, and the ball use that one timeline: no client prediction, so the chase camera never jitters and ball contacts look consistent.
- **Skins**: `src/visuals/skins.js` (data model, validation, 512² texture atlas with one strip per car side and one for the roof; `bodyUVGenerator` maps the extruded body onto it so numbers/drawings read correctly on both sides). `CarView.setSkin()`; edited in the GARAJ screen (`src/ui/Garage.js`, index.html `#garage`), stored in localStorage, sent with `join`, distributed in `roster.seats[].skin`.
- **Name tags**: `src/visuals/NameTags.js`, HTML labels projected above each car's render group every frame (offline: bots; online: everyone except yourself, from the roster).
- **ICE**: `src/config/network.js` (STUN list + optional TURN credentials) replaces PeerJS' default ICE list, whose free TURN servers were discontinued. `src/net/networkCheck.js` powers the lobby's BAĞLANTIYI TEST ET (broker reachability, srflx/relay candidates). Join failures are classified as `peer-unavailable` (no room), `no-answer` (host never answered the offer: asleep / backgrounded), `ice-timeout` / `webrtc` (answered but no network path: needs TURN) or `broker-timeout`.
- **Transport**: `src/net/PeerTransport.js` wraps PeerJS. The room code maps to the host's PeerJS id (`rocket-arena-3d-<CODE>`). One reliable, ordered JSON data channel per guest, plus an application keepalive (ping every 1.5 s, 8 s silence = disconnected) because WebRTC close events are not guaranteed on iPad.
- **Protocol** (host → guest): `joined`, `roomStatus` (`waiting` | `playing` + `padLayout`), `roster`, `snapshot`, `goal`, `matchEnd`, `notice`, `roomClosed`, `error`. Guest → host: `join` (with `version`), `input`, `leave`. Host-only (local): `start`, `rematch`. `PROTOCOL_VERSION` lives in `src/net/roomCode.js`.

## Touch input (iPad without keyboard)

- `src/input/TouchControls.js`: floating analog stick (`[data-touch-stick]`) + buttons (`[data-touch-action]`). Pointer events, global move/up listeners, slide between buttons, everything released on hide / blur / visibility change.
- `stickToControls(x, y)` maps the stick to `{steer, throttle, pitch}`; `InputManager.poll()` uses it whenever the stick is touched, so bots, keyboard, gamepad and touch all produce the same `ControlState`.
