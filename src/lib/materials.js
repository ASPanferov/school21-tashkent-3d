// Библиотека материалов. Материалы создаются лениво по ключу и переиспользуются.
// Ключ вида 'glassBlue@L2' даёт отдельную копию материала для уровня —
// так в режиме «разреза» можно сделать прозрачнее стекло только нужного этажа.
//
// Окружение (отражения/рассеянный свет от неба) у материалов двух видов:
//   userData.env = 'ext' — наружные (фасад, участок): отражают небо;
//   userData.env = 'int' — интерьерные: отражают «комнату» с белыми стенами и линейными
//   светильниками (main.js → tuneEnv) — поэтому внутри светло и ровно, как на фото, и ночью тоже.
import * as THREE from 'three';
import * as T from './textures.js';
import { CLUSTER_COLORS } from '../data/building.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
// Поверхность с картами из textures.js (цвет + нормали + шероховатость)
function surf(t, o = {}) {
  const { ns = 1, roughMul = 1, ...rest } = o;
  const m = std({ map: t, ...rest });
  if (t.userData.normalMap) { m.normalMap = t.userData.normalMap; m.normalScale = new THREE.Vector2(ns, ns); }
  if (t.userData.roughnessMap) { m.roughnessMap = t.userData.roughnessMap; m.roughness = roughMul; }
  return m;
}
// Материал с вершинными цветами (многокомпонентная мебель в одном инстансе).
// Если у геометрии нет атрибута color, берётся белый — ничего не ломается.
function vc(m) { m.vertexColors = true; m.defaultAttributeValues = { color: [1, 1, 1] }; return m; }

let weave = null;
const weaveN = () => (weave ??= T.fabricWeave());

// Наружные материалы (всё остальное — интерьер)
const EXTERIOR = new Set([
  'glassBlue', 'glassGreen', 'glassOlive', 'glassNavy', 'glassDark', 'glassDoor', 'glassB1', 'glassB1Lit', 'skyGlass',
  'mullion', 'mullionDark', 'acp', 'acpGray', 'acpJoint', 'acpCream', 'acpTaupe', 'soffit', 'coping',
  'plinthGranite', 'stepGranite', 'stepNosing', 'granite', 'steelExt', 'steelDark', 'steelRed', 'ledBlue', 'ledDown', 'trimDark',
  'acUnit', 'tealRoof', 'roofFlat', 'roof', 'roofRidge', 'soil', 'checkerTile', 'teal21', 'teal21Side', 'teal21School', 'lightPool',
  'asphalt', 'paving', 'grass', 'curb', 'ground', 'context', 'contextRoof', 'contextGlass', 'pitchGreen', 'pitchClay', 'water',
  'car', 'carGlass', 'tire', 'trunk', 'bark', 'treeLeaf', 'treeLeaf2', 'treeConifer', 'treeThuja', 'shrub', 'lavender', 'lavenderStem',
  'flag', 'flagPole', 'bin', 'pole', 'poleLed', 'curbStone', 'bench',
]);

