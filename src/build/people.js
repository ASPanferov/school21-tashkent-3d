// Люди кампуса. Модели — Quaternius «Ultimate Modular Men/Women» (CC0, assets/people), скелет и анимации общие.
// Каждый персонаж — один SkinnedMesh с цветами вершин: одежда перекрашивается без текстур, одна отрисовка на человека.
// Позы, которых нет в анимациях (сидя, хлопки, ликование, печать), собираются поверх скелета: кости
// «прицеливаются» в нужное направление относительно позы покоя (см. aim()).
// Обычный режим — студенты за столами в кластерах, люди в лобби, лаунжах и амфитеатре;
// режим «Праздник» — все в ивент-холле: зрители в рядах, толпа у стен, ведущий у экрана.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { P, rng } from '../lib/geom.js';
import * as B from '../data/building.js';

const BASE = 'assets/people/';
export const TYPES = ['m_hoodie', 'm_casual', 'm_beach', 'm_business', 'm_punk', 'w_casual', 'w_dress', 'w_suit', 'w_punk'];
const LOW_TYPES = ['m_hoodie', 'm_casual', 'w_casual', 'w_suit'];

// Части одежды: «Часть:Материал» из модели → слот палитры
const SLOTS = {
  m_hoodie: { 'Body:Purple': 'top', 'Legs:LightBlue': 'pants', 'Feet:Purple': 'shoes', 'Feet:White': 'sole', 'Head:Hair': 'hair', 'Head:Eyebrows': 'brow' },
  m_casual: { 'Body:LightBrown': 'top', 'Legs:LightBlue': 'pants', 'Feet:Red_Dark': 'shoes', 'Feet:White': 'sole', 'Head:Hair': 'hair', 'Head:Eyebrows': 'brow', 'Head:Skin_Darker': 'skin2' },
  m_beach: { 'Body:LightBrown': 'top', 'Legs:Red_Dark': 'pants', 'Legs:White': 'pants2', 'Feet:Red_Dark': 'shoes', 'Head:Hair': 'hair', 'Head:Eyebrows': 'brow' },
  m_business: { 'Body:Suit': 'top', 'Legs:Suit': 'pants', 'Body:White': 'shirt', 'Body:Tie': 'tie', 'Feet:Black': 'shoes', 'Head:Hair': 'hair', 'Head:Eyebrows': 'brow' },
  m_punk: { 'Body:Black': 'top', 'Body:White': 'shirt', 'Legs:LightBlue': 'pants', 'Feet:Black': 'shoes', 'Head:Red': 'hair', 'Head:Red_Dark': 'hair', 'Head:Eyebrows': 'brow' },
  w_casual: { 'Body:White': 'top', 'Legs:Orange': 'pants', 'Feet:Grey': 'shoes', 'Head:Hair_Blond': 'hair', 'Head:Hair_Brown': 'brow' },
  w_dress: { 'Body:LimeGreen': 'top', 'Legs:LimeGreen': 'top', 'Body:Gold': 'belt', 'Feet:Red': 'shoes', 'Head:Red': 'hair', 'Head:Brown': 'brow' },
  w_suit: { 'Body:Black': 'top', 'Body:White': 'shirt', 'Legs:Black': 'pants', 'Feet:Black': 'shoes', 'Head:Hair_Blond': 'hair', 'Head:Hair_Brown': 'brow' },
  w_punk: { 'Body:Pink': 'top', 'Body:Black': 'shirt', 'Legs:Black': 'pants', 'Feet:Black': 'shoes', 'Feet:Grey': 'sole', 'Head:Pink': 'hair', 'Head:Black': 'hair', 'Head:Hair_Brown': 'brow' },
};
const SKIN = ['#efcfae', '#e3bd97', '#d4a77f', '#c49269', '#a8774f', '#875a3a'];
const HAIR = ['#17110d', '#1f1712', '#2a1d14', '#3a2819', '#4c3522', '#6b4a2c', '#9c7a4a'];
const TEAL = '#2fd0b3';
// Одежда кампуса: «форма» School 21 — чёрное с бирюзовым знаком «21», остальное — спокойные современные цвета
const CASUAL_TOP = ['#e9e6df', '#2b2f36', '#46566b', '#6f7c55', '#8a3b3b', '#c9a36a', '#5b4c7a', '#d7d2c8', '#3d6b6b', '#b85c38', '#7a8ea8', '#e3c4b4'];
const PANTS = ['#2c3440', '#22262c', '#3b4552', '#5a5145', '#1e2a3a', '#7d7466', '#40362e'];
const SHOES = ['#f2f2f0', '#1d1d1f', '#3a3a3c', '#e8e2d6', '#7a1f2b', '#26405e'];

