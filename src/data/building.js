// ═══════════════════════════════════════════════════════════════════════════
//  School 21 · Ташкент · ул. Зиёлилар, 13
//  Бывшее здание Фундаментальной библиотеки АН РУз (открыто в сентябре 1982),
//  реконструировано под кампус School 21 (открыт 02.10.2024).
//
//  ЭТО ЕДИНСТВЕННЫЙ ИСТОЧНИК ГЕОМЕТРИИ. Всё, что видно в 3D и на планах,
//  строится из этого файла. Нашли ошибку — правьте цифры здесь.
//
//  Система координат (метры):
//    u — вдоль главного (юго-восточного) фасада, 0 = южный угол (слева, если
//        стоять лицом ко входу), 55.2 = восточный угол (справа, там вход).
//    v — вглубь здания от главного фасада, 0 = главный фасад, 55.2 = задний (СЗ).
//    z — отметка относительно чистого пола 1 этажа (±0.000). Тротуар = −1.50.
//
//  confidence (насколько уверены):
//    'photo'    — видно на фото, размеры сняты по фото/спутнику
//    'video'    — видно в видео-экскурсии (расположение приблизительное)
//    'inferred' — достроено по логике здания, фотографий нет
// ═══════════════════════════════════════════════════════════════════════════

export const SIZE = 55.2;          // сторона квадрата в плане (по фасадным плоскостям)
export const GRADE = -1.5;         // отметка тротуара у главного входа
export const BEARING_U = 39.1;     // азимут оси u (градусы от севера по часовой)

// Геопривязка центра здания (по контуру OSM way 33203100)
export const GEO = { lat: 41.3384361, lon: 69.3358968 };

// Сетка колонн 6×6 м (советский каркас). Оси: цифры по u, буквы по v.
export const GRID = {
  u: [0.6, 6.6, 12.6, 18.6, 24.6, 30.6, 36.6, 42.6, 48.6, 54.6],
  v: [0.6, 6.6, 12.6, 18.6, 24.6, 30.6, 36.6, 42.6, 48.6, 54.6],
  labelsU: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  labelsV: ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'И', 'К', 'Л'],
  column: 0.7,
};

// ─── Уровни ────────────────────────────────────────────────────────────────
// По экскурсии: «три этажа сверху и два этажа в подвале» + «парящая площадка»
// (выставочная зона) — полуэтаж между 1 и 2 этажом.
export const LEVELS = [
  { id: 'B2', name: 'Подвал −2', short: '−2', z: -8.4, h: 4.2, basement: true, confidence: 'video',
    note: 'Книгохранилище библиотеки АН (по словам экскурсовода: «два этажа в подвале», >100 000 книг).' },
  { id: 'B1', name: 'Подвал −1', short: '−1', z: -4.2, h: 4.2, basement: true, confidence: 'video',
    note: 'Книгохранилище и техпомещения. Планировка не известна.' },
  { id: 'L1', name: '1 этаж', short: '1', z: 0, h: 4.5, confidence: 'video',
    note: 'Вход, турникеты, серверная, лобби, лекторий-амфитеатр, конференц-зал, игровая, библиотека АН.' },
  { id: 'M', name: 'Парящая площадка', short: '1½', z: 2.25, h: 6.35, partial: true, confidence: 'photo',
    note: 'Выставочная зона под двусветным атриумом. Сиреневая лестница с 1 этажа и пара маршей на 2 этаж.' },
  { id: 'L2', name: '2 этаж', short: '2', z: 4.5, h: 4.5, confidence: 'video',
    note: 'Кластерная зона: 350 рабочих мест, кухня, пинг-понг, PlayStation, переговорные. Галерея вокруг атриума.' },
  { id: 'L3', name: '3 этаж', short: '3', z: 9.0, h: 4.2, confidence: 'video',
    note: 'Ещё 350 мест, лаунж-коворкинг под стеклянной пирамидой, кухня, пинг-понг.' },
];
export const ROOF_Z = 13.2;        // верх плиты покрытия
export const PARAPET_Z = 14.15;    // верх белого карниза (калибровка по 6 фото, ±0.13)
export const SLAB = 0.35;          // толщина перекрытия