function specs() {
  return {
    // ── фасад: стекло ──
    // «Металличность» здесь — отражающее покрытие: отражение окрашено в цвет стекла.
    glassBlue: () => phys({ color: 0x5d8fca, metalness: 0.86, roughness: 0.035, envMapIntensity: 1.2, transparent: true, opacity: 0.9, clearcoat: 0.6, clearcoatRoughness: 0.03 }),
    glassOlive: () => phys({ color: 0x4d5d52, metalness: 0.82, roughness: 0.045, envMapIntensity: 1.05, transparent: true, opacity: 0.92, clearcoat: 0.5, clearcoatRoughness: 0.03 }),
    glassGreen: () => phys({ color: 0x4d5d52, metalness: 0.82, roughness: 0.045, envMapIntensity: 1.05, transparent: true, opacity: 0.92, clearcoat: 0.5, clearcoatRoughness: 0.03 }),
    glassDark: () => phys({ color: 0x2a3136, metalness: 0.7, roughness: 0.04, envMapIntensity: 1.0, transparent: true, opacity: 0.8, clearcoat: 0.5, clearcoatRoughness: 0.03 }),
    glassNavy: () => phys({ color: 0x223457, metalness: 0.75, roughness: 0.05, envMapIntensity: 1.1, clearcoat: 0.6, clearcoatRoughness: 0.04 }),
    glassSlot: () => phys({ color: 0x27a7b5, metalness: 0.55, roughness: 0.05, envMapIntensity: 1.4 }),
    glassDoor: () => phys({ color: 0x34464e, metalness: 0.35, roughness: 0.04, transparent: true, opacity: 0.42, envMapIntensity: 1.2, depthWrite: false }),
    glassB1: () => phys({ color: 0x1a2024, metalness: 0.6, roughness: 0.06, envMapIntensity: 0.9 }),
    glassB1Lit: () => std({ color: 0x302a22, emissive: 0xffd9a8, emissiveIntensity: 0, roughness: 0.3 }),
    mullion: () => std({ color: 0x33393c, metalness: 0.6, roughness: 0.38 }),
    mullionDark: () => std({ color: 0x24292c, metalness: 0.55, roughness: 0.42 }),
    // ── фасад: облицовка и камень ──
    acp: () => surf(T.acp({ base: '#f2f3f1' }), { metalness: 0.08, ns: 0.35 }),
    acpGray: () => surf(T.acp({ base: '#b9bcbd', seed: 23, panel: [1.2, 1.2] }), { metalness: 0.1, ns: 0.35 }),
    acpCream: () => surf(T.acp({ base: '#ebe6dc', seed: 29 }), { metalness: 0.06, ns: 0.35 }),
    acpTaupe: () => surf(T.acp({ base: '#6f655c', seed: 31 }), { metalness: 0.1, ns: 0.35 }),
    acpJoint: () => std({ color: 0x9aa0a2, roughness: 0.6 }),
    coping: () => std({ color: 0xd8dbdb, metalness: 0.45, roughness: 0.32 }),
    soffit: () => std({ color: 0xf4f4f1, roughness: 0.85 }),
    trimDark: () => std({ color: 0x2b2d30, metalness: 0.5, roughness: 0.4 }),
    plinthGranite: () => surf(T.granite({ base: '#62483e', seed: 17, meters: [1.2, 0.9] }), { ns: 0.8 }),
    stepGranite: () => surf(T.granite({ base: '#a98472', seed: 19, joints: false, polished: false, meters: [1.4, 1.4] }), { ns: 0.6 }),
    stepNosing: () => std({ color: 0x3a2f2a, roughness: 0.75 }),
    granite: () => surf(T.granite(), { ns: 0.8 }),
    // интерьерные ступени: тёмно-серый крапчатый гранит (сиреневые лестницы на фото)
    graniteStep: () => surf(T.granite({ base: '#6d6b66', seed: 23, joints: false, meters: [1.5, 1.5] }), { ns: 0.5 }),
    roof: () => surf(T.roofMetal(), { metalness: 0.05, ns: 0.8 }),
    roofRidge: () => std({ color: 0x6c292d, roughness: 0.55 }),
    roofFlat: () => std({ color: 0x7d8081, roughness: 0.85 }),
    tealRoof: () => std({ color: 0x2c6966, roughness: 0.6 }),
    acUnit: () => std({ color: 0xd9dbd8, metalness: 0.3, roughness: 0.45 }),
    skyGlass: () => phys({ color: 0xcfe8f0, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.22, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
    steelDark: () => std({ color: 0x33373c, metalness: 0.7, roughness: 0.4 }),
    steelRed: () => std({ color: 0xb3261e, metalness: 0.3, roughness: 0.5 }),
    steelExt: () => std({ color: 0xe4e8eb, metalness: 1.0, roughness: 0.17 }),
    stainless: () => std({ color: 0xe4e8eb, metalness: 1.0, roughness: 0.2 }),
    // логотип: лицо, боковины, ножка с надписью SCHOOL (светятся вечером/ночью)
    teal21: () => std({ color: 0x16c6ae, emissive: 0x19dcc0, emissiveIntensity: 0.12, roughness: 0.32 }),
    teal21Side: () => std({ color: 0x0b8a7a, emissive: 0x0fae98, emissiveIntensity: 0.08, roughness: 0.4 }),
    teal21School: () => { const t = T.schoolPlate(); return std({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12, roughness: 0.32 }); },
    // ── участок ──
    asphalt: () => surf(T.asphalt(), { ns: 0.5 }),
    paving: () => surf(T.paving(), { ns: 0.6 }),
    grass: () => surf(T.grass(), { roughness: 1.0, ns: 0.6 }),
    soil: () => surf(T.soil(), { roughness: 1.0, ns: 0.8 }),
    checkerTile: () => surf(T.checker(), { ns: 0.6 }),
    curb: () => std({ color: 0xc9c7c1, roughness: 0.8 }),
    curbStone: () => surf(T.granite({ base: '#8f8c86', seed: 41, joints: false, polished: false, meters: [1.2, 1.2] }), { ns: 0.5 }),
    ground: () => std({ color: 0x8b8a6a, roughness: 1.0 }),
    context: () => std({ map: contextFacade(), roughness: 0.85 }),
    contextRoof: () => std({ color: 0x9fa3a6, roughness: 0.9 }),
    pitchGreen: () => std({ color: 0x3f8a4a, roughness: 0.9 }),
    pitchClay: () => std({ color: 0xb8653d, roughness: 0.9 }),
    water: () => phys({ color: 0x5b8fa8, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.2 }),
    // растительность: карточки листвы с альфа-вырезом, кора
    treeLeaf: () => leafMat(T.leafCard({ seed: 101 }), 0xffffff),
    treeLeaf2: () => leafMat(T.leafCard({ seed: 103 }), 0xe8f0dc),
    treeConifer: () => leafMat(T.leafCard({ seed: 105, hue: 'conifer' }), 0xffffff),
    treeThuja: () => leafMat(T.leafCard({ seed: 109, hue: 'thuja' }), 0xffffff),
    shrub: () => leafMat(T.leafCard({ seed: 111 }), 0xd8e6c8),
    bark: () => surf(T.bark(), { roughness: 0.95, ns: 1 }),
    trunk: () => surf(T.bark(), { roughness: 0.95, ns: 1 }),
    lavender: () => vc(std({ color: 0xffffff, roughness: 0.9 })),
    lavenderStem: () => std({ color: 0x6f8a58, roughness: 0.9 }),
    // уличная мебель
    flag: () => { const t = T.featherFlag(); const m = std({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }); return m; },
    flagPole: () => std({ color: 0x2b2e31, metalness: 0.6, roughness: 0.4 }),
    bin: () => vc(std({ color: 0xffffff, roughness: 0.5 })),
    pole: () => std({ color: 0x3a3d42, metalness: 0.6, roughness: 0.4 }),
    poleLed: () => std({ color: 0x5566ff, emissive: 0x4a55ff, emissiveIntensity: 0.3, roughness: 0.3 }),
    ledBlue: () => std({ color: 0x2a44ff, emissive: 0x3350ff, emissiveIntensity: 2.2, roughness: 0.3 }),
    ledDown: () => std({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 2.4, roughness: 0.3 }),
    lightPool: () => new THREE.MeshBasicMaterial({ map: T.lightPool(), color: 0xffdcae, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true }),
    // ── интерьер: полы ──
    floorTile: () => surf(T.tiles({ base: '#d9d4ca', joint: '#c2bcb1' }), { ns: 0.6 }),
    floorTileWarm: () => surf(T.tiles({ base: '#e6e2da', joint: '#cbc5bb', tile: [0.6, 1.2], count: [4, 2] }), { ns: 0.6 }),
    floorCluster: () => surf(T.clusterFloor(), { ns: 0.5 }),
    floorWood: () => surf(T.wood({ base: '#a47c58', dark: '#6f5039', planks: 8, meters: [3.6, 1.6], rough: 0.45 }), { ns: 0.5 }),
    carpetBlue: () => surf(T.pixelCarpet(), { roughness: 1.0, ns: 0.8 }),
    carpetGreen: () => std({ color: 0x2d4a3c, roughness: 1.0, normalMap: weaveN().userData.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) }),
    carpetDark: () => surf(T.pixelCarpet({ a: '#27305a', b: '#3a3f5c', c2: '#35458a' }), { roughness: 1.0, ns: 0.8 }),
    floorGray: () => surf(T.concrete({ base: '#9a9894', seed: 75 }), { ns: 0.4 }),
    // ── интерьер: стены и потолки ──
    wallWhite: () => std({ color: 0xf1f1ee, roughness: 0.85 }),
    wallLilac: () => std({ color: 0xd1bacb, roughness: 0.75 }),
    wallMint: () => std({ color: 0xa6cfbf, roughness: 0.75 }),
    wallPink: () => surf(T.pinkStone(), { ns: 0.9 }),
    wallLime: () => std({ color: 0x9fcf45, roughness: 0.7 }),
    wallSky: () => std({ color: 0xa9cde6, roughness: 0.8 }),
    wallGreen: () => std({ color: 0x2fbf9a, roughness: 0.7 }),
    ceilingBlack: () => std({ color: 0x1b1c1e, roughness: 0.95, side: THREE.DoubleSide }),
    ceilingWhite: () => std({ color: 0xf2f2f0, roughness: 0.9, side: THREE.DoubleSide }),
    ceilingGray: () => std({ color: 0x74787c, roughness: 0.9, side: THREE.DoubleSide }),
    slabEdge: () => std({ color: 0xd9d9d6, roughness: 0.8 }),
    concrete: () => surf(T.concrete(), { ns: 0.4 }),
    partitionGlass: () => phys({ color: 0xe3f1f5, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.14, envMapIntensity: 1.0, depthWrite: false, side: THREE.DoubleSide }),
    frosted: () => phys({ color: 0xf4f7f8, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false }),
    frameBlack: () => std({ color: 0x232527, metalness: 0.5, roughness: 0.45 }),
    doorWhite: () => std({ color: 0xf6f6f4, roughness: 0.5 }),
    doorBlue: () => std({ color: 0x3a8fd0, roughness: 0.5 }),
    columnWhite: () => std({ color: 0xf3f3f1, roughness: 0.55 }),
    columnBlack: () => std({ map: T.schoolColumn(), roughness: 0.5 }),
    railLilac: () => std({ color: 0xcdb6cd, roughness: 0.7 }),
    railMint: () => std({ color: 0xa5cdb9, roughness: 0.7 }),
    // ── мебель (многокомпонентная — с вершинными цветами) ──
    deskTop: () => std({ color: 0xece9e3, roughness: 0.38 }),
    deskLeg: () => std({ color: 0x2c2e31, metalness: 0.4, roughness: 0.5 }),
    monitor: () => vc(std({ color: 0xffffff, roughness: 0.3, metalness: 0.25 })),
    screenOff: () => screenMat(),
    chairBlack: () => vc(std({ color: 0xffffff, roughness: 0.62, normalMap: T.meshFabric().userData.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) })),
    chairWhite: () => vc(std({ color: 0xffffff, roughness: 0.35 })),
    fabric: () => vc(std({ color: 0xffffff, roughness: 0.92, normalMap: weaveN().userData.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) })),
    plastic: () => std({ color: 0xffffff, roughness: 0.5 }),
    planterWood: () => surf(T.wood({ base: '#86552f', dark: '#553218', planks: 5, meters: [2.4, 0.9], rough: 0.45, seed: 9 }), { ns: 0.5 }),
    leaf: () => vc(std({ color: 0x4f8a45, roughness: 0.7, side: THREE.DoubleSide })),
    leafDark: () => vc(std({ color: 0x356a38, roughness: 0.7, side: THREE.DoubleSide })),
    tableOrange: () => std({ color: 0xe8792c, roughness: 0.4 }),
    tableWhite: () => std({ color: 0xf4f4f2, roughness: 0.4 }),
    easelWood: () => std({ color: 0xc9a067, roughness: 0.6 }),
    marble: () => std({ color: 0xefece6, roughness: 0.35 }),
    pingpong: () => std({ color: 0x1d5aa8, roughness: 0.5 }),
    tier: () => std({ color: 0x3a3a3a, roughness: 0.95, normalMap: weaveN().userData.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) }),
    cushion: () => std({ color: 0x4f4c47, roughness: 1.0, normalMap: weaveN().userData.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) }),
    aisle: () => std({ color: 0xe0d8c8, roughness: 0.6 }),
    books: () => std({ map: T.books(), roughness: 0.8 }),
    shelf: () => std({ color: 0x7a5231, roughness: 0.7 }),
    rack: () => std({ map: T.rackFront(), emissive: 0xffffff, emissiveMap: T.rackFront(), emissiveIntensity: 0.9, roughness: 0.4 }),
    serverGlass: () => phys({ color: 0x3b8cff, emissive: 0x1450c8, emissiveIntensity: 0.6, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }),
    girih: () => std({ map: T.girih(), emissive: 0xffffff, emissiveMap: T.girih(), emissiveIntensity: 0.25, roughness: 0.6 }),
    ceramicMural: () => std({ map: T.ceramicMural(), roughness: 0.8 }),
    pixelMural: () => std({ map: T.pixelRain(), emissive: 0xffffff, emissiveMap: T.pixelRain(), emissiveIntensity: 0.35, roughness: 0.7 }),
    slide: () => std({ map: T.slide(), emissive: 0xffffff, emissiveMap: T.slide(), emissiveIntensity: 0.9, roughness: 0.3 }),
    tvScreen: () => std({ color: 0x111111, emissive: 0x2a5ea8, emissiveIntensity: 0.9, roughness: 0.2 }),
    black: () => std({ color: 0x111214, roughness: 0.5 }),
    // ── свет ──
    led: () => std({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 2.2, roughness: 0.3 }),
    ledCool: () => std({ color: 0xffffff, emissive: 0xeef6ff, emissiveIntensity: 2.4, roughness: 0.3 }),
    ledWarm: () => std({ color: 0xffd9a0, emissive: 0xffb45a, emissiveIntensity: 2.0, roughness: 0.3 }),
    // ── машины ──
    car: () => vc(std({ color: 0xffffff, metalness: 0.55, roughness: 0.3 })),
    carGlass: () => phys({ color: 0x1a232b, metalness: 0.5, roughness: 0.08, clearcoat: 0.5 }),
    tire: () => vc(std({ color: 0xffffff, roughness: 0.85 })),
  };
}