// Персонажи: роль задаёт модель, одежду и поведение. form: true — фирменная одежда со знаком «21»
const ROLES = [
  { id: 'peer21', w: 3, types: ['m_hoodie', 'm_casual', 'w_casual'], form: true, top: ['#18191d', '#18191d', '#f4f4f2'], pants: ['#22262c', '#2c3440'] },
  { id: 'peer', w: 6, types: ['m_hoodie', 'm_casual', 'm_beach', 'w_casual', 'w_punk', 'm_punk'], form: false },
  { id: 'adm', w: 1, types: ['m_casual', 'w_casual', 'w_suit'], form: true, top: ['#18191d', TEAL], pants: ['#18191d'] },
  { id: 'guest', w: 1.2, types: ['m_business', 'w_suit', 'w_dress'], form: false },
];

function hexToLin(hex) { return new THREE.Color(hex); }

// ── Загрузка и подготовка шаблонов ───────────────────────────────────────────
async function loadTemplates(types) {
  const L = new GLTFLoader();
  const [anims, ...models] = await Promise.all([L.loadAsync(BASE + 'anims.glb'), ...types.map((t) => L.loadAsync(BASE + t + '.glb'))]);
  const clips = Object.fromEntries(anims.animations.map((c) => [c.name, c]));
  const templates = {};
  types.forEach((type, i) => { templates[type] = prepare(type, models[i].scene); });
  // позы, которых нет в паке (сидя, печать, хлопки, ликование), запекаются в клипы под пропорции каждой модели
  for (const tpl of Object.values(templates)) tpl.clips = { ...clips, ...bakeClips(tpl, clips) };
  return { templates, clips };
}

// Все куски модели → один SkinnedMesh с цветами вершин; запоминаем диапазоны слотов и позу покоя костей
function prepare(type, scene) {
  const meshes = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const first = meshes[0];
  const geos = [], ranges = [];
  let at = 0;
  for (const m of meshes) {
    const part = ((m.name + ' ' + (m.parent?.name || '')).match(/(Feet|Legs|Body|Head)/) || [, 'Body'])[1];
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) g.setAttribute(k, m.geometry.attributes[k]);
    g.setIndex(m.geometry.index ?? [...Array(m.geometry.attributes.position.count).keys()]);
    const ng = g;
    const n = ng.attributes.position.count;
    const key = `${part}:${m.material.name}`;
    const col = m.material.color.clone();
    ranges.push({ key, slot: SLOTS[type]?.[key] || (/Skin/.test(m.material.name) ? 'skin' : null), start: at, count: n, color: col });
    at += n;
    geos.push(ng);
  }
  const merged = mergeGeometries(geos);
  merged.computeBoundingSphere();
  merged.boundingSphere.radius *= 1.5;                    // запас на анимацию (рука вверх, шаг, сидя)
  const mesh = new THREE.SkinnedMesh(merged, MAT);
  mesh.name = 'person-mesh';
  mesh.bind(first.skeleton, first.bindMatrix);
  first.parent.add(mesh);
  for (const m of meshes) m.parent.remove(m);
  // поза покоя в пространстве модели (корень шаблона в нуле)
  first.skeleton.pose();
  scene.updateMatrixWorld(true);
  const rest = {};
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const b of first.skeleton.bones) {
    b.matrixWorld.decompose(p, q, s);
    rest[b.name] = { q: q.clone(), dir: new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize(), local: b.quaternion.clone(), pos: p.clone() };
  }
  return { type, scene, ranges, rest, count: at };
}

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 });
MAT.name = 'people';

