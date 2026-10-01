// School 21 · Ташкент — 3D-модель кампуса.
// Сцена, свет, камеры, разрезы по этажам, прогулка, выбор и редактирование зон.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as B from './data/building.js';
import { Materials } from './lib/materials.js';
import { setMaxAniso, setTextureDetail } from './lib/textures.js';
import { setFurnitureDetail } from './build/furniture.js';
import { buildShell, BANDS } from './build/shell.js';
import { buildInterior } from './build/interior.js';
import { buildSite } from './build/site.js';
import { P, sx, sy, sz } from './lib/geom.js';
import { renderPlan } from './ui/plan.js';
import { renderSite } from './ui/sitemap.js';
import { buildParty } from './build/party.js';
import { createPeople } from './build/people.js';
import { createWalk } from './lib/walk.js';

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

const state = { view: '3d', cut: null, time: 'day', conf: false, edit: false, walk: false, selected: null, preset: 'front', party: false };
let party = null;             // праздничное убранство (строится при первом включении режима)
let people = null;            // люди кампуса (модели грузятся в фоне после старта; ?people=0 — без людей)

// ── Рендерер и сцена ────────────────────────────────────────────────────────
// Уровень качества: high — десктоп (MSAA ×4, GTAO, тени 4096 мягкие, полная детализация),
// low — телефоны/планшеты (FXAA, тени 2048, упрощённая мебель, текстуры вдвое меньше).
// Принудительно: ?q=low | ?q=high
const qParam = new URLSearchParams(location.search).get('q');
const QUALITY = qParam === 'low' || qParam === 'high' ? qParam : (isTouch || small ? 'low' : 'high');
const HQ = QUALITY === 'high';
setFurnitureDetail(HQ ? 'high' : 'low');
setTextureDetail(HQ ? 1 : 0.5);
const stage = $('stage');
// сглаживание делает постобработка (MSAA в буфере композитора или FXAA), холсту оно не нужно
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, HQ ? 2 : 1.5));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = HQ ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
stage.appendChild(renderer.domElement);
setMaxAniso(Math.min(HQ ? 8 : 4, renderer.capabilities.getMaxAnisotropy()));

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
// Градиентное небо: синий зенит → светлый горизонт + ореол солнца + процедурные облака
// (ночью — звёзды). Им же через PMREM освещается экстерьер: стекло отражает это небо
// с облаками и тёмную полосу деревьев/застройки у горизонта (как на фото).
// Интерьер освещается отдельной картой окружения — «комнатой» с белыми стенами и линейными
// светильниками на чёрном потолке: внутри светло и ровно днём и ночью (кампус работает 24/7).
function makeSkyMaterial(shared = null) {
  const uniforms = shared ? { ...shared, treeBand: { value: 1 } } : {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, sunGlow: { value: 1 },
    cloudCover: { value: 0.3 }, cloudLit: { value: new THREE.Color(1, 1, 1) }, cloudShade: { value: new THREE.Color(0.7, 0.74, 0.8) },
    stars: { value: 0 }, treeBand: { value: 0 }, treeColor: { value: new THREE.Color(0.08, 0.1, 0.07) },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow;
      uniform float cloudCover; uniform vec3 cloudLit; uniform vec3 cloudShade; uniform float stars; uniform float treeBand; uniform vec3 treeColor;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, bottom, pow(min(1.0, -h * 3.0), 0.6));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        if (h > 0.0 && cloudCover > 0.0) {
          vec2 uv = d.xz / (h + 0.1) * 1.4;
          float n = fbm(uv + vec2(3.1, 7.7));
          float lo = 0.7 - cloudCover * 0.4;
          float c = smoothstep(lo, lo + 0.2, n) * smoothstep(0.0, 0.14, h);
          float edge = 1.0 - smoothstep(lo + 0.05, lo + 0.3, n);
          vec3 cc = mix(cloudLit, cloudShade, edge * 0.7) * (0.85 + 0.35 * pow(s, 6.0));
          col = mix(col, cc, c * 0.9);
        }
        col += sunColor * (pow(s, 1400.0) * 30.0 + pow(s, 14.0) * 0.45 * sunGlow + pow(s, 3.0) * 0.12 * sunGlow);
        if (stars > 0.0 && h > 0.05) {
          vec2 g = floor(d.xz / (h + 0.3) * 260.0);
          float st = step(0.9975, hash(g)) * (0.4 + 0.6 * hash(g + 3.7));
          col += vec3(st) * stars * smoothstep(0.05, 0.35, h);
        }
        if (treeBand > 0.0) {
          float az = atan(d.z, d.x);
          float lim = 0.02 + 0.06 * fbm(vec2(az * 5.0, 0.5)) + 0.025 * vnoise(vec2(az * 60.0, 1.5));
          if (h > -0.05 && h < lim) col = mix(col, treeColor, treeBand);
        }
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
const sm = HQ ? 4096 : 2048;
sun.shadow.mapSize.set(sm, sm);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 5, far: 500 });
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.022;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdfeeff, 0x8a7d63, 0.4);
scene.add(hemi);