// ─── Атриум и фонарь ───────────────────────────────────────────────────────
// Центр фонаря по спутнику: u≈22.0, v≈28.2 (смещён от центра здания к ЮЗ).
export const ATRIUM = { u0: 12.6, v0: 18.6, u1: 30.6, v1: 36.6, confidence: 'photo' };
export const SKYLIGHT = {
  u0: 12.3, v0: 18.3, u1: 30.9, v1: 36.9,   // основание пирамиды
  base: 17.2,                               // отметка низа пирамиды (стены светового колодца ≈4 м над кровлей)
  rise: 3.4,                                // высота пирамиды
  divisions: 6,                             // триангуляция стального каркаса
  confidence: 'photo',
};

// ─── Цвета кластеров (по фото колонн) ──────────────────────────────────────
export const CLUSTER_COLORS = {
  tashkent: '#1f4fb4', samarkand: '#7d7fc4', bukhara: '#f2c230', khiva: '#35aeb0',
  kokand: '#d9dde0', termez: '#2fb6c9', nukus: '#ee7a2f', shakhrisabz: '#f4b91f',
  jizzakh: '#5fb553', andijan: '#d8484b',
};

// ─── Зоны ──────────────────────────────────────────────────────────────────
// rect: [u0, v0, u1, v1]. type определяет, что строится внутри.
// Типы: cluster, lobby, corridor, lounge, amphitheater, platform, void, kitchen,
//       meeting, conference, game, pingpong, server, library, stair, lift, wc,
//       tech, office, wardrobe, storage, gallery
export const ZONES = [
  // ── Подвалы (без деталей) ────────────────────────────────────────────────
  { id: 'b2-store', level: 'B2', type: 'library', name: 'Книгохранилище', rect: [0.6, 0.6, 54.6, 54.6], confidence: 'inferred' },
  { id: 'b1-store', level: 'B1', type: 'library', name: 'Книгохранилище', rect: [0.6, 18.6, 54.6, 54.6], confidence: 'inferred' },
  { id: 'b1-tech', level: 'B1', type: 'tech', name: 'Техпомещения', rect: [0.6, 0.6, 16.8, 18.6], confidence: 'inferred' },
  { id: 'b1-tech2', level: 'B1', type: 'tech', name: 'Техпомещения', rect: [30.6, 0.6, 54.6, 18.6], confidence: 'inferred' },

  // ── 1 этаж ±0.000 ────────────────────────────────────────────────────────
  { id: 'l1-vestibule', level: 'L1', type: 'lobby', name: 'Тамбур входа', rect: [47.0, 0.6, 54.6, 4.0], confidence: 'photo',
    note: 'Стеклянные двери под козырьком.' },
  { id: 'l1-hall', level: 'L1', type: 'lobby', name: 'Входной холл · фотовыставка', rect: [42.6, 4.0, 54.6, 14.0], confidence: 'video',
    note: 'Белая стена с мольбертами, за турникетами — лобби.', props: { easels: 'u0' } },
  { id: 'l1-turnstiles', level: 'L1', type: 'turnstiles', name: 'Турникеты СКУД', rect: [44.6, 13.6, 53.4, 14.6], confidence: 'video',
    note: '4 скоростных прохода с Face ID, привязаны к платформе.' },
  { id: 'l1-front', level: 'L1', type: 'corridor', name: 'Галерея вдоль фасада', rect: [16.8, 0.6, 42.6, 6.6], confidence: 'video',
    note: 'Длинная белая стена с мольбертами вдоль витража (начало видео-экскурсии).', props: { easels: 'v1' } },
  { id: 'l1-lobby', level: 'L1', type: 'lobby', name: 'Лобби', rect: [30.6, 14.6, 54.6, 36.6], confidence: 'photo',
    note: 'Белые колонны, серые модульные диваны, цветные пуфы, озеленение вдоль витражей.', props: { sofas: true } },
  { id: 'l1-server', level: 'L1', type: 'server', name: 'Серверная', rect: [46.6, 22.6, 52.6, 27.6], confidence: 'video',
    note: 'Стеклянный куб с синей подсветкой стоек — видно сразу за турникетами.' },
  { id: 'l1-photozone', level: 'L1', type: 'photozone', name: 'Фотозона «21»', rect: [34.6, 30.2, 44.6, 30.8], confidence: 'video',
    note: 'Стена с синим гирих-орнаментом, чёрные пирамиды и объёмные «21».' },
  { id: 'l1-amphi', level: 'L1', type: 'amphitheater', name: 'Лекторий-амфитеатр', rect: [16.8, 6.6, 30.6, 18.6], confidence: 'photo',
    note: 'Заглублён до −2.70. Веер из 5 ярусов, розовые стены «травертин», экран, кольцевые светильники.',
    props: { stageZ: -2.7, tiers: 5, corner: 'u1v0' } },
  { id: 'l1-grandstair', level: 'L1', type: 'grandstair', name: 'Сиреневая лестница', rect: [12.6, 13.2, 16.8, 18.6], confidence: 'photo',
    note: 'С 1 этажа на парящую площадку (+2.25). Справа — амфитеатр.', props: { from: 0, to: 2.25, dir: '+v' } },
  { id: 'l1-underplatform', level: 'L1', type: 'storage', name: 'Под площадкой (техн.)', rect: [12.6, 18.6, 30.6, 36.6], confidence: 'inferred', props: { wallTop: 1.9 } },
  { id: 'l1-game', level: 'L1', type: 'game', name: 'Игровая PlayStation', rect: [48.6, 36.6, 54.6, 42.6], confidence: 'video',
    note: 'Играют за баллы платформы. Тёмный пол, телевизоры, кресла-мешки.' },
  { id: 'l1-conf', level: 'L1', type: 'conference', name: 'Конференц-зал', rect: [30.6, 42.6, 54.6, 54.6], confidence: 'video',
    note: 'Большой белый зал: ряды белых стульев, экраны, чёрные колонны, светильники-звёзды.' },
  { id: 'l1-library', level: 'L1', type: 'library', name: 'Библиотека АН РУз', rect: [12.6, 36.6, 30.6, 54.6], confidence: 'inferred',
    note: 'Библиотеке оставили ≈2000 м² (часть на 1 этаже, остальное в подвалах).' },
  { id: 'l1-wardrobe', level: 'L1', type: 'wardrobe', name: 'Гардероб', rect: [30.6, 6.6, 36.6, 14.6], confidence: 'video' },
  { id: 'l1-kitchen', level: 'L1', type: 'kitchen', name: 'Кухня', rect: [0.6, 42.6, 12.6, 54.6], confidence: 'inferred',
    note: '«На каждом этаже есть кухня».' },
  { id: 'l1-office', level: 'L1', type: 'office', name: 'Администрация', rect: [0.6, 24.6, 12.6, 36.6], confidence: 'inferred' },
  { id: 'l1-office2', level: 'L1', type: 'office', name: 'Приёмная / бассейн', rect: [0.6, 0.6, 16.8, 12.6], confidence: 'inferred' },
  { id: 'l1-corr-w', level: 'L1', type: 'corridor', name: 'Коридор', rect: [6.6, 12.6, 12.6, 42.6], confidence: 'inferred' },

  // ── Парящая площадка +2.250 ──────────────────────────────────────────────
  { id: 'm-platform', level: 'M', type: 'platform', name: 'Выставочная зона', rect: [12.6, 18.6, 30.6, 36.6], confidence: 'photo',
    note: 'Бывший читальный зал. Портреты учёных, статуя, кресла-мешки, чёрные колонны «21 SCHOOL», поле светильников-звёзд.' },

  // ── 2 этаж +4.500 ────────────────────────────────────────────────────────
  { id: 'l2-void', level: 'L2', type: 'void', name: 'Второй свет атриума', rect: [12.6, 18.6, 30.6, 36.6], confidence: 'photo' },
  { id: 'l2-gallery', level: 'L2', type: 'gallery', name: 'Галерея вокруг атриума', rect: [8.6, 14.6, 34.6, 40.6], confidence: 'photo',
    note: 'Сиреневый парапет с поручнем, синие банкетки, белые колонны.' },
  { id: 'l2-tashkent', level: 'L2', type: 'cluster', cluster: 'tashkent', name: 'Tashkent', rect: [14.6, 0.6, 36.6, 14.6], confidence: 'photo',
    note: 'Ряды a–g, синие колонны, витражи с рулонными шторами.', props: { rows: 7, facing: '-v' } },
  { id: 'l2-bukhara', level: 'L2', type: 'cluster', cluster: 'bukhara', name: 'Bukhara', rect: [36.6, 14.6, 54.6, 30.6], confidence: 'video', props: { rows: 7, facing: '+u' } },
  { id: 'l2-khiva', level: 'L2', type: 'cluster', cluster: 'khiva', name: 'Khiva', rect: [36.6, 30.6, 54.6, 46.6], confidence: 'video', props: { rows: 7, facing: '+u' } },
  { id: 'l2-samarkand', level: 'L2', type: 'cluster', cluster: 'samarkand', name: 'Samarkand', rect: [12.6, 40.6, 36.6, 54.6], confidence: 'video', props: { rows: 7, facing: '+v' } },
  { id: 'l2-kokand', level: 'L2', type: 'cluster', cluster: 'kokand', name: 'Kokand', rect: [0.6, 24.6, 8.6, 36.6], confidence: 'inferred', props: { rows: 7, facing: '-u', along: 'v' } },
  { id: 'l2-kitchen', level: 'L2', type: 'kitchen', name: 'Кухня', rect: [46.8, 0.6, 54.6, 14.6], confidence: 'video',
    note: 'Оранжевые столы, кулеры, мурал с узбекской керамикой.' },
  { id: 'l2-pingpong', level: 'L2', type: 'pingpong', name: 'Пинг-понг', rect: [0.6, 42.6, 12.6, 54.6], confidence: 'video' },
  { id: 'l2-ps', level: 'L2', type: 'game', name: 'PlayStation-зона', rect: [42.6, 46.6, 54.6, 54.6], confidence: 'video' },
  { id: 'l2-meet-1', level: 'L2', type: 'meeting', name: 'Переговорная', rect: [8.6, 40.6, 12.6, 46.6], confidence: 'inferred' },
  { id: 'l2-meet-2', level: 'L2', type: 'meeting', name: 'Переговорная', rect: [34.6, 36.6, 36.6, 40.6], confidence: 'inferred' },
  { id: 'l2-meet-3', level: 'L2', type: 'meeting', name: 'Переговорная', rect: [8.6, 6.6, 14.6, 12.6], confidence: 'video' },
  { id: 'l2-meet-4', level: 'L2', type: 'meeting', name: 'Переговорная', rect: [36.6, 7.6, 42.6, 14.6], confidence: 'video' },
  { id: 'l2-corr-w', level: 'L2', type: 'corridor', name: 'Коридор', rect: [6.6, 12.6, 8.6, 42.6], confidence: 'inferred' },

  // ── 3 этаж +9.000 ────────────────────────────────────────────────────────
  { id: 'l3-lounge', level: 'L3', type: 'lounge', name: 'Лаунж под пирамидой', rect: [12.6, 18.6, 30.6, 36.6], confidence: 'photo',
    note: 'Подиум +0.45 со ступенями, деревянные кашпо с зеленью, модульные диваны, кольцевые светильники.', props: { podium: 0.45 } },
  { id: 'l3-ring', level: 'L3', type: 'corridor', name: 'Обход лаунжа', rect: [8.6, 14.6, 34.6, 40.6], confidence: 'video' },
  { id: 'l3-termez', level: 'L3', type: 'cluster', cluster: 'termez', name: 'Termez', rect: [14.6, 0.6, 36.6, 14.6], confidence: 'video', props: { rows: 7, facing: '-v' } },
  { id: 'l3-nukus', level: 'L3', type: 'cluster', cluster: 'nukus', name: 'Nukus', rect: [36.6, 14.6, 54.6, 30.6], confidence: 'video', props: { rows: 7, facing: '+u' } },
  { id: 'l3-shakhrisabz', level: 'L3', type: 'cluster', cluster: 'shakhrisabz', name: 'Shakhrisabz', rect: [36.6, 30.6, 54.6, 46.6], confidence: 'photo', props: { rows: 7, facing: '+u' } },
  { id: 'l3-jizzakh', level: 'L3', type: 'cluster', cluster: 'jizzakh', name: 'Jizzakh', rect: [12.6, 40.6, 36.6, 54.6], confidence: 'inferred', props: { rows: 7, facing: '+v' } },
  { id: 'l3-andijan', level: 'L3', type: 'cluster', cluster: 'andijan', name: 'Andijan', rect: [0.6, 24.6, 8.6, 36.6], confidence: 'inferred', props: { rows: 7, facing: '-u', along: 'v' } },
  { id: 'l3-kitchen', level: 'L3', type: 'kitchen', name: 'Кухня', rect: [46.8, 0.6, 54.6, 14.6], confidence: 'video' },
  { id: 'l3-pingpong', level: 'L3', type: 'pingpong', name: 'Пинг-понг', rect: [0.6, 42.6, 12.6, 54.6], confidence: 'video',
    note: 'Салатовые стеновые панели, синий стол, кресла-мешки.' },
  { id: 'l3-meet-1', level: 'L3', type: 'meeting', name: 'Переговорная', rect: [8.6, 6.6, 14.6, 12.6], confidence: 'inferred' },
  { id: 'l3-meet-2', level: 'L3', type: 'meeting', name: 'Переговорная', rect: [36.6, 7.6, 42.6, 14.6], confidence: 'inferred' },
  { id: 'l3-meet-3', level: 'L3', type: 'meeting', name: 'Переговорная', rect: [42.6, 46.6, 54.6, 54.6], confidence: 'inferred' },
  { id: 'l3-corr-w', level: 'L3', type: 'corridor', name: 'Коридор', rect: [6.6, 12.6, 8.6, 42.6], confidence: 'inferred' },
];

