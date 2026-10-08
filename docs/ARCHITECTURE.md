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