// Листва: альфа-тест + мягкий «объёмный» свет (нормали карточек смотрят от центра кроны)
function leafMat(map, color) {
  const m = std({ map, color, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85 });
  m.userData.noShadowSide = true;
  return m;
}

// Экраны моноблоков: атлас из 4 заставок, вариант — по номеру инстанса
function screenMat() {
  const t = T.screenAtlas();
  const m = std({ color: 0x0a0c10, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.85, roughness: 0.12, metalness: 0.1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        float s21cell = float(gl_InstanceID % 4);
        #ifdef USE_MAP
          vMapUv.x = (vMapUv.x + s21cell) * 0.25;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv.x = (vEmissiveMapUv.x + s21cell) * 0.25;
        #endif
      #endif`);
  };
  m.customProgramCacheKey = () => 's21screen';
  return m;
}

function contextFacade() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#e4e1da'; x.fillRect(0, 0, 256, 256);
  // окна 1.8 × 1.5 м на сетке 3.0 × 3.4 м (текстура = 6 × 6.8 м)
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const g = x.createLinearGradient(0, j * 128 + 34, 0, j * 128 + 90);
    g.addColorStop(0, '#6e8298'); g.addColorStop(1, '#3f4b58');
    x.fillStyle = g; x.fillRect(i * 128 + 26, j * 128 + 34, 76, 56);
    x.fillStyle = '#cfcbc3'; x.fillRect(i * 128 + 22, j * 128 + 90, 84, 4);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(i * 128 + 63, j * 128 + 34, 2, 56);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 6, 1 / 6.8);
  return t;
}