// ─── Вертикальные ядра (лестницы, лифты, санузлы) ──────────────────────────
// Положение сверено с надстройками на кровле (спутник). Повторяются на всех этажах.
export const CORES = [
  { id: 'core-a', type: 'stair', name: 'Лестница в башне', rect: [42.6, 0.6, 46.8, 7.2], levels: ['B1', 'L1', 'L2', 'L3'], confidence: 'video',
    note: 'Мятная лестница сразу за турникетами, освещается щелевыми окнами башни.' },
  { id: 'lift-a', type: 'lift', name: 'Лифты', rect: [38.4, 7.6, 42.6, 10.6], levels: ['B1', 'L1', 'L2', 'L3'], confidence: 'video' },
  { id: 'core-b', type: 'stair', name: 'Лестница С', rect: [36.6, 48.6, 42.6, 54.6], levels: ['B2', 'B1', 'L1', 'L2', 'L3'], confidence: 'inferred' },
  { id: 'wc-b', type: 'wc', name: 'Санузлы', rect: [36.6, 46.6, 42.6, 48.6], levels: ['L1', 'L2', 'L3'], confidence: 'inferred' },
  { id: 'core-c', type: 'stair', name: 'Лестница ЮЗ-1', rect: [0.6, 12.6, 6.6, 18.6], levels: ['B2', 'B1', 'L1', 'L2', 'L3'], confidence: 'inferred' },
  { id: 'wc-c', type: 'wc', name: 'Санузлы', rect: [0.6, 18.6, 6.6, 24.6], levels: ['L1', 'L2', 'L3'], confidence: 'inferred' },
  { id: 'core-d', type: 'stair', name: 'Лестница ЮЗ-2', rect: [0.6, 36.6, 6.6, 42.6], levels: ['B2', 'B1', 'L1', 'L2', 'L3'], confidence: 'inferred' },
  { id: 'tech-d', type: 'tech', name: 'Шахты', rect: [6.6, 36.6, 8.6, 42.6], levels: ['L1', 'L2', 'L3'], confidence: 'inferred' },
];