// Тень: ортокамера солнца плотно охватывает здание, площадь и ближние деревья
function fitShadow() {
  const cam = sun.shadow.camera;
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  cam.position.setFromMatrixPosition(sun.matrixWorld);
  cam.lookAt(new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld));
  cam.updateMatrixWorld();
  const box = new THREE.Box3();
  for (const u of [-12, 76]) for (const v of [-24, 64]) for (const z of [B.GRADE - 3, 22]) box.expandByPoint(P(u, v, z).applyMatrix4(cam.matrixWorldInverse));
  Object.assign(cam, { left: box.min.x, right: box.max.x, bottom: box.min.y, top: box.max.y, near: Math.max(1, -box.max.z - 40), far: -box.min.z + 10 });
  cam.updateProjectionMatrix();
}

const pmrem = new THREE.PMREMGenerator(renderer);
// окружение экстерьера: небо с облаками + полоса деревьев у горизонта + земля
const envScene = new THREE.Scene();
const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), makeSkyMaterial(skyU));
envScene.add(envSky);
const envGround = new THREE.Mesh(new THREE.CircleGeometry(49, 32).rotateX(-Math.PI / 2).translate(0, -2.5, 0), new THREE.MeshBasicMaterial({ color: 0x5f5c55 }));
envScene.add(envGround);
let envRT = null;
// окружение интерьера: комната 36×36×7 — чёрный потолок с рядами линейных светильников,
// белые стены, светлый пол, по двум сторонам — окна (днём светлые, ночью тёмные)
const intScene = new THREE.Scene();
const intMats = {
  wall: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.9, 0.88), side: THREE.BackSide }),
  floor: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.42, 0.4, 0.37) }),
  ceil: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.02, 0.022) }),
  led: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(14) }),
  win: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.0) }),
};
{
  const room = new THREE.Mesh(new THREE.BoxGeometry(36, 7, 36), intMats.wall);
  intScene.add(room);
  intScene.add(new THREE.Mesh(new THREE.PlaneGeometry(35.9, 35.9).rotateX(-Math.PI / 2).translate(0, -3.45, 0), intMats.floor));
  intScene.add(new THREE.Mesh(new THREE.PlaneGeometry(35.9, 35.9).rotateX(Math.PI / 2).translate(0, 3.45, 0), intMats.ceil));
  for (let x = -15; x <= 15; x += 3.2) for (let z = -15; z <= 15; z += 4.6) intScene.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 3.0).translate(x, 3.1, z), intMats.led));
  for (const [x, z, ry] of [[0, -17.95, 0], [17.95, 0, -Math.PI / 2]]) intScene.add(new THREE.Mesh(new THREE.PlaneGeometry(30, 3.2).translate(0, 0.2, 0).rotateY(ry).translate(x, 0, z), intMats.win));
}
let intRT = null;

// Направления в сцене: север и восток (здание повёрнуто на 39.1°)
const bu = THREE.MathUtils.degToRad(B.BEARING_U);
const NORTH = new THREE.Vector3(Math.cos(bu), 0, -Math.sin(bu));
const EAST = new THREE.Vector3(Math.sin(bu), 0, Math.cos(bu));
function sunDir(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return NORTH.clone().multiplyScalar(Math.cos(a)).add(EAST.clone().multiplyScalar(Math.sin(a))).multiplyScalar(Math.cos(e)).add(new THREE.Vector3(0, Math.sin(e), 0)).normalize();
}

