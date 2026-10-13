export const MUTATOR = Object.freeze({
  CLASSIC: 'classic',
  LOW_GRAVITY: 'low-gravity',
  ZERO_GRAVITY: 'zero-gravity',
  INFINITE_BOOST: 'infinite-boost',
});

export const MUTATORS = Object.freeze([
  { id: MUTATOR.CLASSIC, label: 'Klasik' },
  { id: MUTATOR.LOW_GRAVITY, label: 'Düşük yerçekimi' },
  { id: MUTATOR.ZERO_GRAVITY, label: 'Yerçekimsiz' },
  { id: MUTATOR.INFINITE_BOOST, label: 'Sınırsız boost' },
]);

const SETTINGS = Object.freeze({
  [MUTATOR.CLASSIC]: { gravityScale: 1, boostScale: 1, infiniteBoost: false },
  [MUTATOR.LOW_GRAVITY]: { gravityScale: 0.4, boostScale: 1, infiniteBoost: false },
  [MUTATOR.ZERO_GRAVITY]: { gravityScale: 0, boostScale: 1.35, infiniteBoost: false },
  [MUTATOR.INFINITE_BOOST]: { gravityScale: 1, boostScale: 1.5, infiniteBoost: true },
});

export function normalizeMutator(value) {
  return Object.hasOwn(SETTINGS, value) ? value : MUTATOR.CLASSIC;
}

export function mutatorLabel(value) {
  const id = normalizeMutator(value);
  return MUTATORS.find((mutator) => mutator.id === id).label;
}

export function configForMutator(config, value) {
  const settings = SETTINGS[normalizeMutator(value)];
  const physics = config.physics;
  return {
    ...config,
    physics: {
      ...physics,
      world: { ...physics.world, gravity: settings.gravityScale === 0 ? 0 : physics.world.gravity * settings.gravityScale },
      boost: {
        ...physics.boost,
        groundAccel: physics.boost.groundAccel * settings.boostScale,
        airAccel: physics.boost.airAccel * settings.boostScale,
      },
    },
    mutatorSettings: settings,
  };
}