// ─── Лестницы внутри атриума ───────────────────────────────────────────────
export const ATRIUM_STAIRS = [
  // пара сиреневых маршей: галерея 2 этажа (+4.50) → парящая площадка (+2.25)
  { id: 'st-m2-a', name: 'Марш на галерею', u0: 17.6, u1: 20.1, vTop: 36.6, vBottom: 31.8, zTop: 4.5, zBottom: 2.25, confidence: 'photo' },
  { id: 'st-m2-b', name: 'Марш на галерею', u0: 23.1, u1: 25.6, vTop: 36.6, vBottom: 31.8, zTop: 4.5, zBottom: 2.25, confidence: 'photo' },
];

// ─── Фасады ────────────────────────────────────────────────────────────────
// Высоты и положения сняты с 6 откалиброванных фото (кадры видео 1036/1326/1330,
// фото y01/y05/y11), точность ±0.15 м по высоте, ±0.2 м у входа.
// Каждый фасад — список участков вдоль стены (s — координата вдоль фасада
// слева направо, если смотреть снаружи). Типы участков:
//   pilaster — белый угловой пилон на всю высоту (proj — вынос)
//   curtain  — сплошной витраж 0.9 → низ карниза: тёмное оливковое стекло,
//              выше перекрытия 3 эт. — голубая лента (без белого пояса)
//   portal   — белая П-рама (косяк jamb, ригель beam) вокруг двухсветного
//              витража 1–2 эт.; над ригелем — голубая лента 3 эт.
//   tower    — белая башня-пилон со щелевыми окнами (slots: [s0, s1, z0, z1]) и «21»
//   block    — схема правого блока: 1 эт. (l1: entrance | recessed | glass),
//              стекло 2 эт. 4.25–7.64, белый пояс 7.64–8.93, стекло 3 эт. 8.93–12.57
// cornice — отметка низа карниза (верх у всех PARAPET_Z), vents — открытые фрамуги.
export const FACADE = {
  module: 1.12,              // шаг стоек всех витражей (автокорреляция по 3 ракурсам)
  sill: 0.9,                 // низ остекления левой части (ниже — гранит)
  l2Glass: 4.25, band: [7.64, 8.93], bandJoint: 8.28, l3Top: 12.57,
  l2Rows: [6.63], l3Rows: [9.65, 11.4],
  corniceProj: 0.18, corniceJoint: 13.6,
};
export const FACADES = {
  SE: { name: 'Главный фасад (ЮВ)', confidence: 'photo', segments: [
    { s0: 0.0, s1: 1.2, type: 'pilaster', proj: 0.3, cornice: 11.72 },
    { s0: 1.2, s1: 16.2, type: 'curtain', cornice: 11.72, rows: [2.5, 3.5, 4.3, 5.1, 6.8, 8.73, 9.65], blueFrom: 8.9, vents: 5 },
    { s0: 16.2, s1: 34.9, type: 'portal', cornice: 11.72, jamb: 2.1, beam: [7.6, 8.9], rows: [2.55, 3.55, 4.3, 5.1, 6.9], ribbonRows: [9.65], vents: 8, portalVents: 2 },
    { s0: 34.9, s1: 42.3, type: 'tower', proj: 0.2, top: 17.3,
      slots: [[36.1, 36.65, 0.9, 6.3], [36.1, 36.65, 7.7, 16.6], [38.0, 38.35, 0.9, 4.3], [38.0, 38.35, 6.6, 14.05], [40.5, 41.1, 6.6, 7.6], [40.5, 41.1, 9.0, 16.6]] },
    { s0: 42.3, s1: 55.2, type: 'block', l1: 'entrance', cornice: 12.57, vents: 3 },
  ] },
  NE: { name: 'Боковой фасад (СВ)', confidence: 'photo', segments: [
    // схема правого блока по всей длине (видно до v≈47); на 1 эт. — утопленный тёмный витраж
    // под выносной полосой-софитом 3.3–4.2 (продолжение козырька, с точечными светильниками)
    { s0: 0.0, s1: 54.0, type: 'block', l1: 'recessed', soffit: 1.5, cornice: 12.57, vents: 2 },
    { s0: 54.0, s1: 55.2, type: 'pilaster', proj: 0.3, cornice: 12.57, confidence: 'inferred' },
  ] },
  NW: { name: 'Задний фасад (СЗ)', confidence: 'inferred', segments: [
    { s0: 0.0, s1: 1.2, type: 'pilaster', proj: 0.3, cornice: 12.57 },
    { s0: 1.2, s1: 54.0, type: 'block', l1: 'glass', cornice: 12.57, vents: 3 },
    { s0: 54.0, s1: 55.2, type: 'pilaster', proj: 0.3, cornice: 12.57 },
  ] },
  SW: { name: 'Боковой фасад (ЮЗ)', confidence: 'inferred', segments: [
    { s0: 0.0, s1: 1.2, type: 'pilaster', proj: 0.3, cornice: 12.57 },
    { s0: 1.2, s1: 54.0, type: 'block', l1: 'glass', cornice: 12.57, vents: 3 },
    { s0: 54.0, s1: 55.2, type: 'pilaster', proj: 0.3, cornice: 11.72 },   // южный угол — как на ЮВ
  ] },
};