// Знак «21» на груди: бирюзовый квадрат со скруглением
let badgeTex = null;
function badgeTexture() {
  if (badgeTex) return badgeTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = TEAL; g.beginPath(); g.roundRect(8, 8, 112, 112, 22); g.fill();
  g.fillStyle = '#10163a'; g.font = '700 70px "Unbounded", "Onest", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('21', 64, 70);
  badgeTex = new THREE.CanvasTexture(c); badgeTex.colorSpace = THREE.SRGBColorSpace; badgeTex.anisotropy = 4;
  return badgeTex;
}
let badgeMat = null;
const BADGE_MAT = () => (badgeMat ??= new THREE.MeshStandardMaterial({ map: badgeTexture(), transparent: true, roughness: 0.6, emissive: 0x2fd0b3, emissiveIntensity: 0.15, polygonOffset: true, polygonOffsetFactor: -2 }));

// высота сиденья → ключ клипа (с шагом 2 см: кресла 0.49, стулья 0.47, ступени амфитеатра ~0.49)
const seatKey = (h) => (Math.round(h * 50) / 50).toFixed(2);
const BAKE_BONES = ['Body', 'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR', 'FootL', 'FootR', 'UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR'];
const SEATS_H = [0.47, 0.49, 0.5];
// Запекание: клон шаблона проигрывает Idle, на каждом из 25 кадров поверх правим кости и пишем их локальные
// повороты/положения в дорожки; остальные дорожки (дыхание, голова) берутся из Idle как есть.
function bakeClips(tpl, clips) {
  const idle = clips.Idle, D = idle.duration, N = 25;
  const p = new Person(tpl, clips, {}, () => 0.5);
  p.loopD = D;
  const out = {};
  const jobs = [['Clap'], ['Cheer'], ...SEATS_H.flatMap((h) => ['Sit', 'SitType', 'SitClap'].map((k) => [k, h]))];
  for (const [kind, seat] of jobs) {
    const times = [], q = {}, pos = {};
    for (const b of BAKE_BONES) { q[b] = []; pos[b] = []; }
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1)) * D;
      p.mixer.stopAllAction();
      const a = p.mixer.clipAction(idle); a.play(); p.mixer.setTime(t);
      p.t = t;
      p.bakePose(kind, seat);
      times.push(t);
      for (const b of BAKE_BONES) { const bone = p.bones[b]; if (!bone) continue; q[b].push(...bone.quaternion.toArray()); pos[b].push(...bone.position.toArray()); }
    }
    const touched = new Set(kind === 'Clap' || kind === 'Cheer' ? ['UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR'] : BAKE_BONES);
    const keep = idle.tracks.filter((tr) => !touched.has(tr.name.split('.')[0]));
    const tracks = [...keep.map((tr) => tr.clone())];
    for (const b of touched) {
      if (!p.bones[b]) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, q[b]));
      if (b === 'Body' || b.startsWith('Foot')) tracks.push(new THREE.VectorKeyframeTrack(`${b}.position`, times, pos[b]));
    }
    const name = seat ? `${kind}@${seatKey(seat)}` : kind;
    out[name] = new THREE.AnimationClip(name, D, tracks);
  }
  return out;
}

// ── Персонаж ─────────────────────────────────────────────────────────────────
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
const Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), M = new THREE.Matrix4(), MI = new THREE.Matrix4();
const UPY = new THREE.Vector3(0, 1, 0);

