// School 21 · Ташкент — 3D-модель кампуса.
// Сцена, свет, камеры, разрезы по этажам, прогулка, выбор и редактирование зон.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as B from './data/building.js';
import { Materials } from './lib/materials.js';
import { setMaxAniso } from './lib/textures.js';
import { buildShell, BANDS } from './build/shell.js';
import { buildInterior } from './build/interior.js';
import { buildSite } from './build/site.js';
import { P, sx, sy, sz } from './lib/geom.js';
import { renderPlan } from './ui/plan.js';
import { renderSite } from './ui/sitemap.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;
const small = Math.min(innerWidth, innerHeight) < 700;
const STORE = 's21-zones-v1';

// ── Рабочая копия зон (правки из редактора живут в localStorage) ────────────
const clone = (o) => JSON.parse(JSON.stringify(o));
let ZONES = clone(B.ZONES);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (Array.isArray(saved) && saved.length) ZONES = saved;
} catch { /* хранилище недоступно — работаем с исходными данными */ }
const saveZones = () => { try { localStorage.setItem(STORE, JSON.stringify(ZONES)); } catch { /* ignore */ } };

const state = { view: '3d', cut: null, time: 'day', conf: false, edit: false, walk: false, selected: null, preset: 'front' };

// ── Рендерер и сцена ────────────────────────────────────────────────────────
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.6 : 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
stage.appendChild(renderer.domElement);
setMaxAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(stage.clientWidth, stage.clientHeight);
labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
stage.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, stage.clientWidth / stage.clientHeight, 0.08, 3000);
camera.position.copy(P(92, -62, 22));
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 1.5;
controls.maxDistance = 600;
controls.target.copy(P(30, 20, 5));
controls.screenSpacePanning = true;
fitFov(); camera.updateProjectionMatrix();

// ── Небо, солнце, окружение ──────────────────────────────────────────────────
// Градиентное небо: синий зенит → светлый горизонт + ореол солнца.
// Им же освещается сцена через PMREM — стекло отражает именно это небо (как на фото).
function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, sunGlow: { value: 1 },
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, bottom, pow(min(1.0, -h * 3.0), 0.6));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 1400.0) * 30.0 + pow(s, 14.0) * 0.45 * sunGlow + pow(s, 3.0) * 0.12 * sunGlow);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), makeSkyMaterial());
sky.name = 'sky';
sky.renderOrder = -1;
scene.add(sky);
const skyU = sky.material.uniforms;

const sun = new THREE.DirectionalLight(0xfff3df, 3.2);
sun.castShadow = true;
const sm = small ? 2048 : 4096;
sun.shadow.mapSize.set(sm, sm);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 5, far: 500 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.025;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdfeeff, 0x8a7d63, 0.65);
scene.add(hemi);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), sky.material);
envScene.add(envSky);
// «земля» в отражениях — тёплый серый, чтобы нижняя половина стекла не была синей
const envGround = new THREE.Mesh(new THREE.CircleGeometry(49, 32).rotateX(-Math.PI / 2).translate(0, -2, 0), new THREE.MeshBasicMaterial({ color: 0x6f6a60 }));
envScene.add(envGround);
let envRT = null;

// Направления в сцене: север и восток (здание повёрнуто на 39.1°)
const bu = THREE.MathUtils.degToRad(B.BEARING_U);
const NORTH = new THREE.Vector3(Math.cos(bu), 0, -Math.sin(bu));
const EAST = new THREE.Vector3(Math.sin(bu), 0, Math.cos(bu));
function sunDir(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return NORTH.clone().multiplyScalar(Math.cos(a)).add(EAST.clone().multiplyScalar(Math.sin(a))).multiplyScalar(Math.cos(e)).add(new THREE.Vector3(0, Math.sin(e), 0)).normalize();
}

const TIMES = {
  // конец сентября, Ташкент: полдень ~47° над горизонтом
  day: { az: 178, el: 47, sun: 3.2, sunColor: 0xfff0d8, hemi: 0.55, exp: 0.9, emissive: 0.35, bloom: 0, glassGlow: 0,
    sky: { top: 0x2f6fc4, horizon: 0xc6dcef, bottom: 0x8d8a80, sun: 0xfff2d6, glow: 1.0 }, fog: 0xc9dbea, env: 1.0 },
  eve: { az: 262, el: 6, sun: 2.4, sunColor: 0xffae6a, hemi: 0.4, exp: 0.95, emissive: 1.0, bloom: 0.35, glassGlow: 0.16,
    sky: { top: 0x33497f, horizon: 0xf2b387, bottom: 0x5a4b45, sun: 0xffc07a, glow: 2.2 }, fog: 0xd9a47e, env: 0.75 },
  night: { az: 210, el: -12, sun: 0.0, sunColor: 0x8fa8ff, hemi: 0.14, exp: 1.05, emissive: 1.6, bloom: 0.8, glassGlow: 0.32,
    sky: { top: 0x040811, horizon: 0x16223a, bottom: 0x0a0c12, sun: 0x000000, glow: 0 }, fog: 0x0b1222, env: 0.18 },
};

const mats = new Materials();

// ── Постобработка ────────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(stage.clientWidth, stage.clientHeight, { samples: small ? 0 : 4, type: THREE.HalfFloatType }));
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(stage.clientWidth, stage.clientHeight);
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (!small && !isTouch) {
  gtao = new GTAOPass(scene, camera, stage.clientWidth, stage.clientHeight);
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 12 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(stage.clientWidth, stage.clientHeight), 0.6, 0.5, 0.82);
bloom.enabled = false;
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ── Сборка модели ────────────────────────────────────────────────────────────
const world = { site: null, shell: null, interior: null, pick: [], overlay: null, labels: [] };
const loadmsg = (t) => { $('loadmsg').textContent = t; };

