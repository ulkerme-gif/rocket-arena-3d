import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, steps, seeded } from './helpers.js';
import { BotController } from '../src/ai/BotController.js';
import { CONFIG } from '../src/config/index.js';
import { MODE } from '../src/game/constants.js';

test('bot vs idle opponent: the bot touches the ball and scores', async () => {
  const sim = await createSim({ mode: MODE.MATCH, players: [{ id: 'player', team: 'blue' }, { id: 'bot', team: 'orange', kind: 'bot' }] });
  sim.attachBot('bot', new BotController({ carId: 'bot', team: 'orange', config: CONFIG.bot, random: seeded(3) }));
  let touches = 0, goals = 0, ownGoals = 0;
  sim.events.on('ballHit', (e) => e.carId === 'bot' && touches++);
  sim.events.on('goal', (e) => (e.team === 'orange' ? goals++ : ownGoals++));
  steps(sim, 120, () => ({}));
  console.log(`  bot vs idle (120 s): touches=${touches} goals=${goals} ownGoals=${ownGoals}`);
  assert.ok(touches >= 5, `touches ${touches}`);
  assert.ok(goals >= 1, `goals ${goals}`);
  sim.dispose();
});

test('bot vs bot: 3 simulated minutes, both bots play, no numerical problems', async () => {
  const sim = await createSim({ mode: MODE.MATCH, players: [{ id: 'b1', team: 'blue', kind: 'bot' }, { id: 'b2', team: 'orange', kind: 'bot' }] });
  sim.attachBot('b1', new BotController({ carId: 'b1', team: 'blue', config: CONFIG.bot, random: seeded(5) }));
  sim.attachBot('b2', new BotController({ carId: 'b2', team: 'orange', config: CONFIG.bot, random: seeded(9) }));
  const touches = { blue: 0, orange: 0 };
  let warnings = 0;
  sim.events.on('ballHit', (e) => touches[e.team]++);
  sim.events.on('warning', () => warnings++);
  steps(sim, 180, () => ({}), () => {
    for (const c of sim.cars) assert.ok(Number.isFinite(c.position.x + c.position.y + c.position.z), 'NaN car position');
    const p = sim.ball.position;
    assert.ok(Number.isFinite(p.x + p.y + p.z), 'NaN ball position');
  });
  console.log(`  bot vs bot (180 s): score ${JSON.stringify(sim.rules.score)} touches ${JSON.stringify(touches)} warnings=${warnings}`);
  assert.ok(touches.blue >= 3 && touches.orange >= 3, JSON.stringify(touches));
  assert.equal(warnings, 0);
  sim.dispose();
});
