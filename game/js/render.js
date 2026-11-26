// Meridian Run — the chase-view renderer.
// Everything the pilot sees: sky, sun and drifting clouds, a tilting horizon,
// sea glitter, islands and the runway in simple perspective, golden rings,
// the mail plane in the middle of the frame, and the instruments lit along
// the edges. Menus and debrief screens are drawn here too.

import { PALETTES, groundHeightAt } from './terrain.js';
import { missionTotal } from './missions.js';

// Project a world point into screen space. Returns null when it is behind
// the plane. `focal` is the perspective strength in pixels.
export function project(plane, point, focal, cx, horizonY) {
  const dx = point.x - plane.x;
  const dz = point.z - plane.z;
  const forward = dx * Math.sin(plane.heading) + dz * Math.cos(plane.heading);
  if (forward < 8) return null;
  const lateral = dx * Math.cos(plane.heading) - dz * Math.sin(plane.heading);
  const scale = focal / forward;
  return {
    x: cx + lateral * scale,
    y: horizonY - (point.alt - plane.alt) * scale,
    scale,
    depth: forward,
  };
}

// A deterministic sparkle: the same index always lands on the same speck.
function glitterSpot(index, width, time) {
  const a = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  const b = Math.sin(index * 269.5 + 183.3) * 28001.8384;
  const x = (a - Math.floor(a)) * width;
  const phase = (b - Math.floor(b)) * Math.PI * 2;
  return { x, twinkle: 0.25 + 0.55 * Math.abs(Math.sin(time * 0.7 + phase)) };
}