async function build() {
  await Promise.race([
    Promise.all(['700 20px Unbounded', '500 20px Onest', '700 20px Onest', '600 16px "JetBrains Mono"'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});
  loadmsg('Участок и соседние здания…');
  await tick();
  world.site = buildSite(mats);
  scene.add(world.site);
  loadmsg('Фасады, козырёк, стеклянная пирамида…');
  await tick();
  world.shell = buildShell(mats);
  for (const g of Object.values(world.shell)) scene.add(g);
  loadmsg('Этажи: кластеры, амфитеатр, лаунж…');
  await tick();
  buildInteriors();
  buildOverlay();
  applyTime('day');
  applyCut(null);
  fitCamera('front', true);
  $('loader').classList.add('gone');
  setTimeout(() => $('loader').remove(), 600);
}
// rAF не срабатывает во вкладке в фоне — страхуемся таймером
const tick = () => new Promise((r) => { let d = false; const go = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(go); setTimeout(go, 60); });

function buildInteriors() {
  if (world.interior) {
    for (const g of Object.values(world.interior.levels)) {
      scene.remove(g);
      g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
  }
  world.interior = buildInterior(mats, ZONES);
  world.pick = world.interior.pick;
  for (const g of Object.values(world.interior.levels)) scene.add(g);
  // инстансы мебели: помечаем, чтобы прятать в дальнем виде снаружи
  for (const g of Object.values(world.interior.levels)) g.traverse((o) => { if (o.isInstancedMesh) o.userData.detail = true; });
}

// Цветные метки достоверности по фасадам (режим «Достоверность»)
function buildOverlay() {
  const g = new THREE.Group();
  g.name = 'confidence-overlay';
  const col = { photo: 0x19c2a6, video: 0x3d7fe0, inferred: 0xf0a030 };
  const S = B.SIZE;
  const sides = { SE: [[0, -0.5], [S, -0.5]], NE: [[S + 0.5, 0], [S + 0.5, S]], NW: [[S, S + 0.5], [0, S + 0.5]], SW: [[-0.5, S], [-0.5, 0]] };
  for (const [side, f] of Object.entries(B.FACADES)) {
    const [[u0, v0], [u1, v1]] = sides[side];
    const len = Math.hypot(u1 - u0, v1 - v0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: col[f.confidence] }));
    m.position.copy(P((u0 + u1) / 2, (v0 + v1) / 2, B.PARAPET_Z + 0.3));
    m.rotation.y = side === 'NE' || side === 'SW' ? Math.PI / 2 : 0;
    g.add(m);
  }
  g.visible = false;
  scene.add(g);
  world.overlay = g;
}

// ── Время суток ──────────────────────────────────────────────────────────────
function applyTime(t) {
  state.time = t;
  const T = TIMES[t];
  const d = sunDir(T.az, T.el);
  sun.position.copy(d.clone().multiplyScalar(220));
  sun.target.position.set(0, 0, 0);
  sun.intensity = T.sun;
  sun.color.set(T.sunColor);
  sun.visible = T.sun > 0;
  hemi.intensity = T.hemi;
  skyU.top.value.set(T.sky.top); skyU.horizon.value.set(T.sky.horizon); skyU.bottom.value.set(T.sky.bottom);
  skyU.sunColor.value.set(T.sky.sun); skyU.sunGlow.value = T.sky.glow; skyU.sunDir.value.copy(d);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.015);
  scene.environment = envRT.texture;
  scene.environmentIntensity = T.env;
  tuneEnv();
  renderer.toneMappingExposure = T.exp;
  scene.background = null;
  scene.fog = new THREE.Fog(T.fog, 280, 1400);
  // светильники, логотипы, «светящиеся» окна
  for (const m of mats.cache.values()) {
    if (m.userData.e0 === undefined) m.userData.e0 = m.emissiveIntensity ?? 0;
    if (!('emissiveIntensity' in m)) continue;
    const base = m.userData.e0;
    if (/^led/.test(m.name)) m.emissiveIntensity = base * (t === 'day' ? 0.55 : T.emissive);
    else if (/^teal21/.test(m.name)) m.emissiveIntensity = t === 'day' ? 0.15 : t === 'eve' ? 0.9 : 1.8;
    else if (/^glass(Blue|Green)/.test(m.name)) { m.emissive?.set(0xffd7a0); m.emissiveIntensity = T.glassGlow; }
  }
  bloom.enabled = T.bloom > 0;
  bloom.strength = T.bloom;
  renderer.shadowMap.needsUpdate = true;
  document.querySelectorAll('#timeSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.id === { day: 't-day', eve: 't-eve', night: 't-night' }[t])));
}

// Отражения: стекло и металл — сильные, матовые поверхности — слабые (контраст как на фото)
function tuneEnv() {
  for (const m of mats.cache.values()) {
    if (!('envMapIntensity' in m)) continue;
    if (m.userData.env0 === undefined) m.userData.env0 = m.envMapIntensity;
    const shiny = /^(glass|skyGlass|stainless|mullion|steel|car|water|partition|serverGlass)/.test(m.name) || (m.metalness ?? 0) > 0.5;
    m.envMapIntensity = shiny ? m.userData.env0 : Math.min(m.userData.env0, 0.38);
  }
}

// ── Разрез по этажам ─────────────────────────────────────────────────────────
const ORDER = ['B2', 'B1', 'L1', 'M', 'L2', 'L3'];
const CEIL_OWNER = { B2: 'B1', B1: 'L1', L1: 'L2', M: 'L3', L2: 'L3', L3: 'ROOF' };
function applyCut(cut) {
  state.cut = cut;
  const ci = cut ? ORDER.indexOf(cut) : ORDER.length;
  const visible = {};
  for (const id of ORDER) {
    const i = ORDER.indexOf(id);
    const basement = id === 'B1' || id === 'B2';
    visible[id] = cut ? i <= ci : !basement;
    if (cut && basement && !(cut === 'B1' || cut === 'B2')) visible[id] = false;
  }
  visible.ROOF = !cut;
  for (const id of ORDER) {
    const g = world.interior.levels[id];
    g.visible = visible[id];
    g.userData.ceiling.visible = !!visible[CEIL_OWNER[id]];
  }
  // пояса фасада
  const bandVisible = { L1: !cut || ci >= ORDER.indexOf('L1'), L2: !cut || ci >= ORDER.indexOf('L2'), L3: !cut || ci >= ORDER.indexOf('L3'), ROOF: !cut };
  if (cut === 'B1' || cut === 'B2') { bandVisible.L1 = false; bandVisible.L2 = false; bandVisible.L3 = false; }
  for (const b of BANDS) world.shell[b.id].visible = bandVisible[b.id];
  // земля мешает смотреть в подвал
  world.site.children.forEach((c) => { if (c.name === 'site-ground') c.visible = !(cut === 'B1' || cut === 'B2'); });
  // стекло верхнего видимого пояса — прозрачнее, чтобы видеть интерьер сбоку
  const topBand = cut ? (ci >= ORDER.indexOf('L3') ? 'L3' : ci >= ORDER.indexOf('L2') ? 'L2' : 'L1') : null;
  for (const m of mats.cache.values()) {
    if (!m.userData.level || !/^glass/.test(m.name)) continue;
    m.opacity = topBand && m.userData.level === topBand ? 0.3 : m.userData.baseOpacity;
  }
  updateDetailVisibility();
  renderer.shadowMap.needsUpdate = true;
  updateLabels();
  renderRail();
  if (state.view === 'plan') showPlan();
}

// мебель прячем, когда смотрим на здание издалека снаружи без разреза
let detailOn = true;
function updateDetailVisibility() {
  const p = camera.position;
  const inside = Math.abs(p.x) < B.SIZE / 2 + 1 && Math.abs(p.z) < B.SIZE / 2 + 1 && p.y < sy(B.PARAPET_Z);
  const near = p.distanceTo(controls.target) < 70;
  const want = !!state.cut || inside || state.walk || near;
  if (want === detailOn) return;
  detailOn = want;
  for (const g of Object.values(world.interior.levels)) g.traverse((o) => { if (o.userData.detail) o.visible = want; });
  renderer.shadowMap.needsUpdate = true;
}

// ── Подписи зон в разрезе ────────────────────────────────────────────────────
const TYPE_NAMES = {
  cluster: 'Кластер', lobby: 'Лобби', corridor: 'Коридор', lounge: 'Лаунж', amphitheater: 'Амфитеатр', platform: 'Выставочная зона',
  void: 'Второй свет', kitchen: 'Кухня', meeting: 'Переговорная', conference: 'Конференц-зал', game: 'Игровая', pingpong: 'Пинг-понг',
  server: 'Серверная', library: 'Библиотека', stair: 'Лестница', lift: 'Лифты', wc: 'Санузлы', tech: 'Техпомещение', office: 'Офис',
  wardrobe: 'Гардероб', storage: 'Склад', gallery: 'Галерея', turnstiles: 'Турникеты', photozone: 'Фотозона', grandstair: 'Лестница',
};
function updateLabels() {
  for (const l of world.labels) { l.parent?.remove(l); l.element.remove(); }
  world.labels = [];
  if (!state.cut || state.view !== '3d') return;
  const lv = B.LEVELS.find((l) => l.id === state.cut);
  const zs = ZONES.filter((z) => z.level === state.cut && !['void', 'turnstiles', 'photozone', 'corridor'].includes(z.type));
  if (state.cut === 'L1') zs.push(...ZONES.filter((z) => z.level === 'M'));
  for (const z of zs) {
    const [u0, v0, u1, v1] = z.rect;
    const area = (u1 - u0) * (v1 - v0);
    if (area < 12) continue;
    const el = document.createElement('div');
    el.className = 'zlabel' + (z.confidence === 'inferred' ? ' inferred' : '');
    el.textContent = z.name;
    if (z.type === 'cluster') { const s = document.createElement('b'); s.textContent = `${(z.props?.rows ?? 7) * 10} мест`; el.appendChild(s); }
    const o = new CSS2DObject(el);
    const zl = B.LEVELS.find((l) => l.id === z.level).z;
    o.position.copy(P((u0 + u1) / 2, (v0 + v1) / 2, (z.type === 'amphitheater' ? -1 : zl) + 1.2));
    scene.add(o);
    world.labels.push(o);
  }
  void lv;
}

// ── Ракурсы ──────────────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'front', name: 'Вход', pos: [66, -27, 0.6], tgt: [40, 1, 7.2], cut: null },
  { id: 'aerial', name: 'С высоты', pos: [-60, -95, 95], tgt: [27.6, 27.6, 4], cut: null },
  { id: 'atrium', name: 'Атриум', pos: [21.6, 16.3, 6.3], tgt: [21.4, 32, 2.9], cut: null, inside: true },
  { id: 'amph', name: 'Амфитеатр', pos: [27.2, 19.4, 4.3], tgt: [26.4, 9.6, -2.3], cut: null, inside: true },
  { id: 'lounge', name: 'Лаунж под пирамидой', pos: [13.6, 19.8, 11.1], tgt: [25, 32, 12.8], cut: null, inside: true },
  { id: 'tashkent', name: 'Кластер Tashkent', pos: [15.8, 13.2, 6.2], tgt: [33, 3.5, 5.4], cut: null, inside: true },
  { id: 'cut2', name: 'Разрез 2 этажа', pos: [27.6, -38, 58], tgt: [27.6, 27.6, 4.5], cut: 'L2' },
  { id: 'cut1', name: 'Разрез 1 этажа', pos: [70, -36, 46], tgt: [27.6, 24, 0], cut: 'M' },
  { id: 'walk', name: 'Прогулка', walk: true },
];