// ─── Козырёк, логотипы, крыльцо ────────────────────────────────────────────
// Козырёк — консоль ≈4.5 м без колонн по переднему краю: две отдельно стоящие
// колонны 0.9×0.9 ближе к фасаду и два пилона у восточного края.
export const CANOPY = {
  u0: 41.6, u1: 55.2, depth: 6.7, soffit: 3.3, top: 4.2, fascia: 0.9,
  columns: [],                                         // по переднему краю колонн нет
  freeColumns: [[47.6, -2.2], [49.75, -2.2]],          // центры, 0.9×0.9, z 0–3.3
  piers: [[53.4, -2.0, 54.4, -0.2], [54.6, -2.0, 55.4, -0.2]],
  downlights: { rows: [-1.2, -3.4, -5.6], u0: 43.6, u1: 54.6, step: 2.2 },
  confidence: 'photo',
};
export const LOGOS = [
  // большой «21 SCHOOL» стоит на переднем крае козырька (на стойках, +0.4 м над верхом,
  // две тяги к фасаду). «2» — u 46.7–48.3, z 4.6–6.85; ножка «1» с надписью SCHOOL — u 49.0–49.45
  { id: 'logo-canopy', face: 'SE', u: 46.7, z: 4.6, v: -6.75, size: 2.2, school: true, posts: true, confidence: 'photo' },
  // малый «21» наверху башни: u 37.5–39.3, z 15.3–16.7
  { id: 'logo-tower', face: 'SE', u: 37.5, z: 15.3, v: -0.25, size: 1.4, school: false, confidence: 'photo' },
];
export const ENTRANCE = {
  // 10 подступенков по 0.15, проступь 0.40; низ — под передним краем козырька, площадка 2.7 м
  stairs: { u0: 44.3, u1: 55.0, vTop: -2.7, risers: 10, tread: 0.40, confidence: 'photo' },
  // пандус-«змейка»: верхний марш вдоль фасада поднимается к террасе у u 43,
  // нижний спускается к площади у u≈37.5; поворотная площадка у u 17.5–21 (+ 5 ступеней к площади)
  ramp: { u0: 17.5, u1: 43.0, v0: -4.3, v1: -0.3, confidence: 'photo',
    landing: { u0: 17.5, u1: 21.0, z: -0.75 },
    upper: { v0: -2.0, v1: -0.3, u1: 43.0 },
    lower: { v0: -4.3, v1: -2.4, u1: 37.5 },
    steps: 5 },
  // двери тамбура: витраж u 42.3–53.4 (фото, ±0.1; здесь ровно 10 модулей по 1.12),
  // чёрные рамы; раздвижные двери (два средних модуля справа от колонн) открыты — проём 2.24 м
  glazing: { u0: 42.3, u1: 53.5, h: 3.3 },
  doors: [{ u0: 50.14, u1: 52.38, h: 2.7 }],
  // правая щека крыльца — гранитный цветник, дальше вдоль СВ фасада — гранитная полоса-цветник
  // и заглублённая дорожка с шахматной плиткой, в стене — окна подвала −1
  planter: { u0: 55.0, u1: 58.3, v0: -6.5, v1: 0, top: 0.7 },
  neStrip: { u0: 55.2, u1: 58.5, v0: -0.2, v1: 55.2, top: 0.8, ledge: -0.25 },
  neWalk: { u0: 58.5, u1: 61.0, v0: -5.0, v1: 55.2, z: -2.1, basementWindows: [-1.9, -1.1] },
  flowerbed: { u: 54.0, v: -17.8, r: 3.6, ru: 4.0, rv: 3.25, confidence: 'photo' },
};