function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Draw the world: sky, sea, islands, runway, rings, clouds and the plane.
export function drawWorld(ctx, game, time) {
  const { plane, world, mission, palette } = game;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const focal = h * 0.95;
  const horizonY = cy + plane.pitch * focal * 0.9;

  // Sky: a vertical gradient in the sortie's palette.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.55, palette.skyMid);
  sky.addColorStop(0.75, palette.skyLow);
  sky.addColorStop(1, palette.seaDeep);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  // Roll the whole world with the bank, around the centre of the frame.
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank);
  ctx.translate(-cx, -cy);

  // The sun hangs in the sky, low and warm.
  const sunX = cx + w * 0.30;
  const sunY = Math.max(40, horizonY - h * 0.30);
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
  sunGlow.addColorStop(0, palette.sun);
  sunGlow.addColorStop(0.35, palette.sun);
  sunGlow.addColorStop(1, 'rgba(255,214,107,0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
  ctx.fillStyle = palette.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
  ctx.fill();

  // Sea: everything below the horizon, deepening towards the bottom.
  const sea = ctx.createLinearGradient(0, horizonY, 0, h);
  sea.addColorStop(0, palette.sea);
  sea.addColorStop(1, palette.seaDeep);
  ctx.fillStyle = sea;
  ctx.fillRect(-w, horizonY, w * 3, h * 2);

  // Sun glitter: speckles on the water under the sun.
  ctx.fillStyle = 'rgba(255,236,170,0.8)';
  for (let i = 0; i < 110; i++) {
    const spot = glitterSpot(i, w, time);
    const band = horizonY + 8 + ((i * 37) % 220);
    if (band > h) continue;
    const nearSun = 1 - Math.min(1, Math.abs(spot.x - sunX) / (w * 0.45));
    ctx.globalAlpha = spot.twinkle * nearSun * 0.7;
    ctx.fillRect(spot.x, band, 7, 2);
  }
  ctx.globalAlpha = 1;

  // Far islands first, near ones last, so near land overlaps far land.
  const sorted = [...world.islands].sort((a, b) => {
    const da = (a.x - plane.x) ** 2 + (a.z - plane.z) ** 2;
    const db = (b.x - plane.x) ** 2 + (b.z - plane.z) ** 2;
    return db - da;
  });
  for (const island of sorted) drawIsland(ctx, game, island, focal, cx, horizonY);
  drawRunway(ctx, game, focal, cx, horizonY);
  drawRings(ctx, game, focal, cx, horizonY);
  drawClouds(ctx, game, focal, cx, horizonY);

  // A soft haze band right at the horizon to blend sea into sky: a
  // gradient that fades out above and below, never a solid slab.
  const haze = ctx.createLinearGradient(0, horizonY - 18, 0, horizonY + 18);
  haze.addColorStop(0, 'rgba(207,232,247,0)');
  haze.addColorStop(0.5, palette.haze);
  haze.addColorStop(1, 'rgba(207,232,247,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(-w, horizonY - 18, w * 3, 36);

  ctx.restore();

  drawPlane(ctx, game, cx, cy);
}

// One island: a sand rim, a green mound with a hill, and its palm trees.
function drawIsland(ctx, game, island, focal, cx, horizonY) {
  const { plane, palette } = game;
  const base = project(plane, { x: island.x, z: island.z, alt: 0 }, focal, cx, horizonY);
  if (!base) return;
  const radiusPx = island.radius * base.scale;
  if (radiusPx < 2) return;
  const top = project(plane, { x: island.x, z: island.z, alt: island.height }, focal, cx, horizonY);
  const topY = top ? top.y : base.y - island.height * base.scale;

  // Sand rim, then the green body rising to the hilltop.
  ctx.fillStyle = palette.sand;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, radiusPx, radiusPx * 0.30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.island;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y - radiusPx * 0.06, radiusPx * 0.94, radiusPx * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.islandDark;
  ctx.beginPath();
  ctx.ellipse(base.x, topY + radiusPx * 0.16, radiusPx * 0.45, radiusPx * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Palm trees on the rim, leaning a little, drawn as a trunk and a crown.
  // A palm is about 10 metres tall, so its height on screen is 10 * scale.
  for (const tree of island.trees) {
    const ground = groundHeightAt(game.world, tree.x, tree.z);
    const point = project(plane, { x: tree.x, z: tree.z, alt: ground }, focal, cx, horizonY);
    if (!point || point.scale < 0.02) continue;
    const size = 10 * tree.size * point.scale;
    if (size < 2 || size > 120) continue;
    ctx.strokeStyle = '#5a3d24';
    ctx.lineWidth = Math.max(1, size * 0.09);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + tree.lean * size, point.y - size);
    ctx.stroke();
    ctx.fillStyle = palette.islandDark;
    ctx.beginPath();
    ctx.arc(point.x + tree.lean * size, point.y - size, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The runway: a grey trapezoid in perspective with centreline dashes and
// white threshold bars, sitting flat on the home island.
function drawRunway(ctx, game, focal, cx, horizonY) {
  const { plane, world } = game;
  const runway = world.runway;
  const halfL = runway.length / 2;
  const halfW = runway.width / 2;
  const corners = [
    { x: runway.x - halfL, z: runway.z - halfW, alt: 0 },
    { x: runway.x + halfL, z: runway.z - halfW, alt: 0 },
    { x: runway.x + halfL, z: runway.z + halfW, alt: 0 },
    { x: runway.x - halfL, z: runway.z + halfW, alt: 0 },
  ].map((corner) => project(plane, corner, focal, cx, horizonY));
  if (corners.some((corner) => !corner)) return;
  ctx.fillStyle = '#3c4148';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Centreline dashes along the strip.
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = 2;
  for (let t = -0.42; t <= 0.42; t += 0.14) {
    const a = project(plane, { x: runway.x + t * runway.length, z: runway.z, alt: 0.4 }, focal, cx, horizonY);
    const b = project(plane, { x: runway.x + (t + 0.07) * runway.length, z: runway.z, alt: 0.4 }, focal, cx, horizonY);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

// The golden rings: the next one glows, passed ones turn green, the rest
// sit faint ahead. Each is an ellipse that grows as the plane closes in.
function drawRings(ctx, game, focal, cx, horizonY) {
  const { plane, mission, palette } = game;
  if (!mission) return;
  for (const ring of mission.rings) {
    const point = project(plane, ring, focal, cx, horizonY);
    if (!point) continue;
    const radius = ring.radius * point.scale;
    if (radius < 3 || radius > 900) continue;
    const isNext = ring.index === mission.ringIndex;
    const alpha = isNext ? 1 : ring.passed ? 0.55 : 0.35;
    ctx.globalAlpha = alpha;
    if (isNext) {
      ctx.strokeStyle = palette.ringGlow;
      ctx.lineWidth = radius * 0.28;
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, radius, radius * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = ring.passed ? '#7ed957' : palette.ring;
    ctx.lineWidth = Math.max(2, radius * 0.09);
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, radius, radius * 0.52, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (isNext && radius > 14) {
      ctx.fillStyle = '#fff7d6';
      ctx.font = `bold ${Math.max(11, Math.min(22, radius * 0.3))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${ring.index + 1}`, point.x, point.y - radius * 0.62);
    }
    ctx.globalAlpha = 1;
  }
}

// Clouds: soft white puffs floating above the route, drifting with time.
function drawClouds(ctx, game, focal, cx, horizonY) {
  const { plane, world, palette, elapsed } = game;
  ctx.fillStyle = palette.cloud;
  for (const cloud of world.clouds) {
    const drift = cloud.x + elapsed * cloud.speed;
    const point = project(plane, { x: drift, z: cloud.z, alt: cloud.alt }, focal, cx, horizonY);
    if (!point) continue;
    const size = cloud.size * point.scale;
    if (size < 4 || size > 700) continue;
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < cloud.puffs; i++) {
      const offsetX = (i - cloud.puffs / 2) * size * 0.55;
      const puff = size * (0.55 + (i % 2) * 0.2);
      ctx.beginPath();
      ctx.ellipse(point.x + offsetX, point.y - size * 0.1, puff, puff * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// The mail plane itself, seen from behind: cream fuselage, red cheatline,
// brown wings, a tail and a spinning propeller blur. It banks with the plane.
function drawPlane(ctx, game, cx, cy) {
  const { plane } = game;
  const scale = 1.15;
  ctx.save();
  ctx.translate(cx, cy + 26);
  ctx.rotate(plane.bank * 0.9);
  ctx.scale(scale, scale);

  // Propeller blur: a pale spinning disc ahead of the nose.
  ctx.fillStyle = 'rgba(220,225,230,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -58, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tailplane and fin.
  ctx.fillStyle = '#8a5a33';
  ctx.beginPath();
  ctx.moveTo(-26, 34);
  ctx.lineTo(26, 34);
  ctx.lineTo(16, 44);
  ctx.lineTo(-16, 44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a34d2d';
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(-7, 12);
  ctx.lineTo(7, 12);
  ctx.closePath();
  ctx.fill();

  // Fuselage: a tapered cream body with a red cheatline.
  ctx.fillStyle = '#f2e6c9';
  ctx.beginPath();
  ctx.moveTo(0, -62);
  ctx.quadraticCurveTo(13, -30, 11, 18);
  ctx.quadraticCurveTo(10, 40, 0, 44);
  ctx.quadraticCurveTo(-10, 40, -11, 18);
  ctx.quadraticCurveTo(-13, -30, 0, -62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(-11, -6, 22, 5);
  ctx.fillStyle = '#2c3e50';
  ctx.beginPath();
  ctx.ellipse(0, -34, 7, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main wings, straight and brown, with red tips.
  ctx.fillStyle = '#8a5a33';
  ctx.beginPath();
  ctx.moveTo(-78, -8);
  ctx.lineTo(78, -8);
  ctx.lineTo(70, 6);
  ctx.lineTo(-70, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(-78, -8, 8, 14);
  ctx.fillRect(70, -8, 8, 14);

  ctx.restore();
}

// ---- HUD ----

function dial(ctx, x, y, radius, label, value, max, unit) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(10,18,28,0.72)';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8e4ee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Ticks around the rim.
  ctx.strokeStyle = 'rgba(216,228,238,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const angle = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * (radius - 6), Math.sin(angle) * (radius - 6));
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    ctx.stroke();
  }
  // Needle.
  const ratio = Math.max(0, Math.min(1, value / max));
  const angle = Math.PI * 0.75 + ratio * Math.PI * 1.5;
  ctx.strokeStyle = '#ffd66b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(angle) * (radius - 10), Math.sin(angle) * (radius - 10));
  ctx.stroke();
  ctx.fillStyle = '#eef4f8';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(value)), 0, 8);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#b9c9d6';
  ctx.fillText(label, 0, radius - 12);
  ctx.fillText(unit, 0, radius - 24);
  ctx.restore();
}

function bar(ctx, x, y, width, height, ratio, fill, label, text) {
  ctx.fillStyle = 'rgba(10,18,28,0.72)';
  roundRect(ctx, x, y, width, height, 5);
  ctx.fill();
  ctx.fillStyle = fill;
  const inner = Math.max(0, Math.min(1, ratio)) * (width - 6);
  if (inner > 0) {
    roundRect(ctx, x + 3, y + 3, inner, height - 6, 3);
    ctx.fill();
  }
  ctx.fillStyle = '#eef4f8';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 6, y + height / 2 + 4);
  if (text) {
    ctx.textAlign = 'right';
    ctx.fillText(text, x + width - 6, y + height / 2 + 4);
  }
}

// The instruments and readouts around the edges of the frame.
export function drawHUD(ctx, game) {
  const { plane, mission, totalScore, time } = game;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Airspeed and altitude dials, low left and low right.
  dial(ctx, 78, h - 82, 58, 'AIRSPEED', plane.speed, 160, 'KT');
  dial(ctx, w - 78, h - 82, 58, 'ALTITUDE', plane.alt, 600, 'M');

  // Heading compass tape across the top.
  const headingDeg = Math.round(((plane.heading * 180) / Math.PI % 360 + 360) % 360);
  ctx.fillStyle = 'rgba(10,18,28,0.72)';
  roundRect(ctx, w / 2 - 130, 12, 260, 34, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd66b';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(headingDeg).padStart(3, '0') + '°', w / 2, 37);
  ctx.fillStyle = '#b9c9d6';
  ctx.font = '11px sans-serif';
  ctx.fillText('HDG', w / 2 - 104, 32);
  ctx.fillText('MERIDIAN RUN', w / 2 + 104, 32);

  // Throttle, fuel and damage bars along the bottom centre.
  const barW = 200;
  const barX = w / 2 - barW / 2;
  bar(ctx, barX, h - 108, barW, 16, plane.throttle, '#e67e22', 'THR', `${Math.round(plane.throttle * 100)}%`);
  const fuelFill = plane.fuel > 25 ? '#7ed957' : '#e74c3c';
  bar(ctx, barX, h - 88, barW, 16, plane.fuel / 100, fuelFill, 'FUEL', `${Math.round(plane.fuel)}%`);
  bar(ctx, barX, h - 68, barW, 16, plane.damage / 100, '#e74c3c', 'DMG', `${Math.round(plane.damage)}%`);

  // Objective and clock, top left.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10,18,28,0.72)';
  roundRect(ctx, 12, 12, 300, 58, 6);
  ctx.fill();
  ctx.fillStyle = '#eef4f8';
  ctx.font = 'bold 14px sans-serif';
  if (mission) {
    const ring = mission.ringIndex < mission.rings.length ? mission.rings[mission.ringIndex] : null;
    const objective = ring
      ? `Ring ${mission.ringIndex + 1}/${mission.rings.length} — then land`
      : 'All rings done — land on runway 09';
    ctx.fillText(`${mission.definition.name}: ${objective}`, 22, 32);
    if (mission.definition.timeLimit) {
      const left = Math.max(0, mission.definition.timeLimit - mission.elapsed);
      const minutes = Math.floor(left / 60);
      const seconds = Math.floor(left % 60);
      ctx.fillStyle = left < 30 ? '#ff8a7a' : '#eef4f8';
      ctx.fillText(`Time ${minutes}:${String(seconds).padStart(2, '0')}`, 22, 54);
    } else {
      ctx.fillStyle = '#b9c9d6';
      ctx.fillText('No time limit — fly clean', 22, 54);
    }
  }

  // Score, top right.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(10,18,28,0.72)';
  roundRect(ctx, w - 172, 12, 160, 34, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd66b';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`SCORE ${totalScore}`, w - 24, 35);

  // Centre banner messages: ring counts, warnings, flare calls.
  if (mission && mission.messageTimer > 0) {
    ctx.globalAlpha = Math.min(1, mission.messageTimer);
    ctx.fillStyle = '#fff7d6';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mission.message, w / 2, h * 0.30);
    ctx.globalAlpha = 1;
  }
  if (game.stallWarning) {
    ctx.fillStyle = '#ff6b5e';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STALL', w / 2, h * 0.36);
  } else if (game.lowWarning) {
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TOO LOW', w / 2, h * 0.36);
  } else if (game.flarePrompt) {
    ctx.fillStyle = '#fff7d6';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FLARE! — hold Space', w / 2, h * 0.36);
  }

  // Small control reminder along the very bottom.
  ctx.fillStyle = 'rgba(238,244,248,0.75)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Arrows / WASD fly · Shift/Ctrl throttle · Space flare · P pause · M mute · R restart', w / 2, h - 8);
  void time;
}

// ---- Screens ----

function panel(ctx, title, lines, buttons) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = 'rgba(8,16,26,0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2e6c9';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, w / 2, h * 0.22);
  ctx.fillStyle = '#d8e4ee';
  ctx.font = '16px sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.22 + 44 + i * 26));
  return drawButtons(ctx, buttons, h * 0.22 + 44 + lines.length * 26 + 36);
}

function drawButtons(ctx, buttons, topY) {
  const w = ctx.canvas.width;
  const placed = [];
  let y = topY;
  for (const button of buttons) {
    const bw = button.w ?? 300;
    const bh = 46;
    const bx = w / 2 - bw / 2;
    const hover = button.hover ?? false;
    ctx.fillStyle = hover ? '#e8a33d' : '#c0392b';
    roundRect(ctx, bx, y, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, y, bw, bh, 8);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(button.label, w / 2, y + 30);
    placed.push({ id: button.id, x: bx, y, w: bw, h: bh });
    y += bh + 14;
  }
  return placed;
}

// The title screen: the game name, what it is, and the controls.
export function drawMenu(ctx, hoverId) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#2f6fb4');
  gradient.addColorStop(0.6, '#7db6e4');
  gradient.addColorStop(1, '#1d6f9e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffd66b';
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.2, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(w * (0.12 + i * 0.18), h * (0.16 + (i % 2) * 0.08), 70, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f2e6c9';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('MERIDIAN RUN', w / 2, h * 0.34);
  ctx.fillStyle = '#fff7d6';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('A mail-plane courier across the island chain', w / 2, h * 0.34 + 34);
  ctx.fillStyle = '#eef4f8';
  ctx.font = '15px sans-serif';
  const lines = [
    'Three sorties: thread the golden rings, then land on runway 09.',
    'Arrows or WASD fly the plane · Shift / Ctrl work the throttle · Space flares on final.',
    'Watch the stall, mind the fuel, and keep her off the water.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.52 + i * 24));
  return drawButtons(ctx, [
    { id: 'start', label: 'Start First Light', hover: hoverId === 'start' },
    { id: 'howto', label: 'How to fly', hover: hoverId === 'howto' },
  ], h * 0.64);
}

// The how-to screen, reached from the menu.
export function drawHowTo(ctx, hoverId) {
  return panel(ctx, 'HOW TO FLY', [
    'Left / Right (or A / D) — bank and turn. Up / Down (or W / S) — climb and descend.',
    'Shift raises the throttle, Ctrl lowers it. + and - nudge it a step.',
    'Space flares and brakes on final approach. Below 55 knots the wing stalls — keep speed up.',
    'Climbing and banking bleed speed. Fuel burns with the throttle.',
    'Fly through each golden ring in order, then land gently on runway 09.',
    'A hard touchdown bends the airframe. The sea and the hillsides are not runways.',
    'P pauses · M mutes · R restarts the sortie.',
  ], [{ id: 'back', label: 'Back to menu', hover: hoverId === 'back' }]);
}

// The briefing before each sortie.
export function drawBriefing(ctx, definition, hoverId) {
  const lines = [
    `Sortie ${definition.number} of 3 — ${definition.name}`,
    '',
    ...wrapText(definition.briefing, 64),
    '',
    definition.timeLimit ? `Time limit: ${Math.floor(definition.timeLimit / 60)}:${String(definition.timeLimit % 60).padStart(2, '0')}` : 'No time limit',
    definition.wind ? `Crosswind: ${definition.wind} knots` : 'Wind: calm',
    `Rings: ${definition.waypoints.length} — then land on runway 09`,
  ];
  return panel(ctx, definition.name.toUpperCase(), lines, [
    { id: 'fly', label: 'Fly the sortie', hover: hoverId === 'fly' },
  ]);
}

// The debrief after a landed sortie.
export function drawDebrief(ctx, mission, total, hoverId, last) {
  const lines = [
    `${mission.definition.name} complete`,
    '',
    `Rings: ${mission.ringScore}  ·  Landing: ${mission.landingScore}  ·  Time bonus: ${mission.timeBonus}`,
    `Damage taken: ${Math.round(mission.damageTaken ?? 0)}%`,
    landingVerdictText(mission),
    '',
    `Sortie total: ${missionTotal(mission, mission.damageTaken ?? 0)}`,
    `Campaign total: ${total}`,
  ];
  return panel(ctx, 'SORTIE COMPLETE', lines, [
    { id: last ? 'finish' : 'next', label: last ? 'See the campaign result' : 'Next sortie', hover: hoverId === (last ? 'finish' : 'next') },
  ]);
}

function landingVerdictText(mission) {
  const score = mission.landingScore;
  if (score >= 420) return 'A greaser — the mail never felt a thing.';
  if (score >= 300) return 'A tidy touchdown, well held on the centreline.';
  if (score >= 150) return 'Down in one piece, but the old girl felt that one.';
  return 'A firm arrival — the ground crew is already checking the gear.';
}

// The crash screen after a failed sortie.
export function drawCrashed(ctx, reason, hoverId) {
  return panel(ctx, 'SORTIE LOST', [
    reason,
    '',
    'The mail plane is a write-off, but the pilot walked away.',
    'The sortie can be flown again.',
  ], [
    { id: 'retry', label: 'Retry the sortie', hover: hoverId === 'retry' },
    { id: 'menu', label: 'Back to menu', hover: hoverId === 'menu' },
  ]);
}

// The campaign-complete screen after all three sorties.
export function drawGameComplete(ctx, total, hoverId) {
  return panel(ctx, 'CAMPAIGN COMPLETE', [
    'Three sorties flown, three landings made. The mail got through.',
    '',
    `Campaign total: ${total}`,
    total >= 2200 ? 'A courier the islands will remember.' : total >= 1500 ? 'A solid run — the postmaster is pleased.' : 'The mail arrived. Next time, smoother landings.',
  ], [
    { id: 'again', label: 'Fly the campaign again', hover: hoverId === 'again' },
    { id: 'menu', label: 'Back to menu', hover: hoverId === 'menu' },
  ]);
}

// The pause overlay, drawn over the frozen frame.
export function drawPaused(ctx, hoverId) {
  return panel(ctx, 'PAUSED', [
    'The mail can wait a moment.',
    '',
    'P resumes · R restarts the sortie',
  ], [
    { id: 'resume', label: 'Resume flying', hover: hoverId === 'resume' },
    { id: 'menu', label: 'Quit to menu', hover: hoverId === 'menu' },
  ]);
}

// Wrap a paragraph into lines no longer than `width` characters.
function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}
