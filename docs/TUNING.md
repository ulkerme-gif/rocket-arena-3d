# Tuning

- Core physics parameters: `src/config/physics.js` (gravity, acceleration, jump/flip, boost, ball).
- Fixed tick: `src/config/physics.js` `world.tickRate`; App uses it for GameLoop timing.
- AI difficulty: `src/config/bot.js`, exposed in the Settings UI.
- Camera: `src/config/camera.js`; FOV, distance, shadows and default ball camera are user settings.
- Match length and score: `src/config/rules.js`.
- Stadium dimensions/boost pads: `src/config/arena.js`.

Validate physics changes with `npm test` and gameplay changes with a real browser; test numbers alone cannot prove that the car handling feels like Rocket League.
