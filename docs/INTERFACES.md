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