// Время суток. env / envInt — сила отражений неба (экстерьер) и «комнаты» (интерьер),
// glass — непрозрачность фасадного стекла (ночью ниже: видно освещённые этажи, как на фото).
const TIMES = {
  // конец сентября, Ташкент: полдень ~47° над горизонтом
  day: { az: 178, el: 47, sun: 3.3, sunColor: 0xfff1dc, hemi: 0.42, exp: 1.0, emissive: 0.55, bloom: 0, glass: 0.9, env: 1.0, envInt: 0.85, win: 1,
    sky: { top: 0x2d6cc0, horizon: 0xcfe1f1, bottom: 0x8d8a80, sun: 0xfff2d6, glow: 1.0, clouds: 0.34, lit: 0xffffff, shade: 0xb4bfcc, stars: 0 },
    tree: 0x1d2a1c, ground: 0x5f5c55, fog: 0xcfdeec },
  eve: { az: 262, el: 6, sun: 2.5, sunColor: 0xffae6a, hemi: 0.3, exp: 1.0, emissive: 1.0, bloom: 0.32, glass: 0.8, env: 0.8, envInt: 0.85, win: 0.45,
    sky: { top: 0x33497f, horizon: 0xf2b387, bottom: 0x5a4b45, sun: 0xffc07a, glow: 2.2, clouds: 0.3, lit: 0xffc49a, shade: 0x7a6b86, stars: 0 },
    tree: 0x241e1c, ground: 0x4a3f3a, fog: 0xd9a47e },
  // «синий час» для видео: солнце только что село, небо тёмно-синее с тёплой полосой у горизонта, окна горят
  dusk: { az: 258, el: -4, sun: 0.0, sunColor: 0xff9a60, hemi: 0.26, exp: 1.12, emissive: 1.35, bloom: 0.55, glass: 0.58, env: 0.55, envInt: 0.85, win: 0.08,
    sky: { top: 0x0a1535, horizon: 0x57609c, bottom: 0x1a1826, sun: 0xff7a45, glow: 0.6, clouds: 0.22, lit: 0x8a6a8e, shade: 0x1f2340, stars: 0.4 },
    tree: 0x0a0c11, ground: 0x24222c, fog: 0x3a3a5a },
  night: { az: 210, el: -12, sun: 0.0, sunColor: 0x8fa8ff, hemi: 0.1, exp: 1.05, emissive: 1.6, bloom: 0.75, glass: 0.5, env: 0.35, envInt: 0.8, win: 0.02,
    sky: { top: 0x040811, horizon: 0x16223a, bottom: 0x0a0c12, sun: 0x000000, glow: 0, clouds: 0.18, lit: 0x1c2436, shade: 0x0e1320, stars: 0.9 },
    tree: 0x05070a, ground: 0x0c0d10, fog: 0x0b1222 },
};

const mats = new Materials();