class Person {
  constructor(tpl, clips, look, R) {
    this.tpl = tpl;
    this.root = cloneSkinned(tpl.scene);
    this.root.name = 'person';
    this.root.userData.noCollide = true;
    this.mesh = this.root.getObjectByName('person-mesh');
    this.mesh.frustumCulled = true;
    // своя геометрия только для цвета, остальные атрибуты общие с шаблоном
    const src = this.mesh.geometry, g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
    g.setIndex(src.index);
    g.boundingSphere = src.boundingSphere;
    this.mesh.boundingSphere = src.boundingSphere.clone();
    const col = new Uint16Array(tpl.count * 3);
    const c = new THREE.Color();
    for (const r of tpl.ranges) {
      const hex = r.slot && look[r.slot];
      if (hex) c.set(hex); else c.copy(r.color);
      if (r.slot === 'brow' && look.hair) c.set(look.hair).multiplyScalar(0.7);
      if (r.slot === 'skin2' && look.skin) c.set(look.skin).multiplyScalar(0.88);
      for (let i = r.start; i < r.start + r.count; i++) { col[i * 3] = c.r * 65535; col[i * 3 + 1] = c.g * 65535; col[i * 3 + 2] = c.b * 65535; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    this.mesh.geometry = g;
    this.bones = {};
    this.mesh.skeleton.bones.forEach((b) => { this.bones[b.name] = b; });
    this.ends = { L: this.root.getObjectByName('LowerLegL_end'), R: this.root.getObjectByName('LowerLegR_end') };
    if (look.badge) this.addBadge();
    // кости в GPU — только после того, как человек реально пошевелился (дальние анимируются реже)
    const sk = this.mesh.skeleton, skUpdate = sk.update.bind(sk);
    this.dirty = true;
    sk.update = () => { if (this.dirty) { skUpdate(); this.dirty = false; } };
    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = tpl.clips || clips;
    this.R = R;
    this.t = R() * 10;
    this.pose = { kind: 'stand' };
    this.path = null;
  }
  addBadge() {
    // клон стоит в позе покоя и в нуле: точку на груди (слева, спереди) переводим в систему кости Chest
    const chest = this.bones.Chest, rest = this.tpl.rest.Chest;
    this.root.updateMatrixWorld(true);
    const inv = chest.matrixWorld.clone().invert();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), BADGE_MAT());
    m.position.copy(new THREE.Vector3(0.075, rest.pos.y - 0.05, rest.pos.z + 0.16).applyMatrix4(inv));
    const wq = new THREE.Quaternion(); chest.getWorldQuaternion(wq);
    m.quaternion.copy(wq.invert());
    const ws = new THREE.Vector3(); chest.getWorldScale(ws);
    m.scale.setScalar(1 / (ws.x || 1));
    chest.add(m);
  }
  play(name, { fade = 0.25, speed = 1, offset = null } = {}) {
    const clip = this.clips[name];
    if (!clip) return;
    const a = this.mixer.clipAction(clip);
    if (this.action === a) return;
    a.reset(); a.timeScale = speed; a.play();
    a.time = offset ?? this.R() * clip.duration;
    if (this.action) this.action.crossFadeTo(a, fade, false);
    this.action = a;
  }
  // поставить человека: (u, v, z) — точка на полу (для сидящих — центр сиденья), face — направление взгляда (u, v)
  place(u, v, z, face) {
    const p = P(u, v, z);
    this.root.position.copy(p);
    this.root.rotation.set(0, Math.atan2(face[0], -face[1]), 0);
    this.root.updateMatrixWorld(true);
  }
  // позы: stand, talk, wave, walk, host — клипы пака; sit, sitType, sitClap, clap, cheer — запечённые (bakeClips)
  setPose(kind, opts = {}) {
    this.pose = { kind, ...opts };
    const h = opts.seat ?? 0.47, near = SEATS_H.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a));
    const sitSeat = kind.startsWith('sit') ? `@${seatKey(near)}` : '';
    const name = { stand: 'Idle', talk: 'Idle_Neutral', wave: 'Wave', walk: 'Walk', host: 'Interact', sit: 'Sit', sitType: 'SitType', sitClap: 'SitClap', clap: 'Clap', cheer: 'Cheer' }[kind] || 'Idle';
    this.play(name + sitSeat, { speed: kind === 'walk' || kind.includes('lap') || kind === 'cheer' ? 1 : 0.8 + this.R() * 0.4 });
  }
  update(dt) {
    this.dirty = true;
    this.t += dt;
    if (this.path) this.walkStep(dt);
    this.mixer.update(dt);
  }
  // одна поза-кадр для запекания: базовая анимация уже применена, сверху — правка костей
  bakePose(kind, seat) {
    this.root.updateWorldMatrix(true, false);
    MI.copy(this.root.matrixWorld).invert();
    if (kind === 'Clap' || kind === 'Cheer') { this.arms(kind.toLowerCase()); return; }
    this.sit(seat);
    this.arms(kind === 'SitType' ? 'type' : kind === 'SitClap' ? 'clap' : 'lap');
  }
  // ориентация кости в пространстве модели; матрицы обновляются только по цепочке предков
  modelQ(bone, out) { bone.updateWorldMatrix(true, false); M.multiplyMatrices(MI, bone.matrixWorld).decompose(V3, out, V4); return out; }
  setModelQ(bone, q) {
    this.modelQ(bone.parent, Q2);
    bone.quaternion.copy(Q2.invert().multiply(q));
  }
  aim(name, dir) {
    const b = this.bones[name], r = this.tpl.rest[name];
    if (!b || !r) return;
    Q.setFromUnitVectors(r.dir, V.copy(dir).normalize()).multiply(r.q);
    this.setModelQ(b, Q);
  }
  sit(seat) {
    const body = this.bones.Body, rb = this.tpl.rest.Body;
    // таз: ориентация покоя, высота — чтобы тазобедренные суставы были на ~0.1 выше сиденья
    this.setModelQ(body, rb.q);
    const hipY = this.tpl.rest.UpperLegL.pos.y, drop = hipY - (seat + 0.1);
    body.parent.updateWorldMatrix(true, false);
    M.multiplyMatrices(MI, body.parent.matrixWorld).invert();
    body.position.copy(V.set(rb.pos.x, rb.pos.y - drop, rb.pos.z - 0.06).applyMatrix4(M));
    for (const s of ['L', 'R']) {
      const x = s === 'L' ? 0.07 : -0.07;
      this.aim('UpperLeg' + s, V2.set(x, -0.06, 1));
      this.aim('LowerLeg' + s, V2.set(x * 0.4, -1, 0.16));
      // стопа (IK-кость у корня) — в конец голени, ориентация покоя
      const foot = this.bones['Foot' + s], end = this.ends[s];
      if (!foot || !end) continue;
      end.updateWorldMatrix(true, false);
      V.setFromMatrixPosition(end.matrixWorld);
      foot.parent.updateWorldMatrix(true, false);
      foot.position.copy(V.applyMatrix4(M.copy(foot.parent.matrixWorld).invert()));
      this.setModelQ(foot, this.tpl.rest['Foot' + s].q);
    }
  }
  arms(kind) {
    const t = this.t, D = this.loopD || 1.6667;
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      if (kind === 'lap') {
        this.aim('UpperArm' + s, V2.set(0.16 * sg, -0.8, 0.42));
        this.aim('LowerArm' + s, V2.set(-0.2 * sg, -0.45, 1));
      } else if (kind === 'type') {
        this.aim('UpperArm' + s, V2.set(0.2 * sg, -0.66, 0.6));
        this.aim('LowerArm' + s, V2.set(-0.18 * sg, -0.12 + 0.05 * Math.sin((t / D) * 2 * Math.PI * 3 + (s === 'L' ? 0 : 1.7)), 1));
      } else if (kind === 'clap') {
        // ладони сходятся по центру груди и расходятся на ~25 см, ~2.4 хлопка в секунду
        const open = 0.5 + 0.5 * Math.sin((t / D) * 2 * Math.PI * 4);
        this.aim('UpperArm' + s, V2.set(0.3 * sg, -0.45, 0.78));
        this.aim('LowerArm' + s, V2.set((-0.6 + 0.5 * open) * sg, 0.38, 0.75));
      } else if (kind === 'cheer') {
        const b = Math.sin((t / D) * 2 * Math.PI * 3 + (s === 'L' ? 0 : 0.6));
        this.aim('UpperArm' + s, V2.set(0.42 * sg, 0.88, 0.12 + 0.05 * b));
        this.aim('LowerArm' + s, V2.set(0.12 * sg, 1, 0.1 + 0.12 * b));
      }
    }
  }
  // прогулка туда-обратно по ломаной (u, v): скорость шага 1.3 м/с, разворот плавный
  walkTo(points, z, speed = 1.3) {
    this.path = { pts: points, z, i: 0, dir: 1, s: 0, speed };
    this.setPose('walk');
    const [a] = points;
    this.place(a[0], a[1], z, [points[1][0] - a[0], points[1][1] - a[1]]);
  }
  walkStep(dt) {
    const p = this.path, a = p.pts[p.i], b = p.pts[p.i + p.dir];
    if (!b) { p.dir = -p.dir; return; }
    const du = b[0] - a[0], dv = b[1] - a[1], len = Math.hypot(du, dv) || 1;
    p.s += p.speed * dt;
    if (p.s >= len) { p.s -= len; p.i += p.dir; if (!p.pts[p.i + p.dir]) p.dir = -p.dir; return; }
    const k = p.s / len, u = a[0] + du * k, v = a[1] + dv * k;
    const want = Math.atan2(du / len, -dv / len), cur = this.root.rotation.y;
    let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.position.copy(P(u, v, p.z));
    this.root.rotation.y = cur + d * Math.min(1, dt * 6);
  }
}