let tween = null;
function fitCamera(id, instant = false) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  state.preset = id;
  if (p.walk) { startWalk(); return; }
  stopWalk();
  applyCut(p.cut);
  const to = { pos: P(...p.pos), tgt: P(...p.tgt) };
  if (instant) { camera.position.copy(to.pos); controls.target.copy(to.tgt); controls.update(); }
  else tween = { t: 0, from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to };
  controls.minDistance = p.inside ? 0.3 : 1.5;
  renderPresets();
}

// ── Прогулка от первого лица ────────────────────────────────────────────────
const plc = new PointerLockControls(camera, renderer.domElement);
const keys = new Set();
let walkLevel = 'L1';
const eyeZ = () => B.LEVELS.find((l) => l.id === walkLevel).z + (walkLevel === 'L3' ? 0 : 0) + 1.62;
let joy = null;
function startWalk() {
  state.walk = true;
  applyCut(null);
  walkLevel = 'L1';
  camera.position.copy(P(50.5, -3.2, eyeZ()));
  camera.lookAt(P(50.5, 10, eyeZ()));
  controls.enabled = false;
  showHint(isTouch ? 'Левый круг — идти, свайп справа — смотреть. Этаж — в рейке слева.' : 'Кликните по сцене. WASD — идти, мышь — смотреть, Q/E — этаж, Esc — выход.');
  if (isTouch) makeJoystick();
  renderPresets();
  updateDetailVisibility();
}
function stopWalk() {
  if (!state.walk) return;
  state.walk = false;
  plc.unlock();
  controls.enabled = true;
  // точка вращения — перед камерой
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  controls.target.copy(camera.position.clone().add(dir.multiplyScalar(6)));
  hideHint();
  joy?.remove(); joy = null;
}
renderer.domElement.addEventListener('click', () => { if (state.walk && !isTouch && !plc.isLocked) plc.lock(); });
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input,textarea,select')) return;
  keys.add(e.code);
  if (state.walk && (e.code === 'KeyQ' || e.code === 'KeyE')) {
    const order = ['L1', 'M', 'L2', 'L3'];
    const i = order.indexOf(walkLevel);
    walkLevel = order[Math.max(0, Math.min(order.length - 1, i + (e.code === 'KeyE' ? 1 : -1)))];
    renderRail();
  }
  if (e.code === 'Escape' && state.walk && !plc.isLocked) fitCamera('front');
});
addEventListener('keyup', (e) => keys.delete(e.code));
const joyVec = new THREE.Vector2();
let lookDrag = null;
function makeJoystick() {
  joy = document.createElement('div');
  joy.className = 'joy';
  joy.innerHTML = '<i></i>';
  $('app').appendChild(joy);
  const knob = joy.querySelector('i');
  const move = (e) => {
    const r = joy.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    const dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.min(1, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
    joyVec.set(Math.cos(a) * l, Math.sin(a) * l);
    knob.style.transform = `translate(${joyVec.x * 36}px, ${joyVec.y * 36}px)`;
  };
  joy.addEventListener('pointerdown', (e) => { joy.setPointerCapture(e.pointerId); move(e); });
  joy.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') move(e); });
  const end = () => { joyVec.set(0, 0); knob.style.transform = ''; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
}
renderer.domElement.addEventListener('pointerdown', (e) => { if (state.walk && isTouch) lookDrag = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!state.walk || !isTouch || !lookDrag) return;
  const dx = e.clientX - lookDrag.x, dy = e.clientY - lookDrag.y;
  lookDrag = { x: e.clientX, y: e.clientY };
  const eul = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(camera.quaternion);
  eul.y -= dx * 0.005; eul.x = Math.max(-1.4, Math.min(1.4, eul.x - dy * 0.005));
  camera.quaternion.setFromEuler(eul);
});
addEventListener('pointerup', () => { lookDrag = null; });

function walkStep(dt) {
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4.2 : 1.8) * dt;
  const mv = new THREE.Vector3();
  if (keys.has('KeyW') || keys.has('ArrowUp')) mv.add(fwd);
  if (keys.has('KeyS') || keys.has('ArrowDown')) mv.sub(fwd);
  if (keys.has('KeyD') || keys.has('ArrowRight')) mv.add(right);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mv.sub(right);
  if (joyVec.lengthSq() > 0.01) mv.add(fwd.clone().multiplyScalar(-joyVec.y)).add(right.clone().multiplyScalar(joyVec.x));
  if (mv.lengthSq() > 0) camera.position.add(mv.normalize().multiplyScalar(speed));
  const target = sy(eyeZ());
  camera.position.y += (target - camera.position.y) * Math.min(1, dt * 4);
}