// ── Постобработка ────────────────────────────────────────────────────────────
// high: MSAA ×4 в буфере + GTAO; low: без MSAA, но с FXAA в конце. Bloom — вечером и ночью.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(stage.clientWidth, stage.clientHeight, { samples: HQ ? 4 : 0, type: THREE.HalfFloatType }));
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(stage.clientWidth, stage.clientHeight);
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (HQ) {
  gtao = new GTAOPass(scene, camera, stage.clientWidth, stage.clientHeight);
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 12 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.8;
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(stage.clientWidth, stage.clientHeight), 0.6, 0.45, 0.86);
bloom.enabled = false;
composer.addPass(bloom);
composer.addPass(new OutputPass());
let fxaa = null;
if (!HQ) {
  fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
}
function updateFxaa() {
  if (!fxaa) return;
  const pr = renderer.getPixelRatio();
  fxaa.material.uniforms.resolution.value.set(1 / (stage.clientWidth * pr), 1 / (stage.clientHeight * pr));
}
updateFxaa();

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
  loadPeople();
}
async function loadPeople() {
  if (new URLSearchParams(location.search).get('people') === '0') return;
  // ?crowd=2 — вдвое больше людей (для съёмки видео; на обычном просмотре дорого)
  const crowd = Math.min(4, Math.max(0.2, +(new URLSearchParams(location.search).get('crowd') || 1)));
  people = createPeople({ hq: HQ, levels: world.interior.levels, crowd });
  people.setCamera(camera);
  people.setSeats(world.interior.seats);
  try { await people.load(); } catch (e) { console.warn('Люди не загрузились:', e); people = null; return; }
  people.setMode(state.party ? 'party' : 'normal');
  syncPeopleDetail();
}
// люди на этажах подчиняются той же «детализации», что и мебель (издалека снаружи не видны)
function syncPeopleDetail() { people?.setDetail(detailOn); }
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
  if (people) { people.setSeats(world.interior.seats); people.attach(world.interior.levels); people.setMode(people.mode); syncPeopleDetail(); }
  walk?.invalidate();   // коллизии прогулки пересоберутся (сразу, если она идёт, иначе при старте)
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
  fitShadow();
  hemi.intensity = T.hemi;
  const S = T.sky;
  skyU.top.value.set(S.top); skyU.horizon.value.set(S.horizon); skyU.bottom.value.set(S.bottom);
  skyU.sunColor.value.set(S.sun); skyU.sunGlow.value = S.glow; skyU.sunDir.value.copy(d);
  skyU.cloudCover.value = HQ ? S.clouds : S.clouds * 0.9; skyU.cloudLit.value.set(S.lit); skyU.cloudShade.value.set(S.shade);
  skyU.stars.value = S.stars; skyU.treeColor.value.set(T.tree);
  envGround.material.color.set(T.ground);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.012);
  // интерьер: окна «комнаты» днём светлые, ночью тёмные; светильники всегда горят
  intMats.win.color.setRGB(1.6, 1.8, 2.0).multiplyScalar(T.win);
  if (intRT) intRT.dispose();
  intRT = pmrem.fromScene(intScene, 0.03);
  scene.environment = envRT.texture;
  scene.environmentIntensity = T.env;
  tuneEnv();
  renderer.toneMappingExposure = T.exp;
  scene.background = null;
  scene.fog = new THREE.Fog(T.fog, 280, 1400);
  // светильники, логотипы, экраны, окна подвала, фонари; прозрачность фасадного стекла
  for (const m of mats.cache.values()) {
    if (m.userData.e0 === undefined) m.userData.e0 = m.emissiveIntensity ?? 0;
    const base = m.userData.e0;
    const nm = m.name;
    if (/^lightPool/.test(nm)) { m.opacity = t === 'day' ? 0 : t === 'eve' ? 0.45 : 0.85; m.visible = t !== 'day'; continue; }
    if (/^glass(Blue|Green|Olive|Dark)/.test(nm) && m.transparent) {
      const op = /^glassDark/.test(nm) ? Math.min(0.85, T.glass) : T.glass;
      const cutTop = state.cut && m.userData.level && Math.abs(m.opacity - 0.3) < 1e-3;
      m.userData.baseOpacity = op;
      if (!cutTop) m.opacity = op;
      if (m.emissive) m.emissiveIntensity = 0;
      continue;
    }
    if (!('emissiveIntensity' in m)) continue;
    if (/^led/.test(nm)) m.emissiveIntensity = base * (t === 'day' ? 0.55 : T.emissive);
    else if (/^teal21/.test(nm)) m.emissiveIntensity = t === 'day' ? base : t === 'eve' ? 0.9 : 1.7;
    else if (/^screen/.test(nm)) m.emissiveIntensity = t === 'day' ? 0.85 : t === 'eve' ? 1.0 : 1.15;
    else if (/^glassB1Lit/.test(nm)) m.emissiveIntensity = t === 'day' ? 0 : t === 'eve' ? 0.8 : 1.5;
    else if (/^poleLed/.test(nm)) m.emissiveIntensity = t === 'day' ? 0.3 : t === 'eve' ? 2.5 : 4.0;
  }
  bloom.enabled = T.bloom > 0;
  bloom.strength = T.bloom;
  party?.setGlow?.(t);
  renderer.shadowMap.needsUpdate = true;
  document.querySelectorAll('#timeSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.id === { day: 't-day', eve: 't-eve', night: 't-night' }[t])));
}

