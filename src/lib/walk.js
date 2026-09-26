// Прогулка от первого лица: капсула с гравитацией, ступенями и скольжением вдоль стен
// (коллизии — BVH по реальной геометрии сцены, см. collision.js), управление с клавиатуры,
// мыши и сенсорного экрана, HUD (этаж, зона, мини-карта) и API для headless-тестов.
//
// Координаты: u, v, z — как в building.js (z = 0 — чистый пол 1 этажа, тротуар −1,5).
// yaw = 0 — взгляд вглубь здания (+v), положительный yaw — поворот влево (к меньшим u).
import * as THREE from 'three';
import * as B from '../data/building.js';
import { sx, sy, sz } from './geom.js';
import { Collider } from './collision.js';

export const PLAYER = {
  radius: 0.28, height: 1.75, eye: 1.62,
  step: 0.32,            // ступенька, на которую заходим без прыжка (подступенки 0,15–0,23)
  snap: 0.45,            // «прилипание» к полу при спуске по лестнице
  gravity: 18, jump: 0.55,
  walk: 2.4, run: 5.4, fly: 5, flyRun: 14,
};
const DEG = Math.PI / 180;
const C = B.SIZE / 2;
const toU = (x) => x + C, toV = (zs) => C - zs, toZ = (y) => y + B.GRADE;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const inRect = (u, v, r, m = 0) => u >= r[0] - m && u <= r[2] + m && v >= r[1] - m && v <= r[3] + m;
const fmt = (n, d = 1) => n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n) => `${n > 0.004 ? '+' : n < -0.004 ? '−' : '±'}${fmt(Math.abs(n), 2)}`;

// Мини-карта: кадр плана (м). Внутри — только здание, снаружи — здание с крыльцом.
const MAP_IN = { u0: -1.6, u1: 56.8, v0: -1.6, v1: 56.8 };
const MAP_OUT = { u0: -8.25, u1: 63.45, v0: -12.5, v1: 59.2 };
let MAP = MAP_OUT;
const TONE = {
  lobby: '#dfe4e2', corridor: '#dfe4e2', gallery: '#dfe4e2', turnstiles: '#dfe4e2', photozone: '#dfe4e2',
  lounge: '#cfc9bd', platform: '#d4d0dc', grandstair: '#c9c4d6', amphitheater: '#b8b3b5',
  kitchen: '#c8ccca', meeting: '#bfc4c2', conference: '#c3c7c5', game: '#aeb3b1', pingpong: '#c3c7c5',
  library: '#b9bdbb', office: '#c3c7c5', wardrobe: '#b9bdbb', server: '#a3a9a7',
  storage: '#9ea3a1', tech: '#9ea3a1', wc: '#b1b6b4', stair: '#7d8482', lift: '#7d8482',
};