export class Materials {
  constructor() { this.cache = new Map(); this.specs = specs(); }
  get(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    let m = null;
    const [base, level] = key.split('@');
    if (level) {
      m = this.get(base).clone();
      m.userData = { ...m.userData, level, baseOpacity: m.opacity };
    } else if (base.startsWith('col:')) {
      const id = base.slice(4);
      const color = CLUSTER_COLORS[id] || '#888888';
      const name = id.charAt(0).toUpperCase() + id.slice(1);
      const fg = id === 'kokand' || id === 'khiva' ? '#2a3a4a' : (id === 'bukhara' || id === 'shakhrisabz') ? '#1d1d1d' : '#ffffff';
      m = std({ map: T.columnLabel(name, color, fg), roughness: 0.55 });
    } else if (base.startsWith('deskEnd:')) {
      const id = base.slice(8);
      m = std({ map: deskAtlas(id), roughness: 0.5 });
    } else if (base.startsWith('tint:')) {
      m = std({ color: new THREE.Color(base.slice(5)), roughness: 0.8 });
    } else if (base.startsWith('portrait:')) {
      m = std({ map: T.portraitPanel(+base.slice(9)), roughness: 0.6 });
    } else if (this.specs[base]) {
      m = this.specs[base]();
    }
    if (!m) return null;
    m.name = key;
    if (m.opacity === undefined) m.opacity = 1;
    m.userData.baseOpacity = m.opacity;
    if (!m.userData.env) m.userData.env = EXTERIOR.has(base) ? 'ext' : 'int';
    this.cache.set(key, m);
    return m;
  }
  // Регистрация нового материала из любого модуля: mats.define('myKey', () => new THREE.MeshStandardMaterial({...}))
  define(key, factory) { if (!this.specs[key]) this.specs[key] = factory; return this; }
  forLevel(levelId) { return [...this.cache.values()].filter((m) => m.userData.level === levelId); }
  setEnvIntensity(k) { for (const m of this.cache.values()) if ('envMapIntensity' in m) m.envMapIntensity = (m.userData.env0 ??= m.envMapIntensity) * k; }
}
export { EXTERIOR as EXTERIOR_MATERIALS };

