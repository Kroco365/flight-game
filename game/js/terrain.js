// Meridian Run — the world.
// A seeded archipelago: five islands in a blue sea, a home island with a
// runway on a 090 heading, golden target rings strung along the mail routes,
// drifting clouds and a low sun. The same seed always builds the same world.

// A small deterministic generator (mulberry32) so a seed rebuilds one world.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The archipelago. `seed` fixes the jitter of every island and cloud, so a
// screenshot scene and a replayed sortie see identical terrain.
export function buildWorld(seed) {
  const rand = seededRandom(seed);
  const jitter = (amount) => (rand() - 0.5) * 2 * amount;

  // Five islands: home at the origin, then four stepping north-east along
  // the mail route, each with a radius, a hill height and a palm count.
  const islands = [
    { name: 'Home', x: 0, z: 0, radius: 420, height: 26, palms: 14 },
    { name: 'Turtle', x: 380 + jitter(90), z: 1500, radius: 300, height: 64, palms: 9 },
    { name: 'Twin', x: -520 + jitter(90), z: 2900, radius: 340, height: 48, palms: 11 },
    { name: 'Lantern', x: 640 + jitter(110), z: 4300, radius: 260, height: 88, palms: 7 },
    { name: 'Farlight', x: -180 + jitter(120), z: 5800, radius: 380, height: 58, palms: 12 },
  ];

  // Palm trees sit on the island rims, seeded so they never move.
  for (const island of islands) {
    island.trees = [];
    for (let i = 0; i < island.palms; i++) {
      const angle = rand() * Math.PI * 2;
      const reach = island.radius * (0.45 + rand() * 0.45);
      island.trees.push({
        x: island.x + Math.cos(angle) * reach,
        z: island.z + Math.sin(angle) * reach,
        lean: (rand() - 0.5) * 0.3,
        size: 0.8 + rand() * 0.5,
      });
    }
  }

  // The runway lies east-west across the home island, heading 090, a strip
  // 320 metres long and 26 wide, threshold at the western end.
  const runway = {
    x: 0, z: 0, length: 320, width: 26, heading: Math.PI / 2,
    thresholdX: -160, thresholdZ: 0,
  };

  // Clouds drift slowly across the whole route, high above the sea.
  // Their seed also fixes the sun-glitter pattern on the water below.
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: -1600 + rand() * 3200,
      z: -600 + rand() * 6800,
      alt: 520 + rand() * 260,
      size: 90 + rand() * 170,
      speed: 2 + rand() * 4,
      puffs: 3 + Math.floor(rand() * 3),
    });
  }

  return { seed, islands, runway, clouds };
}

// Rings for one sortie: golden hoops the pilot threads in order. Each ring
// sits above the sea or an island shoulder, 40 metres across.
export function buildRings(world, waypoints) {
  return waypoints.map((point, index) => ({
    index,
    x: point.x,
    z: point.z,
    alt: point.alt,
    radius: point.radius ?? 40,
    passed: false,
  }));
}

// Height of the ground under a point: an island hill where one stands, the
// flat runway strip on Home, open sea (zero) everywhere else. Along-track
// is measured with the heading convention used everywhere else: heading 0
// is north (+z), PI/2 is east (+x), so the runway's direction vector is
// (sin heading, cos heading).
export function groundHeightAt(world, x, z) {
  const runway = world.runway;
  const along = (x - runway.x) * Math.sin(runway.heading) + (z - runway.z) * Math.cos(runway.heading);
  const across = (x - runway.x) * Math.cos(runway.heading) - (z - runway.z) * Math.sin(runway.heading);
  if (Math.abs(along) <= runway.length / 2 && Math.abs(across) <= runway.width / 2) return 0;

  let height = 0;
  for (const island of world.islands) {
    const dx = x - island.x;
    const dz = z - island.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < island.radius) {
      const falloff = 1 - dist / island.radius;
      height = Math.max(height, island.height * falloff * falloff);
    }
  }
  return height;
}

// True when a point is over the runway strip, for touchdown checks.
export function overRunway(world, x, z) {
  const runway = world.runway;
  const along = (x - runway.x) * Math.sin(runway.heading) + (z - runway.z) * Math.cos(runway.heading);
  const across = (x - runway.x) * Math.cos(runway.heading) - (z - runway.z) * Math.sin(runway.heading);
  return Math.abs(along) <= runway.length / 2 && Math.abs(across) <= runway.width / 2;
}

// True when a point is over dry land (an island), rather than open sea.
export function overLand(world, x, z) {
  return groundHeightAt(world, x, z) > 0.5;
}

// Sky palettes for the sorties: morning gold, storm grey, and dusk violet.
export const PALETTES = {
  day: {
    skyTop: '#2f6fb4', skyMid: '#7db6e4', skyLow: '#cfe8f7',
    sea: '#1d6f9e', seaDeep: '#0f4a72', sun: '#ffd66b',
    island: '#3f8f4f', islandDark: '#2c6b38', sand: '#e8d9a0',
    ring: '#ffc93c', ringGlow: 'rgba(255,201,60,0.45)',
    cloud: 'rgba(255,255,255,0.92)', haze: 'rgba(207,232,247,0.35)',
  },
  storm: {
    skyTop: '#4a5568', skyMid: '#7a8a9c', skyLow: '#b8c4cc',
    sea: '#2c5a6e', seaDeep: '#17384a', sun: '#e8e0c0',
    island: '#3a7a48', islandDark: '#285530', sand: '#d8c890',
    ring: '#ffc93c', ringGlow: 'rgba(255,201,60,0.4)',
    cloud: 'rgba(226,232,238,0.85)', haze: 'rgba(184,196,204,0.4)',
  },
  dusk: {
    skyTop: '#2b2350', skyMid: '#7a4a72', skyLow: '#e08a5a',
    sea: '#3a2f5e', seaDeep: '#241d40', sun: '#ff9a4d',
    island: '#2f5e3a', islandDark: '#1f4227', sand: '#c9a86a',
    ring: '#ffd75e', ringGlow: 'rgba(255,215,94,0.5)',
    cloud: 'rgba(255,190,160,0.75)', haze: 'rgba(224,138,90,0.3)',
  },
};