export function createWalk(ctx) {
  const { camera, renderer, world, getZones } = ctx;
  const hooks = ctx.hooks || {};
  const isTouch = !!ctx.isTouch;
  // шаг физики: 120 Гц на компьютере, 60 Гц на телефоне (за шаг ≤ 0,09 м — меньше радиуса капсулы)
  const HSTEP = isTouch ? 1 / 60 : 1 / 120;
  const canvas = renderer.domElement;
  const $ = (id) => document.getElementById(id);
  const el = {
    root: $('walk'), touch: $('w-touch'), info: $('w-info'), level: $('w-level'), zone: $('w-zone'), coords: $('w-coords'),
    floors: $('w-floors'), map: $('w-map'), keys: $('w-keys'), fly: $('w-fly'), msg: $('w-msg'), exit: $('w-exit'),
    joy: $('w-joy'), run: $('w-run'), jump: $('w-jump'), flyBtn: $('w-flybtn'),
    ov: $('w-overlay'), ovTitle: $('w-ov-title'), ovLead: $('w-ov-lead'), go: $('w-go'), spawn: $('w-spawn'), back: $('w-back'),
  };
  el.root.classList.toggle('touch', isTouch);
  el.root.classList.toggle('desk', !isTouch);

  const collider = new Collider();
  let dirty = true, buildPromise = null;

  // ── Состояние ──────────────────────────────────────────────────────────────
  const sim = {
    pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
    grounded: false, fly: false, coyote: 0, jumpBuf: 0, eyeLag: 0, clearance: 9,
  };
  let yaw = 0, pitch = 0;
  let active = false, ready = false, paused = true, manual = false;
  let locked = false, exitingLock = false, unlockAt = 0, lockFails = 0;
  const canLock = !isTouch && typeof canvas.requestPointerLock === 'function';
  let acc = 0, bobPhase = 0, bobAmp = 0;
  let lastPos = null;
  let saved = null;
  const keys = new Set();
  const joy = { x: 0, y: 0 };
  let runToggle = false, upHeld = false, jumpQueued = false, testJumpHeld = false;
  const tin = { x: 0, y: 0, run: false, up: 0, down: 0 };
  const perf = { steps: 0, ms: 0 };
  const here = { u: 0, v: 0, z: 0, level: 'L1', inside: false, zone: '', zoneId: null };

  // ── Уровни ─────────────────────────────────────────────────────────────────
  const levels = () => [...B.LEVELS].sort((a, b) => a.z - b.z);
  const levelById = (id) => B.LEVELS.find((l) => l.id === id);
  const floorsForKeys = () => levels().filter((l) => !l.basement && !l.partial);
  const insideFoot = (u, v, m = 0) => u > -m && u < B.SIZE + m && v > -m && v < B.SIZE + m;

  function levelAt(u, v, z) {
    if (!insideFoot(u, v, 0.05)) return null;
    const zones = getZones();
    for (const zn of zones) {
      if (zn.type !== 'amphitheater' || !inRect(u, v, zn.rect)) continue;
      const L = levelById(zn.level);
      if (L && z < L.z + 0.3 && z > (zn.props?.stageZ ?? L.z - 3) - 0.6) return zn.level;
    }
    const ls = levels().reverse();
    for (const L of ls) {
      if (z < L.z - 0.45) continue;
      if (L.partial && !zones.some((zn) => zn.level === L.id && zn.type !== 'void' && inRect(u, v, zn.rect))) continue;
      return L.id;
    }
    return ls[ls.length - 1]?.id ?? null;
  }
  function zoneAt(u, v, levelId) {
    if (!levelId) {
      const st = B.ENTRANCE?.stairs;
      if (st && u > st.u0 - 3 && u < B.SIZE + 1 && v > st.vTop - st.risers * st.tread - 2 && v < 0.5) return { name: 'Главный вход', id: 'entrance' };
      if (u > -8 && u < B.SIZE + 8 && v > -4 && v < 0.2) return { name: 'У фасада', id: 'facade' };
      return { name: 'Территория кампуса', id: 'site' };
    }
    const core = B.CORES.find((c) => c.levels.includes(levelId) && inRect(u, v, c.rect));
    if (core) return { name: core.name, id: core.id };
    const zs = getZones().filter((zn) => zn.level === levelId && zn.type !== 'void' && inRect(u, v, zn.rect));
    if (levelId === 'M') for (const s of B.ATRIUM_STAIRS || []) if (u >= s.u0 && u <= s.u1 && v >= s.vBottom && v <= s.vTop) return { name: s.name, id: s.id };
    zs.sort((a, b) => (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]) - (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]));
    return zs[0] ? { name: zs[0].name, id: zs[0].id } : { name: '—', id: null };
  }

  // ── Коллизии ───────────────────────────────────────────────────────────────
  // Коллизии строим по всей сцене: новые группы (реквизит, мебель) подхватятся сами
  function colliderRoots() {
    if (ctx.scene) return [ctx.scene];
    return [world.site, ...Object.values(world.shell || {}), ...Object.values(world.interior?.levels || {})];
  }
  // Двери главного входа (по фасаду ЮВ, v = 0): B.ENTRANCE.doors — {u0,u1,h} или массив таких;
  // если не задано — как в shell.js (двери тамбура u 47,0–54,6, высота 3,3 м).
  function entranceDoors() {
    const raw = B.ENTRANCE?.doors;
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : [{ u0: 47.0, u1: 54.6, h: 3.3 }])
      .filter((d) => d && Number.isFinite(d.u0) && Number.isFinite(d.u1) && d.u1 > d.u0);
    return list.length ? list : [{ u0: 47.0, u1: 54.6, h: 3.3 }];
  }
  function cutouts() {
    // Пока в витраже за дверями стекло, вырезаем в коллизии стекло и импосты (рамы дверей остаются).
    // Когда графика сделает реальный проём, вырезать будет нечего (см. stats().cuts).
    const z0 = levelById('L1')?.z ?? 0;
    return entranceDoors().map((d, i) => ({
      id: `main-doors${i || ''}`, mat: /^(glass|mullion)/,
      box: [sx(d.u0 + 0.06), sy(z0 + 0.03), sz(0.4), sx(d.u1 - 0.06), sy(z0 + (Number.isFinite(d.h) ? d.h : 3.3) - 0.1), sz(-0.4)],
    }));
  }
  function shafts() {
    const out = [];
    for (const c of B.CORES || []) {
      if (c.type !== 'stair' || !Array.isArray(c.rect) || !Array.isArray(c.levels)) continue;
      const zs = c.levels.map((id) => levelById(id)?.z).filter((z) => z !== undefined).sort((a, b) => a - b);
      if (zs.length < 2) continue;
      const [u0, v0, u1, v1] = c.rect;
      out.push({ rect: [sx(u0), sz(v1), sx(u1), sz(v0)], floors: zs.slice(1).map(sy) });
    }
    return out;
  }
  async function ensureCollider() {
    if (buildPromise) return buildPromise;
    if (!dirty && collider.ready) return collider.stats;
    dirty = false;
    buildPromise = collider.build(colliderRoots(), { cutouts: cutouts(), shafts: shafts(), slab: B.SLAB ?? 0.35 })
      .then((st) => {
        console.info(`Прогулка: коллизии ${st.tris.toLocaleString('ru-RU')} треуг., сбор ${st.collectMs} мс, BVH ${st.bvhMs} мс`, collider.cutReport);
        return st;
      })
      .finally(() => { buildPromise = null; });
    const st = await buildPromise;
    if (dirty) return ensureCollider();          // пока строили, геометрию поменяли
    return st;
  }
  function invalidate() {
    dirty = true;
    mapKey = '';
    if (active) ensureCollider().then(() => { if (active && !sim.fly && !fitsAt(sim.pos)) unstick(); });
  }

  // ── Поиск свободного места ─────────────────────────────────────────────────
  const _t = new THREE.Vector3(), _push = new THREE.Vector3();
  function fitsAt(p) {
    _t.copy(p);
    collider.prevX = p.x; collider.prevZ = p.z;
    let moved = 0;
    for (let i = 0; i < 2; i++) { if (!collider.pushOut(_t, PLAYER.radius, _t.y + PLAYER.step, _t.y + PLAYER.height - 0.02, _push)) break; moved += Math.hypot(_push.x, _push.z); }
    if (moved > 0.02) return false;
    const c = collider.ceilingAt(p.x, p.z, p.y + 0.5, p.y + PLAYER.height + 0.05);
    return c >= p.y + PLAYER.height;
  }
  // Свободная точка у (u, v) с полом около отметки z. Возвращает позицию в сцене или null.
  // Луч пускаем сверху (не из толщи подиума/ступени), столы и прочее выше z+0,5 — не пол.
  function findSpot(u, v, z, maxR = 6, below = 1.6) {
    const y = sy(z);
    for (let r = 0; r <= maxR + 1e-6; r += 0.35) {
      const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 0.45);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r;
        const x = sx(u + Math.cos(a) * r), zs = sz(v + Math.sin(a) * r);
        const g = collider.groundAt(x, zs, y + 1.2, y - below, 0.12);
        if (g === -Infinity || g > y + 0.5) continue;
        _t.set(x, g, zs);
        if (fitsAt(_t)) return new THREE.Vector3(x, g, zs);
      }
    }
    return null;
  }
  // Точки «входа» на этаж: центры общих зон (лобби, галерея, площадка…), а если центр
  // попал во второй свет — точки у краёв зоны. Сначала самые «общественные».
  function levelAnchors(id) {
    const pref = ['lobby', 'gallery', 'platform', 'lounge', 'corridor', 'cluster', 'kitchen', 'library'];
    const zones = getZones().filter((zn) => zn.level === id);
    const voids = zones.filter((zn) => zn.type === 'void').map((zn) => zn.rect);
    const zs = zones.filter((zn) => pref.includes(zn.type));
    zs.sort((a, b) => pref.indexOf(a.type) - pref.indexOf(b.type) || (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]) - (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]));
    const out = [];
    for (const zn of zs) {
      const [u0, v0, u1, v1] = zn.rect, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      for (const [u, v] of [[cu, cv], [cu, v0 + 1.4], [cu, v1 - 1.4], [u0 + 1.4, cv], [u1 - 1.4, cv]]) {
        if (!voids.some((r) => inRect(u, v, r, 0.6))) out.push([u, v]);
      }
    }
    out.push([C, C]);
    return out;
  }
  const levelAnchor = (id) => levelAnchors(id)[0];
  function placeAt(p) {
    sim.pos.copy(p); sim.prev.copy(p); sim.vel.set(0, 0, 0);
    sim.grounded = !sim.fly; sim.eyeLag = 0; sim.clearance = 9; acc = 0;
    applyCamera(1);
    updateHere(true);
  }
  function unstick() {
    const p = findSpot(toU(sim.pos.x), toV(sim.pos.z), toZ(sim.pos.y), 4, 0.8);
    if (p) placeAt(p);
  }

  // teleport(u, v, levelId | z) — ставит игрока на ближайшее свободное место
  function teleport(u, v, lvl, opts = {}) {
    let z;
    if (typeof lvl === 'number') z = lvl;
    else if (typeof lvl === 'string') z = levelById(lvl)?.z ?? 0;
    else z = toZ(sim.pos.y);
    let p = findSpot(u, v, z, opts.radius ?? 3);
    if (!p && typeof lvl === 'string') {
      const [au, av] = levelAnchor(lvl);
      p = findSpot(au, av, z, 14);
    }
    if (!p) {
      if (opts.force === false) return null;
      p = new THREE.Vector3(sx(u), sy(z), sz(v));       // пусть упадёт на то, что внизу
    }
    if (opts.yaw !== undefined) yaw = opts.yaw * DEG;
    if (opts.pitch !== undefined) pitch = opts.pitch * DEG;
    placeAt(p);
    return state();
  }
  // На этаж: сначала в ту же точку плана («как на лифте»), иначе — к общим зонам этажа.
  // Пол должен быть именно на этой отметке (±0,6 м), а не на марше между этажами.
  function gotoLevel(id) {
    const L = levelById(id);
    if (!L || !ready) return;
    let p = null;
    if (insideFoot(here.u, here.v, -0.8)) p = findSpot(here.u, here.v, L.z, 4, 0.6);
    for (const [u, v] of p ? [] : levelAnchors(id)) { p = findSpot(u, v, L.z, 3, 0.6); if (p) break; }
    if (!p) { msg(`На «${L.name}» не нашлось свободного места`); return; }
    placeAt(p);
    msg(L.name, 1200);
  }
  // Точка появления: на тротуаре в 3 м от нижней ступени крыльца, напротив дверей
  function spawnPoint() {
    const st = B.ENTRANCE?.stairs;
    const ok = st && [st.u0, st.u1, st.vTop, st.risers, st.tread].every(Number.isFinite);
    const d = entranceDoors()[0];
    let u = ok ? (st.u0 + st.u1) / 2 : (d.u0 + d.u1) / 2;
    if (ok && B.ENTRANCE?.doors) u = Math.min(st.u1 - 1, Math.max(st.u0 + 1, (d.u0 + d.u1) / 2));
    const v = (ok ? st.vTop - st.risers * st.tread : -8) - 3;
    return { u, v };
  }
  function respawn() {
    const { u, v } = spawnPoint();
    yaw = 0; pitch = 0; sim.fly = false; updateFlyUi();
    const p = findSpot(u, v, B.GRADE, 8) || new THREE.Vector3(sx(u), sy(B.GRADE), sz(v));
    placeAt(p);
  }

  // ── Физика ─────────────────────────────────────────────────────────────────
  function readInput(o) {
    if (manual) { o.x = tin.x; o.y = tin.y; o.run = tin.run; o.up = tin.up; o.down = tin.down; return o; }
    const k = (a, b) => keys.has(a) || (b && keys.has(b));
    o.x = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0) + joy.x;
    o.y = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0) + joy.y;
    o.run = k('ShiftLeft', 'ShiftRight') || runToggle;
    o.up = k('Space', 'KeyE') || upHeld ? 1 : 0;
    o.down = k('KeyC', 'KeyQ') || keys.has('ControlLeft') ? 1 : 0;
    return o;
  }
  const inp = { x: 0, y: 0, run: false, up: 0, down: 0 };
  function physStep(h) {
    const s = sim, P = PLAYER;
    readInput(inp);
    let ix = inp.x, iy = inp.y;
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }
    const sn = Math.sin(yaw), cs = Math.cos(yaw);
    if (s.fly) {
      const sp = inp.run ? P.flyRun : P.fly, cp = Math.cos(pitch), pp = Math.sin(pitch);
      s.pos.x += (-sn * cp * iy + cs * ix) * sp * h;
      s.pos.z += (-cs * cp * iy - sn * ix) * sp * h;
      s.pos.y += (pp * iy + inp.up - inp.down) * sp * h;
      s.vel.set(0, 0, 0); s.grounded = false; s.eyeLag = 0;
      return;
    }
    const speed = inp.run ? P.run : P.walk;
    const wx = (-sn * iy + cs * ix) * speed, wz = (-cs * iy - sn * ix) * speed;
    const k = 1 - Math.exp(-h * (s.grounded ? 12 : 2.5));
    s.vel.x += (wx - s.vel.x) * k; s.vel.z += (wz - s.vel.z) * k;
    // прыжок: небольшой «запас» после схода с края и буфер нажатия
    s.coyote = s.grounded ? 0.12 : Math.max(0, s.coyote - h);
    if (jumpQueued) { s.jumpBuf = 0.15; jumpQueued = false; } else s.jumpBuf = Math.max(0, s.jumpBuf - h);
    if (s.jumpBuf > 0 && s.coyote > 0) {
      s.vel.y = Math.sqrt(2 * P.gravity * P.jump); s.grounded = false; s.coyote = 0; s.jumpBuf = 0;
    }
    const ox = s.pos.x, oy = s.pos.y, oz = s.pos.z, wasGrounded = s.grounded;
    // горизонталь: шаг и выталкивание из стен (скользим вдоль них)
    s.pos.x += s.vel.x * h; s.pos.z += s.vel.z * h;
    collider.prevX = ox; collider.prevZ = oz;
    for (let it = 0; it < 3; it++) {
      if (!collider.pushOut(s.pos, P.radius, s.pos.y + P.step, s.pos.y + P.height - 0.02, _push)) break;
      const pl = Math.hypot(_push.x, _push.z);
      if (pl > 1e-7) {
        const nx = _push.x / pl, nz = _push.z / pl, vn = s.vel.x * nx + s.vel.z * nz;
        if (vn < 0) { s.vel.x -= vn * nx; s.vel.z -= vn * nz; }
      }
    }
    // вертикаль: ступени вверх (до step), прилипание вниз (до snap), падение, потолок
    if (s.grounded && s.vel.y <= 0) {
      const g = collider.groundAt(s.pos.x, s.pos.z, s.pos.y + P.step, s.pos.y - P.snap);
      if (g > -Infinity) { s.pos.y = g; s.vel.y = 0; } else { s.grounded = false; s.vel.y = 0; }
    } else {
      s.vel.y = Math.max(s.vel.y - P.gravity * h, -45);
      const ny = s.pos.y + s.vel.y * h;
      if (s.vel.y <= 0) {
        const g = collider.groundAt(s.pos.x, s.pos.z, s.pos.y + P.step, ny - 0.01);
        if (g > -Infinity) { s.pos.y = g; s.vel.y = 0; s.grounded = true; } else s.pos.y = ny;
      } else {
        const c = collider.ceilingAt(s.pos.x, s.pos.z, s.pos.y + P.height * 0.5, ny + P.height + 0.02);
        if (c < ny + P.height) { s.pos.y = Math.max(s.pos.y, c - P.height); s.vel.y = 0; } else s.pos.y = ny;
      }
    }
    // зазор над головой: в слишком низкое место не заходим (но из него выйти можно)
    if (s.grounded) {
      const c = collider.ceilingAt(s.pos.x, s.pos.z, s.pos.y + 0.9, s.pos.y + P.height + 0.05);
      const clr = c - s.pos.y;
      if (wasGrounded && clr < P.height && clr < s.clearance - 0.005) {
        s.pos.set(ox, oy, oz); s.vel.x = 0; s.vel.z = 0;
      } else s.clearance = Math.min(clr, 9);
      if (wasGrounded) s.eyeLag -= s.pos.y - oy;       // ступенька — камеру догоняем плавно
    }
    s.eyeLag = clamp(s.eyeLag, -0.6, 0.6) * Math.exp(-h * 13);
  }
  function advance(dt) {
    const n = Math.max(1, Math.ceil(dt / HSTEP - 1e-6));
    const h = dt / n;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { sim.prev.copy(sim.pos); physStep(h); }
    perf.ms += performance.now() - t0; perf.steps += n;
    // улетели в пустоту (за краем участка) — обратно ко входу
    if (!sim.fly && sim.pos.y < sy(B.GRADE - 40)) { respawn(); msg('Вы упали за край участка — вернули ко входу', 2400); }
  }

  // ── Камера ─────────────────────────────────────────────────────────────────
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  function applyCamera(alpha) {
    const s = sim;
    const x = s.prev.x + (s.pos.x - s.prev.x) * alpha;
    const y = s.prev.y + (s.pos.y - s.prev.y) * alpha;
    const z = s.prev.z + (s.pos.z - s.prev.z) * alpha;
    const eye = PLAYER.eye + (s.fly ? 0 : s.eyeLag + Math.sin(bobPhase) * 0.022 * bobAmp);
    camera.position.set(x, y + eye, z);
    _e.set(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(_e);
  }
  function setWalkFov() {
    const a = camera.aspect || 1;
    const v = (2 * Math.atan(Math.tan(45 * DEG) / a)) / DEG;     // горизонталь ≈ 90°
    camera.fov = clamp(v, 55, 80);
    camera.updateProjectionMatrix();
  }
  const look = (dx, dy, k) => {
    yaw -= dx * k;
    pitch = clamp(pitch - dy * k, -1.5, 1.5);
  };

  // ── Кадр ───────────────────────────────────────────────────────────────────
  let hudT = 0, cullT = 0;
  function update(dt) {
    if (!active) return;
    if (ready && !paused && !manual) {
      acc += Math.min(dt, 0.1);
      const n = Math.floor(acc / HSTEP);
      if (n > 0) { advance(n * HSTEP); acc -= n * HSTEP; }
    }
    // покачивание при ходьбе
    const hs = Math.hypot(sim.vel.x, sim.vel.z);
    const want = sim.grounded && !sim.fly && hs > 0.4 ? Math.min(1, hs / 3) : 0;
    bobAmp += (want - bobAmp) * Math.min(1, dt * 6);
    if (want) bobPhase += dt * hs * 3.1;
    applyCamera(ready && !manual ? clamp(acc / HSTEP, 0, 1) : 1);
    hudT += dt; cullT += dt;
    if (hudT > 0.15) { hudT = 0; updateHere(); }
    if (cullT > 0.3) { cullT = 0; cullLevels(); }
    drawMap();
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function updateHere(force = false) {
    const u = toU(sim.pos.x), v = toV(sim.pos.z), z = toZ(sim.pos.y);
    const lv = levelAt(u, v, z);
    const zn = zoneAt(u, v, lv);
    const changed = force || lv !== here.level || zn.id !== here.zoneId;
    Object.assign(here, { u, v, z, level: lv, inside: !!lv, zone: zn.name, zoneId: zn.id });
    if (el.coords) el.coords.textContent = `u ${fmt(u)} · v ${fmt(v)} · ${signed(z)}`;
    if (!changed) return;
    const L = lv ? levelById(lv) : null;
    el.level.textContent = L ? L.name : 'Снаружи';
    el.zone.textContent = zn.name;
    el.floors.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lv === lv)));
  }
  function buildFloors() {
    el.floors.innerHTML = '';
    for (const L of levels()) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.lv = L.id; b.textContent = L.short || L.id; b.title = L.name;
      b.setAttribute('aria-label', L.name);
      b.addEventListener('click', (e) => { e.stopPropagation(); gotoLevel(L.id); });
      el.floors.appendChild(b);
    }
  }
  let msgT = null;
  function msg(t, ms = 2200) {
    el.msg.textContent = t; el.msg.hidden = false;
    clearTimeout(msgT); msgT = setTimeout(() => { el.msg.hidden = true; }, ms);
  }
  function updateFlyUi() {
    el.fly.hidden = !sim.fly;
    el.flyBtn?.setAttribute('aria-pressed', String(sim.fly));
    if (el.jump) el.jump.textContent = sim.fly ? 'Вверх' : 'Прыжок';
  }
  function setFly(on) {
    if (on === sim.fly) return;
    sim.fly = on;
    if (!on) {
      // выходим из полёта: если внутри стены — ищем ближайшее свободное место, дальше падаем
      sim.vel.set(0, 0, 0); sim.grounded = false;
      if (collider.ready && !fitsAt(sim.pos)) {
        const p = findSpot(toU(sim.pos.x), toV(sim.pos.z), toZ(sim.pos.y), 3, 3);
        if (p) placeAt(p);
      }
    }
    updateFlyUi();
    msg(on ? 'Полёт: сквозь стены, вверх — Пробел, вниз — C' : 'Полёт выключен', 1600);
  }

  // Видимость этажей: рисуем только соседние по высоте (на телефоне это заметно)
  function cullLevels() {
    const lv = world.interior?.levels;
    if (!lv) return;
    const { u, v, z } = here;
    const inside = insideFoot(u, v, 0.3);
    const inShaft = inside && B.CORES.some((c) => c.type === 'stair' && inRect(u, v, c.rect, 0.5));
    const ground = Math.min(...B.LEVELS.filter((l) => !l.basement).map((l) => l.z));
    for (const L of B.LEVELS) {
      const g = lv[L.id];
      if (!g) continue;
      let vis;
      if (L.basement) vis = inside && (z < ground - 2.9 || inShaft);   // амфитеатр (−2,7) — ещё не подвал
      else vis = !inside || (L.z >= z - 5.0 && L.z <= z + 7.6);   // свой этаж, соседние и полуэтажи
      if (g.visible !== vis) g.visible = vis;
      if (g.userData.ceiling && !g.userData.ceiling.visible) g.userData.ceiling.visible = true;
    }
  }

  // ── Мини-карта ─────────────────────────────────────────────────────────────
  let mapKey = '', mapLayer = null, mapCtx = null, mapCss = 0, mapDpr = 1, mapBig = false;
  function mapResize() {
    const r = el.map.getBoundingClientRect();
    const css = Math.round(r.width) || 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!css) return false;
    if (css !== mapCss || dpr !== mapDpr) {
      mapCss = css; mapDpr = dpr;
      el.map.width = el.map.height = Math.round(css * dpr);
      mapCtx = el.map.getContext('2d');
      mapKey = '';
    }
    return true;
  }
  const mx = (u) => ((u - MAP.u0) / (MAP.u1 - MAP.u0)) * mapCss;
  const my = (v) => ((MAP.v1 - v) / (MAP.v1 - MAP.v0)) * mapCss;
  function drawLayer(levelId) {
    const S = Math.round(mapCss * mapDpr);
    const c = mapLayer || document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
    g.clearRect(0, 0, mapCss, mapCss);
    const rect = (r, fill, stroke) => {
      const x0 = mx(r[0]), x1 = mx(r[2]), y0 = my(r[3]), y1 = my(r[1]);
      if (fill) { g.fillStyle = fill; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
      if (stroke) { g.strokeStyle = stroke; g.strokeRect(x0 + 0.25, y0 + 0.25, x1 - x0 - 0.5, y1 - y0 - 0.5); }
    };
    const lvl = levelId || 'L1';
    // для полуэтажа (парящая площадка) подкладываем бледный план этажа под ним
    const L = levelById(lvl);
    const under = L?.partial ? levels().filter((l) => !l.partial && !l.basement && l.z < L.z).pop() : null;
    // крыльцо и козырёк
    const st = B.ENTRANCE?.stairs;
    if (st && Number.isFinite(st.risers * st.tread)) rect([st.u0, st.vTop - st.risers * st.tread, st.u1, st.vTop], 'rgba(200,190,180,0.55)');
    if (B.CANOPY) rect([B.CANOPY.u0, -B.CANOPY.depth, B.CANOPY.u1, 0], 'rgba(230,232,230,0.35)');
    // пятно здания
    rect([0, 0, B.SIZE, B.SIZE], 'rgba(236,240,238,0.16)');
    g.lineWidth = 0.6;
    if (under) {
      g.globalAlpha = 0.35;
      for (const zn of getZones().filter((q) => q.level === under.id && q.type !== 'void')) rect(zn.rect, zn.type === 'cluster' ? (B.CLUSTER_COLORS[zn.cluster] || '#8a8f8d') : (TONE[zn.type] || '#c3c7c5'), 'rgba(20,30,30,0.5)');
      g.globalAlpha = 1;
    }
    const zs = getZones().filter((zn) => zn.level === lvl).sort((a, b) =>
      (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]) - (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]));
    for (const zn of zs) {
      if (zn.type === 'void') { rect(zn.rect, 'rgba(8,14,16,0.55)', 'rgba(200,190,230,0.7)'); continue; }
      const col = zn.type === 'cluster' ? (B.CLUSTER_COLORS[zn.cluster] || '#8a8f8d') : (TONE[zn.type] || '#c3c7c5');
      g.globalAlpha = zn.type === 'cluster' ? 0.85 : 0.5;
      rect(zn.rect, col);
      g.globalAlpha = 1;
      rect(zn.rect, null, 'rgba(20,30,30,0.45)');
    }
    for (const core of B.CORES.filter((cr) => cr.levels.includes(lvl))) {
      rect(core.rect, TONE[core.type] || '#7d8482', 'rgba(10,16,16,0.6)');
      if (core.type === 'stair') {
        const [u0, v0, u1, v1] = core.rect;
        g.strokeStyle = 'rgba(245,245,245,0.8)'; g.lineWidth = 0.8;
        g.beginPath();
        for (let v = v0 + 0.8; v < v1 - 0.4; v += 0.7) { g.moveTo(mx(u0 + 0.4), my(v)); g.lineTo(mx(u1 - 0.4), my(v)); }
        g.stroke(); g.lineWidth = 0.6;
      }
    }
    if (L?.partial) for (const s of B.ATRIUM_STAIRS || []) rect([s.u0, s.vBottom, s.u1, s.vTop], TONE.grandstair, 'rgba(10,16,16,0.5)');
    // атриум и контур
    g.setLineDash([2, 2]); g.strokeStyle = 'rgba(255,255,255,0.55)';
    rect([B.ATRIUM.u0, B.ATRIUM.v0, B.ATRIUM.u1, B.ATRIUM.v1], null, 'rgba(255,255,255,0.55)');
    g.setLineDash([]);
    g.lineWidth = 1.2;
    rect([0, 0, B.SIZE, B.SIZE], null, 'rgba(255,255,255,0.85)');
    // вход
    g.fillStyle = '#37d3b6';
    for (const d of entranceDoors()) g.fillRect(mx(d.u0), my(0) - 1.5, mx(d.u1) - mx(d.u0), 3);
    mapLayer = c;
  }
  function drawMap() {
    if (!mapCtx && !mapResize()) return;
    const frame = here.inside ? MAP_IN : MAP_OUT;
    const key = `${here.level || 'out'}|${mapCss}|${mapDpr}|${frame === MAP_IN}`;
    if (key !== mapKey) {
      if (!mapResize()) return;
      MAP = frame;
      drawLayer(here.level);
      mapKey = `${here.level || 'out'}|${mapCss}|${mapDpr}|${frame === MAP_IN}`;
    }
    const g = mapCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, el.map.width, el.map.height);
    g.drawImage(mapLayer, 0, 0);
    g.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
    const px = clamp(mx(toU(sim.pos.x)), 4, mapCss - 4), py = clamp(my(toV(sim.pos.z)), 4, mapCss - 4);
    // направление взгляда в плане: du = −sin(yaw), dv = cos(yaw) → на карте (du, −dv)
    const ang = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    const hf = Math.atan(Math.tan((camera.fov * DEG) / 2) * camera.aspect);
    const R = mapCss * 0.16;
    g.fillStyle = 'rgba(55,211,182,0.22)';
    g.beginPath(); g.moveTo(px, py); g.arc(px, py, R, ang - hf, ang + hf); g.closePath(); g.fill();
    g.save(); g.translate(px, py); g.rotate(ang);
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, 4.5); g.lineTo(-2.5, 0); g.lineTo(-5, -4.5); g.closePath();
    g.fillStyle = '#37d3b6'; g.strokeStyle = '#0b1516'; g.lineWidth = 1.2; g.fill(); g.stroke();
    g.restore();
  }
  function mapToUV(e) {
    const r = el.map.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    return [MAP.u0 + fx * (MAP.u1 - MAP.u0), MAP.v1 - fy * (MAP.v1 - MAP.v0)];
  }
  el.map.addEventListener('click', (e) => {
    if (!active || !ready || locked) return;
    e.stopPropagation();
    const [u, v] = mapToUV(e);
    const lv = here.level || (insideFoot(u, v) ? 'L1' : null);
    const p = lv ? findSpot(u, v, levelById(lv).z, 2.5, 0.6) : findSpot(u, v, B.GRADE, 2.5);
    if (p) { placeAt(p); msg(`${zoneAt(u, v, lv).name}`, 1200); } else msg('Туда не встать — выберите место свободнее', 1600);
  });

  // ── Оверлей: старт и пауза ─────────────────────────────────────────────────
  function showOverlay(mode) {
    el.ov.hidden = false;
    el.ov.dataset.mode = mode;
    if (mode === 'pause') {
      el.ovTitle.textContent = 'Пауза';
      el.ovLead.textContent = 'Прогулка на паузе. «Продолжить» — вернуться, Esc — выйти к модели. По карте в углу можно кликнуть, чтобы перенестись.';
      el.go.textContent = 'Продолжить';
      el.back.textContent = 'Выйти из прогулки';
    } else {
      el.ovTitle.textContent = 'Прогулка по кампусу';
      el.ovLead.textContent = lastPos
        ? 'Продолжим с того места, где вы остановились. Или вернитесь к главному входу.'
        : 'Вы стоите на улице перед главным входом. Поднимитесь по ступеням, пройдите турникеты — дальше все этажи ваши.';
      el.go.textContent = ready ? 'Начать' : 'Готовлю физику…';
      el.back.textContent = 'Назад к модели';
    }
    el.go.disabled = !ready;
    el.spawn.hidden = mode !== 'pause' && !lastPos;
    if (!isTouch && ready) requestAnimationFrame(() => { try { el.go.focus({ preventScroll: true }); } catch { /* ignore */ } });
  }
  function hideOverlay() { el.ov.hidden = true; }
  function resume() {
    if (!ready) return;
    hideOverlay();
    paused = false;
    if (canLock) requestLock();
  }
  el.go.addEventListener('click', resume);
  el.spawn.addEventListener('click', () => { respawn(); resume(); });
  el.back.addEventListener('click', () => exit());
  el.exit.addEventListener('click', (e) => { e.stopPropagation(); exit(); });

  // ── Мышь и клавиатура ──────────────────────────────────────────────────────
  function requestLock() {
    if (!canLock) return;
    try {
      const r = canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => lockFailed());
    } catch { lockFailed(); }
  }
  function lockFailed() {
    if (!active) return;
    paused = false; hideOverlay();
    if (++lockFails === 1) msg('Мышь не захватилась — зажмите кнопку и ведите, чтобы осмотреться (или кликните ещё раз)', 3600);
  }
  document.addEventListener('pointerlockchange', () => {
    const was = locked;
    locked = document.pointerLockElement === canvas;
    if (!active) return;
    if (locked) { paused = false; hideOverlay(); el.root.classList.add('locked'); }
    else {
      el.root.classList.remove('locked');
      if (was && !exitingLock) { unlockAt = performance.now(); paused = true; keys.clear(); showOverlay('pause'); }
    }
    exitingLock = false;
  });
  document.addEventListener('pointerlockerror', () => lockFailed());
  document.addEventListener('mousemove', (e) => {
    if (!active) return;
    if (locked) look(e.movementX, e.movementY, 0.0022);
    else if (drag && (e.buttons & 1)) {
      look(e.clientX - drag.x, e.clientY - drag.y, 0.0045);
      drag.x = e.clientX; drag.y = e.clientY; drag.moved = true;
    }
  });
  let drag = null, dragMoved = false;
  canvas.addEventListener('mousedown', (e) => {
    if (!active || isTouch || locked || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
  });
  addEventListener('mouseup', () => { if (drag) { dragMoved = drag.moved; drag = null; } });
  canvas.addEventListener('click', () => {
    if (!active || isTouch || locked || dragMoved) { dragMoved = false; return; }
    if (ready && el.ov.hidden) requestLock();
  });
  const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyQ', 'KeyE', 'ControlLeft']);
  addEventListener('keydown', (e) => {
    if (!active || e.target.closest?.('input,textarea,select')) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (!el.ov.hidden) { if (performance.now() - unlockAt > 300) exit(); return; }
      // обычно Esc при захваченной мыши съедает браузер (дальше — pointerlockchange → пауза),
      // но если событие всё же дошло — отпускаем мышь сами
      if (locked) { document.exitPointerLock?.(); return; }
      paused = true; keys.clear(); unlockAt = performance.now(); showOverlay('pause');
      return;
    }
    if (MOVE_KEYS.has(e.code)) e.preventDefault();
    if (!el.ov.hidden) return;
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space' && !sim.fly) jumpQueued = true;
    else if (e.code === 'KeyF') setFly(!sim.fly);
    else if (e.code === 'KeyM') { mapBig = !mapBig; el.root.classList.toggle('bigmap', mapBig); mapCtx = null; mapKey = ''; }
    else if (e.code === 'KeyB') {
      const bs = levels().filter((l) => l.basement).reverse();
      if (!bs.length) return;
      const i = bs.findIndex((l) => l.id === here.level);
      gotoLevel(bs[(i + 1) % bs.length].id);
    } else {
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m) { const f = floorsForKeys()[+m[1] - 1]; if (f) gotoLevel(f.id); }
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); joyEnd(); upHeld = false; });

  // ── Сенсорное управление ───────────────────────────────────────────────────
  let joyId = null, lookId = null, joyO = null, lookP = null;
  const knob = el.joy?.querySelector('i');
  const JOY_R = 52;
  function joyEnd() {
    joyId = null; joy.x = 0; joy.y = 0;
    if (knob) knob.style.transform = '';
    if (el.joy) { el.joy.style.left = ''; el.joy.style.top = ''; el.joy.classList.remove('on'); }
  }
  if (el.touch) {
    el.touch.addEventListener('pointerdown', (e) => {
      if (!active || e.pointerType === 'mouse') return;
      e.preventDefault();
      try { el.touch.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const W = el.root.clientWidth, H = el.root.clientHeight;
      const r = el.root.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (joyId === null && x < W * 0.45 && y > H * 0.3) {
        joyId = e.pointerId; joyO = { x: e.clientX, y: e.clientY };
        if (el.joy) { el.joy.style.left = `${x - el.joy.offsetWidth / 2}px`; el.joy.style.top = `${y - el.joy.offsetHeight / 2}px`; el.joy.classList.add('on'); }
      } else if (lookId === null) { lookId = e.pointerId; lookP = { x: e.clientX, y: e.clientY }; }
    });
    el.touch.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyId) {
        let dx = (e.clientX - joyO.x) / JOY_R, dy = (e.clientY - joyO.y) / JOY_R;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        const dead = l < 0.12 ? 0 : 1;
        joy.x = dx * dead; joy.y = -dy * dead;
        if (knob) knob.style.transform = `translate(${dx * JOY_R * 0.62}px, ${dy * JOY_R * 0.62}px)`;
      } else if (e.pointerId === lookId) {
        look(e.clientX - lookP.x, e.clientY - lookP.y, 0.0048);
        lookP.x = e.clientX; lookP.y = e.clientY;
      }
    });
    const end = (e) => { if (e.pointerId === joyId) joyEnd(); if (e.pointerId === lookId) lookId = null; };
    el.touch.addEventListener('pointerup', end);
    el.touch.addEventListener('pointercancel', end);
  }
  const hold = (b, down, up) => {
    if (!b) return;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); down(); });
    if (up) for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, up);
    b.addEventListener('click', (e) => e.preventDefault());
  };
  hold(el.run, () => { runToggle = !runToggle; el.run.setAttribute('aria-pressed', String(runToggle)); });
  hold(el.jump, () => { if (sim.fly) upHeld = true; else jumpQueued = true; }, () => { upHeld = false; });
  hold(el.flyBtn, () => setFly(!sim.fly));

  // ── Старт / стоп ───────────────────────────────────────────────────────────
  async function start(opts = {}) {
    if (!active) {
      active = true;
      manual = !!opts.manual;
      paused = true; ready = false;
      hooks.onStart?.();
      saved = { near: camera.near, fov: camera.fov, pr: renderer.getPixelRatio() };
      camera.near = 0.05;
      setWalkFov();
      if (isTouch) {
        const pr = Math.min(window.devicePixelRatio || 1, 1.5);
        if (pr < saved.pr) hooks.setPixelRatio?.(pr);
      }
      el.root.hidden = false;
      document.body.classList.add('walking');
      buildFloors();
      mapCtx = null; mapKey = '';
      if (opts.overlay !== false) showOverlay('start');
      else hideOverlay();
      el.keys?.classList.remove('gone');
      setTimeout(() => el.keys?.classList.add('gone'), 9000);
      // первый кадр — сразу у входа, пока строится физика
      const sp = spawnPoint();
      if (!lastPos || opts.spawn) {
        yaw = 0; pitch = 0;
        sim.pos.set(sx(sp.u), sy(B.GRADE), sz(sp.v)); sim.prev.copy(sim.pos);
      } else {
        sim.pos.copy(lastPos.pos); sim.prev.copy(lastPos.pos); yaw = lastPos.yaw; pitch = lastPos.pitch;
      }
      applyCamera(1);
    } else if (opts.manual !== undefined) manual = !!opts.manual;
    await new Promise((r) => setTimeout(r, 30));      // даём оверлею отрисоваться
    await ensureCollider();
    if (!active) return null;
    if (!ready) {
      if (lastPos && !opts.spawn) {
        sim.fly = !!lastPos.fly;
        const p = sim.fly || fitsAt(lastPos.pos) ? lastPos.pos.clone() : findSpot(toU(lastPos.pos.x), toV(lastPos.pos.z), toZ(lastPos.pos.y), 4, 1);
        if (p) placeAt(p); else respawn();
      } else respawn();
      ready = true;
      updateFlyUi();
      if (opts.overlay === false) paused = false;
      else if (!el.ov.hidden) showOverlay(el.ov.dataset.mode || 'start');
    }
    if (opts.spawn && ready) respawn();
    return state();
  }
  function stop() {
    if (!active) return;
    lastPos = { pos: sim.pos.clone(), yaw, pitch, fly: sim.fly };
    active = false; ready = false; paused = true; manual = false;
    if (document.pointerLockElement === canvas) { exitingLock = true; document.exitPointerLock(); }
    locked = false;
    keys.clear(); joyEnd(); lookId = null; drag = null;
    runToggle = false; el.run?.setAttribute('aria-pressed', 'false');
    el.root.hidden = true; el.root.classList.remove('locked');
    hideOverlay();
    document.body.classList.remove('walking');
    if (saved) {
      camera.near = saved.near; camera.fov = saved.fov; camera.updateProjectionMatrix();
      if (saved.pr !== renderer.getPixelRatio()) hooks.setPixelRatio?.(saved.pr);
    }
    hooks.onStop?.();
  }
  function exit() { if (hooks.exit) hooks.exit(); else stop(); }

  function state() {
    const u = toU(sim.pos.x), v = toV(sim.pos.z), z = toZ(sim.pos.y);
    const lv = levelAt(u, v, z);
    const zn = zoneAt(u, v, lv);
    return {
      u: +u.toFixed(3), v: +v.toFixed(3), z: +z.toFixed(3), level: lv, zone: zn.name, zoneId: zn.id,
      grounded: sim.grounded, fly: sim.fly, yaw: +(yaw / DEG).toFixed(1), pitch: +(pitch / DEG).toFixed(1),
      speed: +Math.hypot(sim.vel.x, sim.vel.z).toFixed(2), vy: +sim.vel.y.toFixed(2),
      active, ready, paused,
    };
  }

  // API для консоли и headless-тестов (window.__s21.walk)
  const api = {
    start: (opts = {}) => start(opts),
    stop: () => exit(),
    teleport: (u, v, lvl, opts) => (ready ? teleport(u, v, lvl, opts) : null),
    setInput(o = {}) {
      manual = true;
      tin.x = (o.right ? 1 : 0) - (o.left ? 1 : 0) + (o.x || 0);
      tin.y = (o.forward ? 1 : 0) - (o.back ? 1 : 0) + (o.y || 0);
      tin.run = !!o.run; tin.up = o.up ? 1 : 0; tin.down = o.down ? 1 : 0;
      if (o.jump && !testJumpHeld) jumpQueued = true;
      testJumpHeld = !!o.jump;
      return api;
    },
    look(yawDeg, pitchDeg = 0) { yaw = yawDeg * DEG; pitch = clamp(pitchDeg * DEG, -1.5, 1.5); applyCamera(1); return api; },
    lookAt(u, v) { yaw = Math.atan2(-(u - toU(sim.pos.x)), v - toV(sim.pos.z)); applyCamera(1); return +(yaw / DEG).toFixed(1); },
    step(dt = 1 / 60, n = 1) {
      if (!ready) return null;
      for (let i = 0; i < n; i++) advance(dt);
      applyCamera(1); updateHere(); cullLevels();
      return state();
    },
    state,
    fly: (on = true) => { setFly(!!on); return state(); },
    fits: (u, v, z) => fitsAt(new THREE.Vector3(sx(u), sy(z), sz(v))),
    // что мешает встать в точке (u, v, z): треугольники в координатах здания
    blockers(u, v, z) {
      const p = new THREE.Vector3(sx(u), sy(z), sz(v));
      const conv = (a) => [+toU(a[0]).toFixed(2), +toV(a[2]).toFixed(2), +toZ(a[1]).toFixed(2)];
      return collider.blockers(p, PLAYER.radius, p.y + PLAYER.step, p.y + PLAYER.height - 0.02)
        .map((t) => ({ a: conv(t.a), b: conv(t.b), c: conv(t.c), push: t.push }));
    },
    stats: () => ({ ...collider.stats, cuts: collider.cutReport, physSteps: perf.steps, physMsPerStep: perf.steps ? +(perf.ms / perf.steps).toFixed(4) : null }),
    resetPerf: () => { perf.steps = 0; perf.ms = 0; },
    rebuild: () => { invalidate(); return ensureCollider(); },
    gotoLevel: (id) => { gotoLevel(id); return state(); },
    respawn: () => { respawn(); return state(); },
  };

  return {
    get active() { return active; },
    start, stop, update, invalidate, teleport, gotoLevel,
    onResize() { if (!active) return; setWalkFov(); mapCtx = null; mapKey = ''; },
    level: () => here.level,
    api,
  };
}