// Атлас торцов столов: 8 ячеек (a–h) по 256×160
const atlasCache = new Map();
export const ATLAS_CELLS = 8;
function deskAtlas(id) {
  if (atlasCache.has(id)) return atlasCache.get(id);
  const c = document.createElement('canvas');
  c.width = 256 * ATLAS_CELLS; c.height = 160;
  const x = c.getContext('2d');
  const color = CLUSTER_COLORS[id] || '#777';
  const dark = id === 'bukhara' || id === 'shakhrisabz' || id === 'kokand' || id === 'khiva';
  for (let i = 0; i < ATLAS_CELLS; i++) {
    const ox = i * 256;
    x.fillStyle = color; x.fillRect(ox, 0, 256, 160);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(ox, 0, 256, 3);
    x.fillStyle = dark ? '#1c1c1c' : '#ffffff';
    x.font = '600 16px "JetBrains Mono", monospace';
    x.fillText(id.toUpperCase(), ox + 14, 26);
    x.font = '700 88px "Onest", system-ui, sans-serif';
    x.fillText('abcdefgh'[i], ox + 22, 132);
    x.font = '600 15px "JetBrains Mono", monospace';
    ['9', '7', '5', '3', '1'].forEach((n, k) => x.fillText(n, ox + 168, 52 + k * 21));
    ['10', '8', '6', '4', '2'].forEach((n, k) => x.fillText(n, ox + 196, 52 + k * 21));
    x.fillRect(ox + 190, 38, 2, 110);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  atlasCache.set(id, t);
  return t;
}