// ── Выбор зоны кликом ────────────────────────────────────────────────────────
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || state.walk) return;
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = [];
  const visibleDeep = (o) => { for (let p = o; p; p = p.parent) if (!p.visible && !(p.name || '').startsWith('pick:')) return false; return true; };
  scene.traverse((o) => { if (o.isMesh && o !== sky && o.name !== 'sky' && visibleDeep(o) && !(o.material?.name || '').startsWith('skyGlass')) targets.push(o); });
  const hits = ray.intersectObjects(targets, false);
  const hit = hits.find((h) => !(h.object.material?.transparent && h.object.material.opacity < 0.5 && !h.object.name.startsWith('pick:')));
  if (!hit) { select(null); return; }
  // определяем уровень по предку
  let lvl = null, band = null;
  for (let p = hit.object; p; p = p.parent) { if (p.userData?.level && !lvl) lvl = p.userData.level; if (p.name?.startsWith('shell-')) band = p.name.slice(6); }
  const u = hit.point.x + B.SIZE / 2, v = B.SIZE / 2 - hit.point.z;
  if (lvl) {
    let cand = ZONES.filter((z) => z.level === lvl && u >= z.rect[0] && u <= z.rect[2] && v >= z.rect[1] && v <= z.rect[3]);
    if (!cand.length && lvl === 'L1') cand = ZONES.filter((z) => z.level === 'M' && u >= z.rect[0] && u <= z.rect[2] && v >= z.rect[1] && v <= z.rect[3]);
    const core = B.CORES.find((c) => c.levels.includes(lvl) && u >= c.rect[0] && u <= c.rect[2] && v >= c.rect[1] && v <= c.rect[3]);
    if (core) { select({ kind: 'core', id: core.id, level: lvl }); return; }
    cand.sort((a, b) => area(a) - area(b));
    const pickZone = cand.find((z) => z.type !== 'void') || cand[0];
    select(pickZone ? { kind: 'zone', id: pickZone.id } : null);
  } else if (band) {
    const side = u < 1 ? 'SW' : u > B.SIZE - 1 ? 'NE' : v < 1 ? 'SE' : v > B.SIZE - 1 ? 'NW' : null;
    select(side ? { kind: 'facade', id: side } : null);
  } else select(null);
});
const area = (z) => (z.rect[2] - z.rect[0]) * (z.rect[3] - z.rect[1]);