// Отражения и рассеянный свет окружения: наружным материалам — небо, интерьерным — «комната».
// (В three r170 materials.envMapIntensity работает только при явно заданном material.envMap.)
const partyMats = new Set();
function tuneEnv() {
  const T = TIMES[state.time];
  for (const m of [...mats.cache.values(), ...partyMats]) {
    if (!m.isMeshStandardMaterial) continue;
    if (m.userData.env0 === undefined) m.userData.env0 = m.envMapIntensity ?? 1;
    const intr = m.userData.env === 'int';
    const tex = intr ? intRT?.texture : envRT?.texture;
    if (!tex) continue;
    if (!m.envMap) m.needsUpdate = true;
    m.envMap = tex;
    m.envMapIntensity = m.userData.env0 * (intr ? T.envInt : T.env);
  }
}

// ── Разрез по этажам ─────────────────────────────────────────────────────────
const ORDER = ['B1', 'L1', 'M', 'L2', 'L3'];
// потолок уровня виден, когда виден уровень-«хозяин» (плита над ним):
// лекторий −1 накрыт площадкой, атриум — плитой лаунжа 3 этажа
const CEIL_OWNER = { B1: 'M', L1: 'L2', M: 'L3', L2: 'L3', L3: 'ROOF' };
function applyCut(cut) {
  state.cut = cut;
  const ci = cut ? ORDER.indexOf(cut) : ORDER.length;
  const visible = {};
  for (const id of ORDER) visible[id] = cut ? ORDER.indexOf(id) <= ci : true;
  visible.ROOF = !cut;
  for (const id of ORDER) {
    const g = world.interior.levels[id];
    g.visible = visible[id];
    g.userData.ceiling.visible = !!visible[CEIL_OWNER[id]];
  }
  // пояса фасада
  const bandVisible = { L1: !cut || ci >= ORDER.indexOf('L1'), L2: !cut || ci >= ORDER.indexOf('L2'), L3: !cut || ci >= ORDER.indexOf('L3'), ROOF: !cut };
  if (cut === 'B1') { bandVisible.L1 = false; bandVisible.L2 = false; bandVisible.L3 = false; }
  for (const b of BANDS) world.shell[b.id].visible = bandVisible[b.id];
  // земля мешает смотреть в подвал
  world.site.children.forEach((c) => { if (c.name === 'site-ground') c.visible = cut !== 'B1'; });
  // стекло верхнего видимого пояса — прозрачнее, чтобы видеть интерьер сбоку
  const topBand = cut ? (ci >= ORDER.indexOf('L3') ? 'L3' : ci >= ORDER.indexOf('L2') ? 'L2' : 'L1') : null;
  for (const m of mats.cache.values()) {
    if (!m.userData.level || !/^glass/.test(m.name)) continue;
    m.opacity = topBand && m.userData.level === topBand ? 0.3 : m.userData.baseOpacity;
  }
  party?.setCut(cut);
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
  syncPeopleDetail();
  renderer.shadowMap.needsUpdate = true;
}

// ── Подписи зон в разрезе ────────────────────────────────────────────────────
const TYPE_NAMES = {
  cluster: 'Кластер', lobby: 'Лобби', hall: 'Холл', foyer: 'Фойе', corridor: 'Проход', lounge: 'Лаунж', lounge3: 'Лаунж под пирамидой',
  amphitheater: 'Лекторий', atrium: 'Атриум −1', platform: 'Парящая площадка', porch: 'Портик', kitchen: 'Кухня', meeting: 'Переговорная',
  conference: 'Конференц-зал', game: 'Игровая', pingpong: 'Пинг-понг', server: 'Серверная', library: 'Библиотека (закрыто)',
  stair: 'Лестница', lift: 'Лифты', wc: 'Санузлы', office: 'Офис', cowork: 'Коворкинг', booths: 'Кабинки', stairhall: 'Лестница',
  wardrobe: 'Гардероб', gallery: 'Галерея', turnstiles: 'Турникеты', photozone: 'Фотозона',
};
// мест в кластере — по рядам столов из DESKS
const seatsOf = (cluster, level) => B.DESKS.filter((d) => d.cluster === cluster && d.level === level)
  .reduce((n, d) => n + 2 * Math.max(1, Math.round((Math.abs(d.to - d.from) - 0.6) / 1.2)), 0);
