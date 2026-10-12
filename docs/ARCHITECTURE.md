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
- **Guests**: send controls ~60 Hz (`{type:'input', controls:{…, sequence, timestamp}}`) and render the host's 30 Hz compact snapshots (`src/net/snapshot.js`) with `RemoteGameView` (100 ms interpolation, bounded local prediction).
- **Transport**: `src/net/PeerTransport.js` wraps PeerJS. The room code maps to the host's PeerJS id (`rocket-arena-3d-<CODE>`). One reliable, ordered JSON data channel per guest, plus an application keepalive (ping every 1.5 s, 8 s silence = disconnected) because WebRTC close events are not guaranteed on iPad.
- **Protocol** (host → guest): `joined`, `roomStatus` (`waiting` | `playing` + `padLayout`), `roster`, `snapshot`, `goal`, `matchEnd`, `notice`, `roomClosed`, `error`. Guest → host: `join` (with `version`), `input`, `leave`. Host-only (local): `start`, `rematch`. `PROTOCOL_VERSION` lives in `src/net/roomCode.js`.

## Touch input (iPad without keyboard)

- `src/input/TouchControls.js`: floating analog stick (`[data-touch-stick]`) + buttons (`[data-touch-action]`). Pointer events, global move/up listeners, slide between buttons, everything released on hide / blur / visibility change.
- `stickToControls(x, y)` maps the stick to `{steer, throttle, pitch}`; `InputManager.poll()` uses it whenever the stick is touched, so bots, keyboard, gamepad and touch all produce the same `ControlState`.
