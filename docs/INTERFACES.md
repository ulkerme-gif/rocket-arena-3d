# Integration contracts

Coordinates: +Y up; the arena's long axis is Z, car forward is local -Z. 1 unit = 1 meter.

## Headless simulation

```js
await RAPIER.init();
const sim = new Simulation({
  RAPIER, config: CONFIG, mode: 'match',
  players: [{ id: 'player', team: 'blue', kind: 'human' }, { id: 'opponent', team: 'orange', kind: 'bot' }],
});
sim.attachBot('opponent', new BotController({carId:'opponent',team:'orange',config:CONFIG.bot}));
sim.start();
sim.step({ player: { throttle: 1, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false } });
const snapshot = sim.getState();
```

`Simulation.step()` advances **exactly one fixed timestep**. The frontend's `GameLoop` calls it at 120 Hz when unpaused. `Simulation.dispose()` frees the Rapier world when leaving a game.

## Bot extension

`BotController.update(gameState, dt) -> ControlState`.
`gameState` is exactly `sim.getState()`. Allowed outputs: `throttle`, `steer`, `pitch`, `yaw`, `roll` in [-1, 1], plus `jump`, `boost`, `handbrake` booleans. A bot must NOT call physics bodies directly.

## Visuals

`new Renderer(canvas, CONFIG)`, `new ArenaView(renderer.scene, sim.geometry, renderer.renderer)`, `new GameView(renderer, sim)`, `new CameraRig(renderer.camera, CONFIG.camera)`.
GameView updates using `gameView.update(alpha, frameDt)` and camera takes interpolated car / ball transforms. ArenaView is created once by App and reused between sessions.

## Game states

- `mode`: `'match'`, `'training'`, `'demo'`
- `phase`: `'idle'`, `'countdown'`, `'playing'`, `'goal'`, `'ended'`
- `score`: `{blue, orange}`
- `timeRemaining`, `overtimeElapsed`, `isOvertime`
- `cars[]`: id, team, position, quaternion, velocity, boost, flags
- `ball`: position, velocity, angularVelocity, radius, enabled
- `boostPads[]`: position, big, active, timer

Events: `goal`, `ballHit`, `boostPickup`, `countdown`, `kickoff`, `phase`, `overtime`, `matchEnd`, `warning` and car events.

## Extension boundaries

Graphics AI: edit `src/visuals`, `src/styles`, and HTML UI. Avoid writing physics transforms.
Bot AI: edit `src/ai` only and preserve the BotController contract.
QA AI: propose patches with tests; do not make assumptions about successfully running browser tests.

## Online host (no server)

```js
const match = new MatchHost({ RAPIER, roomCode: 'K7M2', teamSize: 2 });
match.join(localHandle, 'Ev Sahibi', { local: true });   // handle = { send(payload) }
match.handlePacket(guestLink, { type: 'join', name, version: PROTOCOL_VERSION });
match.handlePacket(localHandle, { type: 'start' });       // bots fill empty seats
match.setLocalControls(localHandle, controls);            // host car, every frame
match.step();                                             // one fixed tick
match.leave(guestLink);                                   // seat goes back to a bot
```

Seat ids: `blue-1..3`, `orange-1..3` (`seatList(teamSize)` in `src/game/teams.js`). In single-player the human car keeps the id `player`.

## Touch

`stickToControls(x, y)` (x right, y down, unit circle) → `{ steer, throttle, pitch, engaged }`. Dead zone 0.12; full lock at 85 % deflection; full gas from a small push up; reverse needs a deliberate pull.
