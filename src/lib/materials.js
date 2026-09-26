// Библиотека материалов. Материалы создаются лениво по ключу и переиспользуются.
// Ключ вида 'glassBlue@L2' даёт отдельную копию материала для уровня —
// так в режиме «разреза» можно сделать прозрачнее стекло только нужного этажа.
import * as THREE from 'three';
import * as T from './textures.js';
import { CLUSTER_COLORS } from '../data/building.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);

function specs() {
  return {
    // ── фасад ──
    glassBlue: () => phys({ color: 0x2466b8, metalness: 0.9, roughness: 0.05, envMapIntensity: 1.1, transparent: true, opacity: 0.94, clearcoat: 0.5, clearcoatRoughness: 0.04 }),
    glassGreen: () => phys({ color: 0x3a7a5c, metalness: 0.88, roughness: 0.06, envMapIntensity: 0.95, transparent: true, opacity: 0.94, clearcoat: 0.5, clearcoatRoughness: 0.04 }),
    glassSlot: () => phys({ color: 0x27a7b5, metalness: 0.55, roughness: 0.05, envMapIntensity: 1.4 }),
    glassDoor: () => phys({ color: 0x21323a, metalness: 0.4, roughness: 0.05, transparent: true, opacity: 0.7, envMapIntensity: 1.2 }),
    mullion: () => std({ color: 0xb9c0c5, metalness: 0.75, roughness: 0.32 }),
    mullionDark: () => std({ color: 0x3e464c, metalness: 0.6, roughness: 0.4 }),
    acp: () => std({ map: T.acp(), color: 0xf3f4f3, roughness: 0.38, metalness: 0.05 }),
    acpGray: () => std({ map: T.acp({ base: '#b9bcbd', panel: [1.2, 1.2] }), roughness: 0.5, metalness: 0.1 }),
    granite: () => std({ map: T.granite(), roughness: 0.45, metalness: 0.05 }),
    graniteStep: () => std({ map: T.granite({ base: '#a47a67', joints: false, meters: [1.5, 1.5] }), roughness: 0.4 }),
    roof: () => std({ map: T.roofMetal(), roughness: 0.55, metalness: 0.35 }),
    skyGlass: () => phys({ color: 0xcfe8f0, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.22, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
    steelDark: () => std({ color: 0x3a3f45, metalness: 0.65, roughness: 0.38 }),
    teal21: () => std({ color: 0x14c4a2, emissive: 0x14c4a2, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.0 }),
    stainless: () => std({ color: 0xdfe4e8, metalness: 1.0, roughness: 0.22 }),
    // ── участок ──
    asphalt: () => std({ map: T.asphalt(), roughness: 0.92 }),
    paving: () => std({ map: T.paving(), roughness: 0.85 }),
    grass: () => std({ map: T.grass(), roughness: 1.0 }),
    curb: () => std({ color: 0xc9c7c1, roughness: 0.8 }),
    ground: () => std({ color: 0x8b8a6a, roughness: 1.0 }),
    context: () => std({ map: contextFacade(), roughness: 0.85 }),
    contextRoof: () => std({ color: 0x9fa3a6, roughness: 0.9 }),
    pitchGreen: () => std({ color: 0x3f8a4a, roughness: 0.9 }),
    pitchClay: () => std({ color: 0xb8653d, roughness: 0.9 }),
    water: () => phys({ color: 0x5b8fa8, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.2 }),
    // ── интерьер: полы ──
    floorTile: () => std({ map: T.tiles(), roughness: 0.28, metalness: 0.02 }),
    floorTileWarm: () => std({ map: T.tiles({ base: '#e6e2da', joint: '#cbc5bb', tile: [0.6, 1.2], count: [4, 2] }), roughness: 0.3 }),
    floorCluster: () => std({ map: T.clusterFloor(), roughness: 0.6 }),
    floorWood: () => std({ map: T.wood({ base: '#b88d62', dark: '#8a6440', planks: 8, meters: [3.6, 1.6] }), roughness: 0.5 }),
    carpetBlue: () => std({ map: T.pixelCarpet(), roughness: 1.0 }),
    carpetGreen: () => std({ color: 0x2c6a58, roughness: 1.0 }),
    carpetDark: () => std({ map: T.pixelCarpet({ a: '#27305a', b: '#3a3f5c', c2: '#35458a' }), roughness: 1.0 }),
    floorGray: () => std({ color: 0x9a9894, roughness: 0.8 }),
    // ── интерьер: стены и потолки ──
    wallWhite: () => std({ color: 0xf1f1ee, roughness: 0.85 }),
    wallLilac: () => std({ color: 0xc6b5dc, roughness: 0.75 }),
    wallMint: () => std({ color: 0x9fd8c4, roughness: 0.75 }),
    wallPink: () => std({ map: T.pinkStone(), roughness: 0.8 }),
    wallLime: () => std({ color: 0x9fcf45, roughness: 0.7 }),
    wallSky: () => std({ color: 0xa9cde6, roughness: 0.8 }),
    wallGreen: () => std({ color: 0x2fbf9a, roughness: 0.7 }),
    ceilingBlack: () => std({ color: 0x1c1d20, roughness: 0.95, side: THREE.DoubleSide }),
    ceilingWhite: () => std({ color: 0xf2f2f0, roughness: 0.9, side: THREE.DoubleSide }),
    ceilingGray: () => std({ color: 0x74787c, roughness: 0.9, side: THREE.DoubleSide }),
    slabEdge: () => std({ color: 0xd9d9d6, roughness: 0.8 }),
    concrete: () => std({ color: 0xb4b2ac, roughness: 0.9 }),
    partitionGlass: () => phys({ color: 0xe3f1f5, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, envMapIntensity: 1.0, depthWrite: false, side: THREE.DoubleSide }),
    frosted: () => phys({ color: 0xf4f7f8, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false }),
    frameBlack: () => std({ color: 0x232527, metalness: 0.5, roughness: 0.45 }),
    doorWhite: () => std({ color: 0xf6f6f4, roughness: 0.5 }),
    doorBlue: () => std({ color: 0x2c9fd4, roughness: 0.5 }),
    columnWhite: () => std({ color: 0xf3f3f1, roughness: 0.55 }),
    columnBlack: () => std({ map: T.schoolColumn(), roughness: 0.5 }),
    railLilac: () => std({ color: 0xc4b2da, roughness: 0.7 }),
    railMint: () => std({ color: 0x9ed5c1, roughness: 0.7 }),
    // ── мебель ──
    deskTop: () => std({ color: 0xf5f5f3, roughness: 0.45 }),
    deskLeg: () => std({ color: 0x2a2c2f, metalness: 0.4, roughness: 0.5 }),
    monitor: () => std({ color: 0x141517, roughness: 0.4, metalness: 0.3 }),
    screenOff: () => std({ color: 0x0b0f16, emissive: 0x0d1b2e, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.2 }),
    chairBlack: () => std({ color: 0x1b1c1f, roughness: 0.7 }),
    chairWhite: () => std({ color: 0xf3f3f3, roughness: 0.4 }),
    fabric: () => std({ color: 0xffffff, roughness: 0.95 }),
    plastic: () => std({ color: 0xffffff, roughness: 0.5 }),
    planterWood: () => std({ map: T.wood({ base: '#8f5a31', dark: '#5a3519', planks: 5, meters: [2.4, 0.9] }), roughness: 0.6 }),
    leaf: () => std({ color: 0x3f7f3c, roughness: 0.85, flatShading: true }),
    leafDark: () => std({ color: 0x2b5f35, roughness: 0.85, flatShading: true }),
    tableOrange: () => std({ color: 0xee7a2a, roughness: 0.45 }),
    tableWhite: () => std({ color: 0xf4f4f2, roughness: 0.4 }),
    easelWood: () => std({ color: 0xc9a067, roughness: 0.6 }),
    marble: () => std({ color: 0xefece6, roughness: 0.35 }),
    pingpong: () => std({ color: 0x1d5aa8, roughness: 0.5 }),
    tier: () => std({ color: 0x2f3134, roughness: 0.9 }),
    cushion: () => std({ color: 0x45484c, roughness: 1.0 }),
    aisle: () => std({ color: 0xefefec, roughness: 0.6 }),
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
    car: () => std({ color: 0xffffff, metalness: 0.6, roughness: 0.28 }),
    carGlass: () => std({ color: 0x1a232b, metalness: 0.5, roughness: 0.1 }),
    tire: () => std({ color: 0x151515, roughness: 0.9 }),
    trunk: () => std({ color: 0x5a4636, roughness: 0.95 }),
  };
}

function contextFacade() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#e4e1da'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#56606b';
  // окна 1.8 × 1.5 м на сетке 3.0 × 3.4 м (текстура = 6 × 6.8 м)
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) x.fillRect(i * 128 + 26, j * 128 + 34, 76, 56);
  x.fillStyle = 'rgba(255,255,255,0.15)';
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) x.fillRect(i * 128 + 26, j * 128 + 34, 76, 8);
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
      m.userData.level = level;
      m.userData.baseOpacity = m.opacity;
    } else if (base.startsWith('col:')) {
      const id = base.slice(4);
      const color = CLUSTER_COLORS[id] || '#888888';
      const name = id.charAt(0).toUpperCase() + id.slice(1);
      const fg = id === 'kokand' ? '#2a3a4a' : (id === 'bukhara' || id === 'shakhrisabz') ? '#1d1d1d' : '#ffffff';
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
    this.cache.set(key, m);
    return m;
  }
  forLevel(levelId) { return [...this.cache.values()].filter((m) => m.userData.level === levelId); }
  setEnvIntensity(k) { for (const m of this.cache.values()) if ('envMapIntensity' in m) m.envMapIntensity = (m.userData.env0 ??= m.envMapIntensity) * k; }
}

// Атлас торцов столов: 8 ячеек (a–h) по 256×160
const atlasCache = new Map();
export const ATLAS_CELLS = 8;
function deskAtlas(id) {
  if (atlasCache.has(id)) return atlasCache.get(id);
  const c = document.createElement('canvas');
  c.width = 256 * ATLAS_CELLS; c.height = 160;
  const x = c.getContext('2d');
  const color = CLUSTER_COLORS[id] || '#777';
  const dark = id === 'bukhara' || id === 'shakhrisabz' || id === 'kokand';
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