let selBox = null;
function select(sel) {
  state.selected = sel;
  if (selBox) { scene.remove(selBox); selBox.geometry.dispose(); selBox = null; }
  const box = (u0, v0, z0, u1, v1, z1) => {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(u1 - u0, z1 - z0, v1 - v0));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x19e0bd, depthTest: false, transparent: true }));
    l.position.copy(P((u0 + u1) / 2, (v0 + v1) / 2, (z0 + z1) / 2));
    l.renderOrder = 10;
    scene.add(l);
    selBox = l;
  };
  if (sel?.kind === 'zone') {
    const z = ZONES.find((q) => q.id === sel.id);
    const L = B.LEVELS.find((l) => l.id === z.level);
    const z0 = z.type === 'amphitheater' ? (z.props?.stageZ ?? -2.7) : L.z;
    box(z.rect[0], z.rect[1], z0 + 0.02, z.rect[2], z.rect[3], L.z + (z.level === 'M' ? 6.3 : L.h) - 0.4);
  } else if (sel?.kind === 'core') {
    const c = B.CORES.find((q) => q.id === sel.id);
    const L = B.LEVELS.find((l) => l.id === sel.level);
    box(c.rect[0], c.rect[1], L.z + 0.02, c.rect[2], c.rect[3], L.z + L.h - 0.4);
  } else if (sel?.kind === 'facade') {
    const S = B.SIZE;
    const r = { SE: [0, -1, S, 0], NE: [S, 0, S + 1, S], NW: [0, S, S, S + 1], SW: [-1, 0, 0, S] }[sel.id];
    box(r[0], r[1], B.GRADE, r[2], r[3], B.PARAPET_Z);
  }
  renderInspector();
}

