import test from 'node:test';
import assert from 'node:assert/strict';
import { BotController } from '../src/ai/BotController.js';
import { CONFIG } from '../src/config/index.js';
import { seatList, normalizeTeamSize, formatLabel, TEAM_SIZES } from '../src/game/teams.js';
import { createSim, steps, seeded } from './helpers.js';

async function botMatch(teamSize, seed = 1) {
  const seats = seatList(teamSize);
  const sim = await createSim({ mode: 'match', random: seeded(seed), players: seats.map((s) => ({ ...s, kind: 'bot' })) });
  for (const s of seats) {
    sim.attachBot(s.id, new BotController({ carId: s.id, team: s.team, config: CONFIG.bot, difficulty: 'normal', random: seeded(seed * 17 + s.id.length) }));
  }
  return sim;
}

test('team sizes and seat ids', () => {
  assert.deepEqual(TEAM_SIZES, [1, 2, 3]);
  assert.equal(normalizeTeamSize('3'), 3);
  assert.equal(normalizeTeamSize(7), 1);
  assert.equal(formatLabel(2), '2V2');
  assert.deepEqual(seatList(2).map((s) => s.id), ['blue-1', 'blue-2', 'orange-1', 'orange-2']);
});

test('2v2 kickoff: exactly one bot per team goes for the ball, the other covers', async () => {
  const sim = await botMatch(2, 4);
  steps(sim, CONFIG.rules.countdown + 0.3);
  for (const team of ['blue', 'orange']) {
    const modes = [...sim.bots.values()].filter((b) => b.team === team).map((b) => b.plan?.mode).sort();
    assert.deepEqual(modes, ['kickoff', 'support'], `${team}: ${modes}`);
  }
  sim.dispose();
});

test('3v3 all-bot match stays stable and actually plays the ball', async () => {
  const sim = await botMatch(3, 2);
  let hits = 0;
  sim.events.on('ballHit', () => hits++);
  steps(sim, 30, () => ({}), () => {
    for (const car of sim.cars) {
      const p = car.position;
      assert.ok(Number.isFinite(p.x + p.y + p.z), `${car.id} position is finite`);
    }
  });
  assert.equal(sim.cars.length, 6);
  assert.ok(hits >= 5, `ball touched ${hits} times in 30 s`);
  const roles = new Set([...sim.bots.values()].map((b) => b.plan?.mode));
  assert.ok(roles.size >= 2, `bots use different roles: ${[...roles]}`);
  sim.dispose();
});
