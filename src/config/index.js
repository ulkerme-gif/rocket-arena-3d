import { PHYSICS } from './physics.js';
import { ARENA } from './arena.js';
import { RULES } from './rules.js';
import { CAMERA } from './camera.js';
import { CONTROLS } from './controls.js';
import { BOT } from './bot.js';
import { GRAPHICS } from './graphics.js';

/**
 * Global configuration object. Systems receive the sub-object they need.
 * It is intentionally mutable so the settings menu can tweak values live.
 */
export const CONFIG = { physics: PHYSICS, arena: ARENA, rules: RULES, camera: CAMERA, controls: CONTROLS, bot: BOT, graphics: GRAPHICS };

export { PHYSICS, ARENA, RULES, CAMERA, CONTROLS, BOT, GRAPHICS };