// ── Население ────────────────────────────────────────────────────────────────
function pickRole(R) {
  const tot = ROLES.reduce((s, r) => s + r.w, 0);
  let x = R() * tot;
  for (const r of ROLES) { x -= r.w; if (x <= 0) return r; }
  return ROLES[0];
}
const pick = (R, a) => a[Math.floor(R() * a.length) % a.length];
function lookFor(role, type, R) {
  const look = { skin: pick(R, SKIN), hair: pick(R, HAIR), shoes: pick(R, SHOES), sole: '#f0f0ee' };
  if (role.form) { look.top = pick(R, role.top); look.pants = pick(R, role.pants); look.badge = true; look.shoes = pick(R, ['#f2f2f0', '#1d1d1f']); }
  else if (role.id === 'guest') {
    look.top = pick(R, ['#1f2a3d', '#2b2f36', '#3c3f45', '#4a3b5c', '#0f3d3a']); look.pants = look.top; look.shirt = '#f2f1ee'; look.tie = TEAL;
    if (type === 'w_dress') look.top = pick(R, ['#2fd0b3', '#8f5bff', '#d94f6b', '#1f2a3d', '#e0b04a']);
  } else { look.top = pick(R, CASUAL_TOP); look.pants = pick(R, PANTS); look.shirt = pick(R, ['#f2f1ee', '#1d1d1f']); }
  if (type === 'm_beach') look.pants = pick(R, ['#3b4552', '#5a5145', '#22262c']);
  return look;
}