// ─── Надстройки на кровле (по спутнику) ────────────────────────────────────
export const ROOF_BOXES = [
  // башня продолжается вглубь: лестница + машинное отделение лифтов, верх 17.3
  { id: 'rb-tower', name: 'Башня: лестница и лифты', rect: [36.2, 0.3, 42.3, 10.2], top: 17.3, confidence: 'photo' },
  { id: 'rb-a', name: 'Венткамера', rect: [36.2, 10.2, 42.3, 24.8], h: 2.6, tealRoof: [10.3, 16.5], confidence: 'photo' },
  { id: 'rb-b', name: 'Выход на кровлю С', rect: [36.3, 44.9, 42.6, 54.6], h: 2.8, confidence: 'photo' },
  { id: 'rb-c', name: 'Выход на кровлю ЮЗ-1', rect: [4.5, 20.3, 11.0, 24.2], h: 2.6, confidence: 'photo' },
  { id: 'rb-c-ac', name: 'Площадка кондиционеров', rect: [1.0, 13.0, 11.5, 20.3], h: 0.3, ac: true, confidence: 'photo' },
  { id: 'rb-d', name: 'Выход на кровлю ЮЗ-2', rect: [1.2, 35.5, 10.5, 42.3], h: 2.6, confidence: 'photo' },
];

// Источники — показываются в интерфейсе
export const SOURCES = [
  { label: 'Видео-экскурсия по кампусу (Umed Rahimov, июнь 2025)', url: 'https://www.youtube.com/watch?v=2XjpOjV1bHY' },
  { label: 'Яндекс Карты — 77 фото организации', url: 'https://yandex.uz/maps/org/school_21/209504048996/gallery/' },
  { label: 'Gazeta.uz — открытие кампуса, 04.10.2024', url: 'https://www.gazeta.uz/ru/2024/10/04/school-21/' },
  { label: 'OpenStreetMap — контур здания (way 33203100)', url: 'https://www.openstreetmap.org/way/33203100' },
  { label: 'Письма о Ташкенте — история библиотеки АН', url: 'https://mytashkent.uz/2011/05/11/fundamentalnaya-biblioteka-akademii-nauk/' },
];