function updateLabels() {
  for (const l of world.labels) { l.parent?.remove(l); l.element.remove(); }
  world.labels = [];
  if (!state.cut || state.view !== '3d') return;
  const lv = B.LEVELS.find((l) => l.id === state.cut);
  const zs = ZONES.filter((z) => z.level === state.cut && !['turnstiles', 'photozone', 'corridor', 'stairhall', 'porch'].includes(z.type));
  if (state.cut === 'L1' || state.cut === 'M') zs.push(...ZONES.filter((z) => z.level === 'B1' || (state.cut === 'L1' && z.level === 'M')));
  for (const z of zs) {
    const [u0, v0, u1, v1] = z.rect;
    const area = (u1 - u0) * (v1 - v0);
    if (area < 12) continue;
    const el = document.createElement('div');
    el.className = 'zlabel' + (z.confidence === 'inferred' ? ' inferred' : '');
    el.textContent = z.name;
    if (z.type === 'cluster') { const s = document.createElement('b'); s.textContent = `${seatsOf(z.cluster, z.level)} мест`; el.appendChild(s); }
    const o = new CSS2DObject(el);
    const zl = B.LEVELS.find((l) => l.id === z.level).z;
    const lz = z.type === 'amphitheater' ? B.AMPHI.walkZ : z.type === 'lounge3' ? zl + B.LOUNGE3.podium : zl;
    const [lu, lv] = z.type === 'atrium' ? [28.2, 33.2] : z.type === 'amphitheater' ? [20.4, 27.2] : z.type === 'gallery' ? [u0 + 4.5, v0 + 3.0] : [(u0 + u1) / 2, (v0 + v1) / 2];
    o.position.copy(P(lu, lv, lz + 1.2));
    scene.add(o);
    world.labels.push(o);
  }
  void lv;
}

// ── Ракурсы ──────────────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'front', name: 'Вход', pos: [66, -27, 0.6], tgt: [40, 1, 7.2], cut: null },
  { id: 'aerial', name: 'С высоты', pos: [-60, -95, 95], tgt: [27.6, 27.6, 4], cut: null },
  { id: 'hall', name: 'Холл и турникеты', pos: [53.6, 8.2, 1.7], tgt: [44.5, 22, 1.2], cut: null, inside: true },
  { id: 'atrium', name: 'Площадка со статуей', pos: [33.2, 30.4, 6.5], tgt: [16.0, 25.0, 2.4], cut: null, inside: true },
  { id: 'amph', name: 'Лекторий и атриум −1', pos: [25.4, 31.6, 0.6], tgt: [16.2, 22.6, -3.6], cut: null, inside: true },
  { id: 'lounge', name: 'Лаунж под пирамидой', pos: [29.4, 25.9, 11.1], tgt: [15.0, 29.5, 10.4], cut: null, inside: true },
  { id: 'tashkent', name: 'Кластер Tashkent', pos: [23.2, 43.4, 6.2], tgt: [4, 53, 5.0], cut: null, inside: true },
  { id: 'cut2', name: 'Разрез 2 этажа', pos: [27.6, -38, 58], tgt: [27.6, 27.6, 4.5], cut: 'L2' },
  { id: 'cut1', name: 'Разрез 1 этажа', pos: [70, -36, 46], tgt: [27.6, 24, 0], cut: 'M' },
  { id: 'walk', name: 'Прогулка', walk: true },
  { id: 'party', name: 'Праздник', pos: [80, -44, 27], tgt: [25, 24, 11], cut: null, hidden: true },
];

