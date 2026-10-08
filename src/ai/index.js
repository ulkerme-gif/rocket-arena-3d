import { BotController } from './BotController.js';

export { BotController };

/**
 * Bot factory used by the App. To plug in a different AI, return any object
 * implementing { update(gameState, dt) -> ControlState, reset?(), setDifficulty?(name) }.
 */
export function createBot(options) {
  return new BotController(options);
}