// ── Инспектор и редактор ─────────────────────────────────────────────────────
const CONF = { photo: 'по фото', video: 'по видео', inferred: 'достроено' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
function renderInspector() {
  const el = $('inspector');
  const sel = state.selected;
  if (!sel && !state.edit) { el.hidden = true; return; }
  el.hidden = false;
  if (!sel) {
    el.innerHTML = `<button class="x" aria-label="Закрыть" id="i-x">×</button>
      <h2>Редактор зон</h2>
      <p class="note">Кликните по помещению в 3D или на плане, чтобы поправить его границы, тип и название. Правки сохраняются в этом браузере.</p>
      <div class="edit"><div class="acts">
        <button class="btn primary" id="e-add">Добавить зону на ${esc(levelName(state.cut || 'L1'))}</button>
        <button class="btn" id="e-export">Экспорт JSON</button>
        <button class="btn danger" id="e-reset">Сбросить правки</button>
      </div></div>`;
    wireEditorGlobal();
    $('i-x').onclick = () => { state.edit = false; $('b-edit').setAttribute('aria-pressed', 'false'); renderInspector(); };
    return;
  }
  if (sel.kind === 'facade') {
    const f = B.FACADES[sel.id];
    el.innerHTML = `<button class="x" aria-label="Закрыть" id="i-x">×</button>
      <h2>${esc(f.name)}</h2><span class="pill ${f.confidence}">${CONF[f.confidence]}</span>
      <dl class="kv"><dt>Длина</dt><dd class="mono">${fmt(B.SIZE)} м</dd><dt>Верх карниза</dt><dd class="mono">+${fmt(B.PARAPET_Z)}</dd>
      <dt>Участки</dt><dd>${f.segments.map((s) => s.type).join(' · ')}</dd></dl>
      <p class="note">${f.confidence === 'inferred' ? 'Фотографий этой стороны нет — фасад достроен по аналогии с видимыми (ленточное остекление, белые пояса, карниз).' : 'Геометрия снята по фото и спутнику.'} Правится в <span class="mono">src/data/building.js → FACADES</span>.</p>`;
    $('i-x').onclick = () => select(null);
    return;
  }
  if (sel.kind === 'core') {
    const c = B.CORES.find((q) => q.id === sel.id);
    const [u0, v0, u1, v1] = c.rect;
    el.innerHTML = `<button class="x" aria-label="Закрыть" id="i-x">×</button>
      <h2>${esc(c.name)}</h2><span class="pill ${c.confidence}">${CONF[c.confidence]}</span>
      <dl class="kv"><dt>Тип</dt><dd>${TYPE_NAMES[c.type] || c.type}</dd><dt>Размер</dt><dd class="mono">${fmt(u1 - u0)} × ${fmt(v1 - v0)} м</dd>
      <dt>Этажи</dt><dd>${c.levels.map(levelName).join(', ')}</dd></dl>
      ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      <p class="note">Ядра повторяются на всех этажах. Положение сверено с надстройками на кровле.</p>`;
    $('i-x').onclick = () => select(null);
    return;
  }
  const z = ZONES.find((q) => q.id === sel.id);
  if (!z) { el.hidden = true; return; }
  const [u0, v0, u1, v1] = z.rect;
  const L = B.LEVELS.find((l) => l.id === z.level);
  const axis = (val, arr, lab) => { let best = 0; arr.forEach((a, i) => { if (Math.abs(a - val) < Math.abs(arr[best] - val)) best = i; }); return Math.abs(arr[best] - val) < 0.2 ? lab[best] : '—'; };
  el.innerHTML = `<button class="x" aria-label="Закрыть" id="i-x">×</button>
    <h2>${esc(z.name)}</h2>
    <span class="pill ${z.confidence}">${CONF[z.confidence]}</span>
    <dl class="kv">
      <dt>Тип</dt><dd>${TYPE_NAMES[z.type] || z.type}</dd>
      <dt>Уровень</dt><dd>${esc(L.name)} · <span class="mono">${L.z >= 0 ? '+' : '−'}${fmt(Math.abs(L.z))}</span></dd>
      <dt>Размер</dt><dd class="mono">${fmt(u1 - u0)} × ${fmt(v1 - v0)} м</dd>
      <dt>Площадь</dt><dd class="mono">${fmt((u1 - u0) * (v1 - v0))} м²</dd>
      <dt>Оси</dt><dd class="mono">${axis(u0, B.GRID.u, B.GRID.labelsU)}–${axis(u1, B.GRID.u, B.GRID.labelsU)} / ${axis(v0, B.GRID.v, B.GRID.labelsV)}–${axis(v1, B.GRID.v, B.GRID.labelsV)}</dd>
      ${z.type === 'cluster' ? `<dt>Мест</dt><dd class="mono">${(z.props?.rows ?? 7) * 10}</dd>` : ''}
    </dl>
    ${z.note ? `<p class="note">${esc(z.note)}</p>` : ''}
    ${state.edit ? editForm(z) : `<p class="note">Нашли неточность? Включите «Редактор» и поправьте границы — модель пересоберётся.</p>`}`;
  $('i-x').onclick = () => select(null);
  if (state.edit) wireEditForm(z);
}
const levelName = (id) => B.LEVELS.find((l) => l.id === id)?.name || id;
function editForm(z) {
  const types = Object.keys(TYPE_NAMES).filter((t) => !['stair', 'lift', 'wc'].includes(t));
  const [u0, v0, u1, v1] = z.rect;
  return `<form class="edit" id="e-form">
    <label>Название<input id="e-name" value="${esc(z.name)}"></label>
    <div class="row">
      <label>u₀<input id="e-u0" type="number" step="0.1" value="${u0}"></label>
      <label>v₀<input id="e-v0" type="number" step="0.1" value="${v0}"></label>
      <label>u₁<input id="e-u1" type="number" step="0.1" value="${u1}"></label>
      <label>v₁<input id="e-v1" type="number" step="0.1" value="${v1}"></label>
    </div>
    <div class="row" style="grid-template-columns:1fr 1fr">
      <label>Тип<select id="e-type">${types.map((t) => `<option value="${t}" ${t === z.type ? 'selected' : ''}>${TYPE_NAMES[t]}</option>`).join('')}</select></label>
      <label>Достоверность<select id="e-conf">${Object.entries(CONF).map(([k, v]) => `<option value="${k}" ${k === z.confidence ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    ${z.type === 'cluster' ? `<div class="row" style="grid-template-columns:1fr 1fr"><label>Кластер<select id="e-cl">${Object.keys(B.CLUSTER_COLORS).map((c) => `<option ${c === z.cluster ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>Рядов<input id="e-rows" type="number" min="1" max="12" value="${z.props?.rows ?? 7}"></label></div>` : ''}
    <label>Заметка<textarea id="e-note">${esc(z.note || '')}</textarea></label>
    <div class="acts">
      <button class="btn primary" type="submit">Применить</button>
      <button class="btn danger" type="button" id="e-del">Удалить</button>
      <button class="btn" type="button" id="e-export">Экспорт JSON</button>
    </div>
    <p class="note mono" style="margin:0">u — вдоль главного фасада от южного угла, v — вглубь. Метры.</p>
  </form>`;
}
function wireEditForm(z) {
  $('e-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const num = (id) => parseFloat($(id).value);
    const r = [num('e-u0'), num('e-v0'), num('e-u1'), num('e-v1')];
    if (r.some(Number.isNaN) || r[2] - r[0] < 0.5 || r[3] - r[1] < 0.5) { showHint('Проверьте координаты: u₁ > u₀ и v₁ > v₀, минимум 0,5 м.', 2600); return; }
    z.rect = r.map((x) => Math.round(x * 100) / 100);
    z.name = $('e-name').value.trim() || z.name;
    z.type = $('e-type').value;
    z.confidence = $('e-conf').value;
    z.note = $('e-note').value.trim();
    if ($('e-cl')) { z.cluster = $('e-cl').value; z.props = { ...(z.props || {}), rows: parseInt($('e-rows').value, 10) || 7 }; }
    if (z.type === 'cluster' && !z.cluster) z.cluster = 'kokand';
    commitEdits();
    showHint('Готово — модель пересобрана.', 1600);
  });
  $('e-del').onclick = () => { ZONES = ZONES.filter((q) => q !== z); commitEdits(); select(null); };
  $('e-export').onclick = exportJSON;
}
function wireEditorGlobal() {
  $('e-add').onclick = () => {
    const lv = state.cut && state.cut !== 'B1' && state.cut !== 'B2' ? state.cut : 'L1';
    const id = `new-${Date.now().toString(36)}`;
    ZONES.push({ id, level: lv, type: 'office', name: 'Новая зона', rect: [24.6, 24.6, 30.6, 30.6], confidence: 'inferred', note: '' });
    commitEdits();
    select({ kind: 'zone', id });
  };
  $('e-export').onclick = exportJSON;
  $('e-reset').onclick = () => {
    ZONES = clone(B.ZONES);
    try { localStorage.removeItem(STORE); } catch { /* ignore */ }
    commitEdits(false);
    showHint('Правки сброшены.', 1500);
  };
}
function commitEdits(save = true) {
  if (save) saveZones();
  buildInteriors();
  applyCut(state.cut);
  applyTime(state.time);
  if (state.selected) select(state.selected);
}
function exportJSON() {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="card"><h2>Зоны в JSON</h2>
    <p>Скопируйте и пришлите — перенесу правки в <span class="mono">src/data/building.js</span>.</p>
    <textarea id="x-json" readonly>${esc(JSON.stringify(ZONES, null, 1))}</textarea>
    <div class="edit" style="border:0;padding-top:8px"><div class="acts"><button class="btn primary" id="x-copy">Скопировать</button><button class="btn" id="x-close">Закрыть</button></div></div></div>`;
  $('app').appendChild(m);
  $('x-close').onclick = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  $('x-copy').onclick = async () => {
    const ta = $('x-json');
    try { await navigator.clipboard.writeText(ta.value); $('x-copy').textContent = 'Скопировано'; } catch { ta.focus(); ta.select(); $('x-copy').textContent = 'Выделено — нажмите ⌘C'; }
  };
}

// ── Рейка этажей и ракурсы ──────────────────────────────────────────────────
function renderRail() {
  const rail = $('rail');
  const items = [
    { id: null, name: 'Всё здание', el: `+${fmt(B.PARAPET_Z)}` },
    ...[...B.LEVELS].reverse().map((l) => ({ id: l.id, name: l.name, el: `${l.z > 0 ? '+' : l.z < 0 ? '−' : '±'}${fmt(Math.abs(l.z))}`, half: l.partial })),
  ];
  const active = state.view === 'plan' ? state.planLevel : state.walk ? walkLevel : state.cut;
  rail.innerHTML = `<div class="cap">${state.view === 'plan' ? 'План этажа' : state.walk ? 'Этаж прогулки' : 'Разрез по этажу'}</div>` + items.map((it, i) => {
    if (state.view === 'plan' && it.id === null) return '';
    const isActive = it.id === active || (it.id === null && active == null);
    return `${i === 1 && state.view !== 'plan' ? '<div class="sep"></div>' : ''}<button data-lv="${it.id ?? ''}" class="${it.half ? 'half' : ''}" aria-pressed="${isActive}"><span class="tick"></span><span class="nm">${esc(it.name)}</span><span class="el mono">${it.el}</span></button>`;
  }).join('');
  rail.querySelectorAll('button').forEach((b) => b.onclick = () => {
    const id = b.dataset.lv || null;
    if (state.view === 'plan') { state.planLevel = id; showPlan(); renderRail(); return; }
    if (state.walk) {
      if (!id || id === 'B1' || id === 'B2') return;
      walkLevel = id; renderRail(); return;
    }
    const p = PRESETS.find((x) => x.id === state.preset);
    if (id && (!p || !p.cut) && !p?.inside) {
      // показываем разрез сверху-сбоку
      const L = B.LEVELS.find((l) => l.id === id);
      tween = { t: 0, from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to: { pos: P(27.6, -34, L.z + 52), tgt: P(27.6, 26, L.z) } };
    }
    state.preset = null;
    applyCut(id);
    renderPresets();
  });
}
function renderPresets() {
  const el = $('presets');
  el.innerHTML = '<span class="cap">Ракурсы</span>' + PRESETS.map((p) => `<button data-p="${p.id}" aria-pressed="${state.walk ? p.id === 'walk' : state.preset === p.id}">${esc(p.name)}</button>`).join('');
  el.querySelectorAll('button').forEach((b) => b.onclick = () => { setView('3d'); fitCamera(b.dataset.p); });
}

// ── Виды: 3D / планы / участок ──────────────────────────────────────────────
state.planLevel = 'L2';
function setView(v) {
  state.view = v;
  for (const [id, name] of [['v-3d', '3d'], ['v-plan', 'plan'], ['v-site', 'site']]) $(id).setAttribute('aria-pressed', String(v === name));
  const sheet = $('sheet');
  if (v === '3d') { sheet.hidden = true; $('presets').parentElement.hidden = false; }
  else { stopWalk(); sheet.hidden = false; }
  $('rail').hidden = v === 'site';
  if (v === 'plan') showPlan();
  if (v === 'site') renderSite(sheet, { onPickBuilding: () => { setView('3d'); fitCamera('aerial'); } });
  updateLabels();
  renderRail();
}
function showPlan() {
  renderPlan($('sheet'), {
    level: state.planLevel || 'L2', zones: ZONES, conf: state.conf, selected: state.selected,
    onSelect: (id) => { select(id ? { kind: 'zone', id } : null); showPlan(); },
  });
}
$('v-3d').onclick = () => setView('3d');
$('v-plan').onclick = () => { if (state.cut && !['B1', 'B2'].includes(state.cut)) state.planLevel = state.cut; setView('plan'); };
$('v-site').onclick = () => setView('site');
$('t-day').onclick = () => applyTime('day');
$('t-eve').onclick = () => applyTime('eve');
$('t-night').onclick = () => applyTime('night');
$('b-conf').onclick = () => {
  state.conf = !state.conf;
  $('b-conf').setAttribute('aria-pressed', String(state.conf));
  $('legend').hidden = !state.conf;
  const col = { photo: 0x19c2a6, video: 0x3d7fe0, inferred: 0xf0a030 };
  for (const m of world.pick) { m.material.opacity = state.conf ? 0.5 : 0; m.material.color.set(col[m.userData.confidence] || 0x888888); }
  world.overlay.visible = state.conf;
  if (state.view === 'plan') showPlan();
};
$('b-edit').onclick = () => {
  state.edit = !state.edit;
  $('b-edit').setAttribute('aria-pressed', String(state.edit));
  renderInspector();
};
$('b-about').onclick = () => {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="card">
    <h2>О модели</h2>
    <p>Реконструкция кампуса School 21 в Ташкенте (ул. Зиёлилар, 13). Здание — бывшая Фундаментальная библиотека Академии наук РУз, открытая в сентябре 1982 года; кампус School 21 открылся здесь 2 октября 2024 года: около 8 100 м², 10 кластеров, 700 рабочих мест, работает 24/7.</p>
    <p>Масштаб 1:1, метры. Контур и ориентация — по OpenStreetMap и спутниковому снимку (квадрат ≈55 × 55 м, повёрнут на 39°), высоты — по фото фасада. Три этажа над землёй, «парящая площадка» на +2,25 и два подвальных уровня. Планировки восстановлены по фото и видео-экскурсии; то, чего не видно, достроено по логике здания — это помечено режимом «Достоверность».</p>
    <p>Всё генерируется из одного файла <span class="mono">src/data/building.js</span>: поправьте цифры — и здание пересоберётся.</p>
    <h2 style="font-size:15px;margin-top:14px">Источники</h2>
    <ul>${B.SOURCES.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('')}</ul>
    <div class="edit" style="border:0;padding-top:8px"><div class="acts"><button class="btn primary" id="a-close">Закрыть</button></div></div></div>`;
  $('app').appendChild(m);
  $('a-close').onclick = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
};

let hintT = null;
function showHint(t, ms) { const h = $('hint'); h.textContent = t; h.hidden = false; clearTimeout(hintT); if (ms) hintT = setTimeout(hideHint, ms); }
function hideHint() { $('hint').hidden = true; }

// ── Цикл ─────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let lastDetailCheck = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.3);
    const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.from.pos, tween.to.pos, k);
    controls.target.lerpVectors(tween.from.tgt, tween.to.tgt, k);
    if (tween.t >= 1) tween = null;
  }
  if (state.walk) walkStep(dt); else controls.update();
  sky.position.copy(camera.position);
  if (performance.now() - lastDetailCheck > 300) { lastDetailCheck = performance.now(); updateDetailVisibility(); }
  // тень следует за камерой, когда она внутри/рядом
  if (state.view === '3d') {
    composer.render();
    labelRenderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// На портретном экране расширяем угол обзора, чтобы по ширине влезало то же, что на десктопе
function fitFov() {
  const a = camera.aspect;
  const base = 42;
  if (a >= 1.3) { camera.fov = base; return; }
  const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * 1.3);  // горизонталь при a = 1.3
  camera.fov = Math.min(80, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / a)) * 0.82);
}
function onResize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w / h; fitFov(); camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h); labelRenderer.setSize(w, h);
  gtao?.setSize(w, h);
}
addEventListener('resize', onResize);

renderRail();
renderPresets();
build().then(() => requestAnimationFrame(frame)).catch((e) => {
  console.error(e);
  loadmsg('Не удалось собрать модель: ' + e.message);
});

// для отладки из консоли
window.__s21 = { scene, camera, controls, state, world, applyCut, applyTime, fitCamera, renderer, mats };