let tween = null;
let walkBack = 'front';        // ракурс, к которому вернёмся после прогулки
function fitCamera(id, instant = false) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  if (p.walk) {
    if (!state.walk && state.preset && state.preset !== 'walk') walkBack = state.preset;
    state.preset = id;
    tween = null;
    walk.start();
    return;
  }
  state.preset = id;
  stopWalk();
  applyCut(p.cut);
  const to = { pos: P(...p.pos), tgt: P(...p.tgt) };
  if (instant) { tween = null; camera.position.copy(to.pos); controls.target.copy(to.tgt); controls.update(); }
  else tween = { t: 0, from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to };
  controls.minDistance = p.inside ? 0.3 : 1.5;
  renderPresets();
}

// ── Прогулка от первого лица (физика, управление и HUD — src/lib/walk.js) ────
const walk = createWalk({
  scene, camera, renderer, world, isTouch,
  getZones: () => ZONES,
  hooks: {
    onStart() {
      state.walk = true;
      tween = null;
      controls.enabled = false;
      select(null);
      applyCut(null);                       // всё здание, потолки на месте
      renderPresets();
      updateDetailVisibility();
    },
    onStop() {
      state.walk = false;
      controls.enabled = true;
      // точка вращения — перед камерой
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      controls.target.copy(camera.position).add(dir.multiplyScalar(6));
      fitFov(); camera.updateProjectionMatrix();
      applyCut(state.cut);                  // вернуть видимость этажей
      renderPresets();
    },
    exit: () => fitCamera(walkBack || 'front'),
    setPixelRatio(pr) { renderer.setPixelRatio(pr); composer.setPixelRatio(pr); onResize(); },
  },
});
function stopWalk() { walk.stop(); }
$('b-walk')?.addEventListener('click', () => { setView('3d'); fitCamera('walk'); });

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
    const z0 = z.type === 'amphitheater' ? B.AMPHI.stageZ : L.z;
    const z1 = z.type === 'amphitheater' ? B.PLATFORM.z - 0.4 : (L.top ?? L.z + 4.5) - 0.4;
    box(z.rect[0], z.rect[1], z0 + 0.02, z.rect[2], z.rect[3], z1);
  } else if (sel?.kind === 'core') {
    const c = B.CORES.find((q) => q.id === sel.id);
    const L = B.LEVELS.find((l) => l.id === sel.level);
    box(c.rect[0], c.rect[1], L.z + 0.02, c.rect[2], c.rect[3], (L.top ?? L.z + 4.5) - 0.4);
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
      ${z.type === 'cluster' ? `<dt>Мест</dt><dd class="mono">${seatsOf(z.cluster, z.level)}</dd>` : ''}
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
    const lv = state.cut || 'L1';
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
  const active = state.view === 'plan' ? state.planLevel : state.walk ? walk.level() : state.cut;
  rail.innerHTML = `<div class="cap">${state.view === 'plan' ? 'План этажа' : state.walk ? 'Этаж прогулки' : 'Разрез по этажу'}</div>` + items.map((it, i) => {
    if (state.view === 'plan' && it.id === null) return '';
    const isActive = it.id === active || (it.id === null && active == null);
    return `${i === 1 && state.view !== 'plan' ? '<div class="sep"></div>' : ''}<button data-lv="${it.id ?? ''}" class="${it.half ? 'half' : ''}" aria-pressed="${isActive}"><span class="tick"></span><span class="nm">${esc(it.name)}</span><span class="el mono">${it.el}</span></button>`;
  }).join('');
  rail.querySelectorAll('button').forEach((b) => b.onclick = () => {
    const id = b.dataset.lv || null;
    if (state.view === 'plan') { state.planLevel = id; showPlan(); renderRail(); return; }
    if (state.walk) { if (id) walk.gotoLevel(id); return; }
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
  el.innerHTML = '<span class="cap">Ракурсы</span>' + PRESETS.filter((p) => !p.hidden).map((p) => `<button data-p="${p.id}" aria-pressed="${state.walk ? p.id === 'walk' : state.preset === p.id}">${esc(p.name)}</button>`).join('');
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
$('v-plan').onclick = () => { if (state.cut) state.planLevel = state.cut; setView('plan'); };
$('v-site').onclick = () => setView('site');
$('t-day').onclick = () => applyTime('day');
$('t-eve').onclick = () => applyTime('eve');
$('t-night').onclick = () => applyTime('night');
// ── Праздник: «С днём рождения, School 21!» ─────────────────────────────────
function setParty(on) {
  state.party = on;
  $('b-party').setAttribute('aria-pressed', String(on));
  if (on && !party) {
    party = buildParty({ hq: HQ });
    scene.add(party.group);
    party.group.traverse((o) => { if (o.material?.isMeshStandardMaterial) partyMats.add(o.material); });
    tuneEnv();
    party.setGlow(state.time);
  }
  if (party) { party.group.visible = on; party.setCut(state.cut); }
  if (people?.loaded && people.mode !== (on ? 'party' : 'normal')) { people.setMode(on ? 'party' : 'normal'); syncPeopleDetail(); }
  if (on) {
    if (state.view !== '3d') setView('3d');
    if (state.time === 'day') applyTime('eve');
    if (!state.walk) fitCamera('party');
  }
  renderer.shadowMap.needsUpdate = true;
}
$('b-party').onclick = () => setParty(!state.party);
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
    <p>Масштаб 1:1, метры. Контур и ориентация — по OpenStreetMap и спутниковому снимку (квадрат ≈55 × 55 м, повёрнут на 39°), высоты — по фото фасада. Четыре уровня School 21: атриум −1 (лекторий и лаунж на дне атриума), 1, 2 и 3 этажи, плюс «парящая площадка» +2,25 над лекторием. Планировки сняты с поэтажных планов 360°-тура uzbekistan360 и сверены с 70 панорамами, видео-экскурсией и фото; то, чего не видно, достроено по логике здания — это помечено режимом «Достоверность».</p>
    <p>Всё генерируется из одного файла <span class="mono">src/data/building.js</span>: поправьте цифры — и здание пересоберётся.</p>
    <h2 style="font-size:15px;margin-top:14px">Источники</h2>
    <ul>${B.SOURCES.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('')}</ul>
    <p class="note">Люди — модели <a href="https://quaternius.com" target="_blank" rel="noopener">Quaternius</a> с <a href="https://poly.pizza" target="_blank" rel="noopener">Poly Pizza</a> (CC0, модель «Suit» — CC-BY 3.0). Код открыт под MIT: <a href="https://github.com/ASPanferov/school21-tashkent-3d" target="_blank" rel="noopener">исходники на GitHub</a>.</p>
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
// Один кадр. auto — обычный режим (твин камеры, прогулка, орбита); без него камерой
// управляет внешний сценарий (съёмка видео: __s21.capture(dt))
function renderFrame(dt, auto = true, fwRate = 1) {
  if (auto) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.3);
      const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.from.pos, tween.to.pos, k);
      controls.target.lerpVectors(tween.from.tgt, tween.to.tgt, k);
      if (tween.t >= 1) tween = null;
    }
    if (state.walk) walk.update(dt); else controls.update();
  }
  if (state.party && party) party.update(dt, fwRate);
  people?.update(dt);
  sky.position.copy(camera.position);
  if (!auto || performance.now() - lastDetailCheck > 300) { lastDetailCheck = performance.now(); updateDetailVisibility(); }
  if (state.view === '3d') {
    composer.render();
    if (auto) labelRenderer.render(scene, camera);
  }
}
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (!state.capture) renderFrame(dt);
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
  updateFxaa();
  walk.onResize();
}
addEventListener('resize', onResize);

renderRail();
renderPresets();
build().then(() => {
  // праздничная версия по ссылке: ?party или #party
  if (/[?&]party\b/.test(location.search) || location.hash === '#party') setParty(true);
  requestAnimationFrame(frame);
}).catch((e) => {
  console.error(e);
  loadmsg('Не удалось собрать модель: ' + e.message);
});

// для отладки из консоли
window.__s21 = { scene, camera, controls, state, world, applyCut, applyTime, fitCamera, renderer, mats, walk: walk.api, quality: QUALITY, composer,
  setParty, partyApi: () => party, peopleApi: () => people, capture: (dt, fwRate) => renderFrame(dt, false, fwRate), labelRenderer };