export function createPeople({ hq = true, levels }) {
  const R = rng(2121);
  let assets = null, people = [], mode = 'normal', seats = { desk: [], hall: [], amphi: [] }, camera = null, frame = 0, detail = true;
  const FAR = hq ? 42 : 28;                   // дальше — не рисуем вовсе (и не обходим при пересчёте матриц)
  const groups = {};                          // по уровням — чтобы разрез и прогулка прятали людей своего этажа
  const holder = (lv) => (groups[lv] ??= Object.assign(new THREE.Group(), { name: `people-${lv}` }));
  const attach = (lvs) => { levels = lvs; for (const [lv, g] of Object.entries(groups)) levels[lv]?.add(g); };

  function spawn(level, roleId = null) {
    const role = roleId ? ROLES.find((r) => r.id === roleId) : pickRole(R);
    const types = role.types.filter((t) => assets.templates[t]);
    const type = types.length ? pick(R, types) : Object.keys(assets.templates)[0];
    const p = new Person(assets.templates[type], assets.clips, lookFor(role, type, R), R);
    p.role = role.id; p.level = level; p.slot = people.length;
    holder(level).add(p.root);
    people.push(p);
    return p;
  }
  function clear() { for (const p of people) p.root.removeFromParent(); people = []; }

  function populateNormal() {
    const n = hq ? 1 : 0.45;
    // студенты за столами кластеров: часть мест, кластеры вперемешку
    const desk = seats.desk.filter(() => R() < 0.2 * n);
    for (const s of desk.slice(0, hq ? 30 : 14)) {
      const p = spawn(s.level, R() < 0.35 ? 'peer21' : 'peer');
      p.place(s.u, s.v, s.z, s.face); p.setPose('sitType', { seat: s.h });
    }
    // лекторий: несколько человек в рядах смотрят на экран
    for (const s of seats.amphi.filter(() => R() < 0.18 * n).slice(0, hq ? 9 : 4)) {
      const p = spawn('B1'); p.place(s.u, s.v, s.z, s.face); p.setPose('sit', { seat: s.h });
    }
    // группы в лобби, у турникетов, на площадке и в лаунже 3 этажа: стоят и общаются
    const groupsAt = [
      ['L1', 35.2, 24.8], ['L1', 41.5, 26.4], ['L1', 44.6, 28.6], ['L1', 33.6, 33.2], ['M', 21.5, 27.2], ['M', 16.8, 22.0],
      ['L3', 32.6, 26.0], ['L2', 33.0, 38.5], ['L2', 11.2, 27.5], ['L3', 11.4, 39.0],
    ];
    for (const [lv, u, v] of groupsAt.slice(0, hq ? 10 : 4)) {
      const k = 2 + Math.floor(R() * 2), z = lv === 'M' ? B.PLATFORM.z : B.LEVELS.find((l) => l.id === lv).z;
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + R(), r = 0.55 + R() * 0.15;
        const pu = u + Math.cos(a) * r, pv = v + Math.sin(a) * r;
        const p = spawn(lv); p.place(pu, pv, z, [u - pu, v - pv]); p.setPose(R() < 0.6 ? 'talk' : 'stand');
      }
    }
    // проходят по лобби и галерее
    const walks = [['L1', 0, [[44.5, 22.4], [36.0, 22.6], [33.0, 28.5]]], ['L1', 0, [[46.6, 8.5], [46.6, 17.5]]], ['L2', 4.5, [[33.6, 20.0], [33.6, 36.0]]], ['L3', 9.0, [[11.0, 15.0], [11.0, 40.0]]]];
    for (const [lv, z, pts] of walks.slice(0, hq ? 4 : 2)) { const p = spawn(lv); p.walkTo(pts, z); p.path.s = R() * 3; }
  }

  function populateParty() {
    const n = hq ? 1 : 0.5;
    // зрители в рядах ивент-холла: часть хлопает, часть машет
    for (const s of seats.hall.filter(() => R() < 0.27 * n)) {
      const p = spawn('L1', R() < 0.18 ? 'guest' : R() < 0.4 ? 'peer21' : 'peer');
      p.place(s.u, s.v, s.z, s.face); p.setPose(R() < 0.55 ? 'sitClap' : 'sit', { seat: s.h });
    }
    // толпа у задней стены и в боковом проходе: ликуют, хлопают, машут
    const spots = [];
    for (let v = 1.6; v < 15.2; v += 0.62) spots.push([29.4 + R() * 0.9, v]);
    for (let u = 17.0; u < 28.5; u += 0.75) spots.push([u, 14.6 + R() * 0.6]);
    for (const [u, v] of spots.filter(() => R() < 0.42 * n)) {
      const p = spawn('L1');
      p.place(u, v, 0, [13.0 - u, 8.3 - v]);
      const r = R(); p.setPose(r < 0.3 ? 'cheer' : r < 0.6 ? 'clap' : r < 0.8 ? 'wave' : 'talk');
    }
    // ведущий у экрана и пара гостей у торта
    const host = spawn('L1', 'adm'); host.place(14.45, 5.5, 0, [1, 0.12]); host.setPose('wave');
    for (const [u, v] of [[16.6, 9.4], [16.4, 7.0]]) { const p = spawn('L1', 'guest'); p.place(u, v, 0, [15.55 - u, 8.3 - v]); p.setPose('talk'); }
  }

  return {
    get count() { return people.length; },
    get loaded() { return !!assets; },
    async load() {
      if (!assets) assets = await loadTemplates(hq ? TYPES : LOW_TYPES);
      return this;
    },
    setSeats(s) { seats = s; },
    attach,
    setMode(m) {
      mode = m;
      if (!assets) return;
      clear();
      if (m === 'party') populateParty(); else populateNormal();
      attach(levels);
    },
    get mode() { return mode; },
    setCamera(c) { camera = c; },
    setDetail(on) { detail = on; },
    update(dt) {
      frame++;
      const cp = camera?.position;
      for (const p of people) {
        const lv = levels?.[p.level];
        p.acc = (p.acc || 0) + dt;
        const d = cp ? cp.distanceTo(p.root.position) : 0;
        const on = detail && !(lv && !lv.visible) && d < FAR;
        if (on !== !!p.root.parent) { if (on) holder(p.level).add(p.root); else p.root.removeFromParent(); }
        if (!on) continue;
        // анимация по дальности: ближе 8 м — каждый кадр, дальше — реже; накопленное время не теряется
        const every = d < 8 ? 1 : d < 18 ? 2 : d < 40 ? 4 : 6;
        if ((frame + p.slot) % every) continue;
        p.update(p.acc); p.acc = 0;
      }
    },
    people: () => people,
  };
}
