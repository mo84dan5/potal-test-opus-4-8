/**
 * ワールドのオブジェクト配置・ポータル接続・文言の共有定義。
 * 描画(ThreeRendererAdapter)とドメイン構築(main.ts)の双方がここを参照することで
 * 座標・接続のズレを防ぐ。
 *
 * ワールド接続グラフ:
 *   雪の世界 ⇄ 昼の世界 ⇄ 夜の世界 ⇄ 黄昏の遺跡
 */
import { GameEvent } from '../domain/values/EventScript';
import { BattleDefinition } from '../domain/values/Battle';
import { TECH_DUELIST, TECH_POWER, TECH_RANGED, TECH_SWIFT } from '../domain/values/Combat';

export interface WorldObjectSpec {
  kind: 'tree' | 'rock' | 'crystal' | 'ice' | 'pillar';
  x: number;
  z: number;
  /** rock: 半径 / crystal・ice: 高さ / pillar: 高さ */
  size?: number;
  /** crystal の発光色 */
  color?: number;
  name: string;
  /** 吹き出し表示のアンカー高さ [m] */
  anchorY: number;
  /** 衝突半径 [m](XZ平面の円柱コライダー) */
  collisionRadius: number;
  /** 接近時の吹き出し文 */
  bubble?: string;
  /** タップ時のコメント列 */
  dialogue?: string[];
}

export interface PortalSpec {
  /** 全ワールドで一意なポータルID */
  id: string;
  x: number;
  z: number;
  /** 面の向き(Y軸まわり、ラジアン) */
  yaw: number;
  targetWorldId: string;
  targetPortalId: string;
  /** 枠の発光色 */
  frameColor: number;
  /**
   * ポータルの種別。
   * - 'gate'(既定): 歩いて横切ると瞬間移動する透過ポータル(世界間の門)
   * - 'door': 閉じた扉として描画され、移動では入れず、タップで入室する
   */
  kind?: 'gate' | 'door';
}

export interface NpcSpec {
  /** スポーン位置(足元) */
  x: number;
  z: number;
  name: string;
  /** 服の色 */
  color: number;
  /** 徘徊半径 [m] */
  wanderRadius: number;
  /** 静止NPCの向き [rad](省略時は広場の中心を向く) */
  yaw?: number;
  bubble: string;
  /** タップ時の世界の説明 */
  dialogue: string[];
  /** タップで開始するイベントのID(EVENTS のキー)。指定時は会話の代わりにイベントが起きる */
  eventId?: string;
  /** 会話の最後に「戦う?」の選択肢を出す戦闘のID(BATTLES のキー)。「はい」で戦闘開始 */
  battleId?: string;
}

/** イベントで動かせるプロップ(岩など)の定義 */
export interface PropSpec {
  /** イベントから参照するID(ワールド内で一意) */
  id: string;
  x: number;
  z: number;
  /** 見た目の大きさ [m] */
  size: number;
  /** 衝突半径 [m] */
  collisionRadius: number;
}

/** 家のワールド内位置(ドアは +Z 向き) */
export interface HouseSpec {
  x: number;
  z: number;
}

/**
 * 室内ワールド型の家(外観の小屋)の位置。ドアは +Z 向きで、その中央(z + depth/2)に
 * 室内ワールドへ通じるポータルが立つ。ポータル本体は当該ワールドの portals に定義する。
 */
export interface PortalHouseSpec {
  x: number;
  z: number;
}

/** 室内ワールド(囲まれた部屋)の寸法 [m] */
export interface RoomSpec {
  width: number;
  depth: number;
  height: number;
}

/** 家の寸法と家具のローカル配置(ドアは +Z 面の中央) */
export const HOUSE = {
  width: 6,
  depth: 5,
  wallHeight: 2.6,
  doorWidth: 1.4,
  /** テレビ(背面寄り・部屋側 +Z を向く) */
  tv: { x: -1.5, z: -1.9, anchorY: 1.7 },
  /** 円卓 */
  table: { x: 1.1, z: -0.6, anchorY: 1.4 },
} as const;

export const HOUSE_TV_DIALOGUE = [
  'テレビだ。カラフルな模様がずっと流れている。',
  'チャンネルは…これひとつしかないようだ。',
];
export const HOUSE_TABLE_BUBBLE = 'これはテーブルです';

/**
 * 家の壁に沿って並べる円柱コライダーの位置(XZ)を返す。
 * 半径0.4の円を約0.55間隔で外周に配置し、+Z面のドア開口部分だけ除外する。
 */
export const HOUSE_WALL_COLLIDER_RADIUS = 0.4;
export function houseWallColliderSpots(
  hx: number,
  hz: number,
): Array<{ x: number; z: number }> {
  const spots: Array<{ x: number; z: number }> = [];
  const w = HOUSE.width / 2;
  const d = HOUSE.depth / 2;
  const step = 0.5;
  for (let x = -w; x <= w + 1e-6; x += step) {
    spots.push({ x: hx + x, z: hz - d }); // 背面
    if (Math.abs(x) > HOUSE.doorWidth / 2 + 0.2) {
      spots.push({ x: hx + x, z: hz + d }); // 前面(ドア開口を除く)
    }
  }
  for (let z = -d + step; z <= d - step + 1e-6; z += step) {
    spots.push({ x: hx - w, z: hz + z }); // 左側面
    spots.push({ x: hx + w, z: hz + z }); // 右側面
  }
  return spots;
}

/**
 * 室内ワールド型の家(外観の小屋)の寸法。ドアは +Z 面の中央。
 * ドア開口はポータル面(全幅 = PORTAL_HALF_WIDTH×2 = 2.8)を収めるため広めに取る。
 */
export const PORTAL_HOUSE = {
  width: 6,
  depth: 5,
  wallHeight: 3.2,
  doorWidth: 3.0,
} as const;

/**
 * 室内ワールド型の家の外観小屋の壁コライダー位置(XZ)。
 * houseWallColliderSpots と同方式で、+Z 面のドア開口(=ポータル位置)だけ除外する。
 */
export const PORTAL_HOUSE_WALL_COLLIDER_RADIUS = 0.4;
export function portalHouseWallColliderSpots(
  hx: number,
  hz: number,
): Array<{ x: number; z: number }> {
  const spots: Array<{ x: number; z: number }> = [];
  const w = PORTAL_HOUSE.width / 2;
  const d = PORTAL_HOUSE.depth / 2;
  const step = 0.5;
  for (let x = -w; x <= w + 1e-6; x += step) {
    spots.push({ x: hx + x, z: hz - d }); // 背面
    if (Math.abs(x) > PORTAL_HOUSE.doorWidth / 2 + 0.2) {
      spots.push({ x: hx + x, z: hz + d }); // 前面(ドア開口を除く)
    }
  }
  for (let z = -d + step; z <= d - step + 1e-6; z += step) {
    spots.push({ x: hx - w, z: hz + z }); // 左側面
    spots.push({ x: hx + w, z: hz + z }); // 右側面
  }
  return spots;
}

/**
 * 室内ワールド(部屋)の壁コライダー位置(XZ・部屋中心が原点)。
 * 玄関壁(-Z)の doorX を中心に doorWidth の開口を空け、戻りポータルへ通れるようにする。
 */
export const ROOM_WALL_COLLIDER_RADIUS = 0.5;
export function roomWallColliderSpots(
  room: RoomSpec,
  doorX: number,
  doorWidth: number,
): Array<{ x: number; z: number }> {
  const spots: Array<{ x: number; z: number }> = [];
  const w = room.width / 2;
  const d = room.depth / 2;
  const step = 0.8;
  for (let x = -w; x <= w + 1e-6; x += step) {
    if (Math.abs(x - doorX) > doorWidth / 2 + 0.3) {
      spots.push({ x, z: -d }); // 玄関壁(ドア開口を除く)
    }
    spots.push({ x, z: d }); // 奥壁
  }
  for (let z = -d + step; z <= d - step + 1e-6; z += step) {
    spots.push({ x: -w, z }); // 左壁
    spots.push({ x: w, z }); // 右壁
  }
  return spots;
}

/**
 * 2階建ての家(室内)の寸法・床高さ設定。部屋中心が原点。
 * 1階(h=0)/ 右レーンの階段(0→floorHeight)/ 奥側のロフト(z>=loftFrontZ, h=floorHeight)。
 */
export const TWO_FLOOR = {
  width: 14,
  depth: 14,
  height: 6.2,
  floorHeight: 3.0,
  loftFrontZ: 0, // z>=0 はロフト(2階)
  stairXMin: 3.5, // x>=3.5 が階段レーン(右壁との間)
  stairZBottom: -4, // 階段下端(h=0)
  stairZTop: 0, // 階段上端(h=floorHeight)=ロフト前縁
} as const;

/**
 * 2階建ての家の「階段ブロッカー」コライダー位置(XZ・部屋中心が原点)。
 * 階段フットプリント(x∈[stairXMin,w], z∈[stairZBottom,loftFrontZ])の地面レベルへ
 * 1階のプレイヤーが侵入(=ソリッドな階段の下に潜り込む)のを防ぐため、
 * 開放側(x=stairXMin)と裏側(z=loftFrontZ)を囲う。
 * これらは高さ制限(yMax<floorHeight)で運用するため、ロフト(2階)には影響しない。
 * ロフト前縁(x<stairXMin)には置かないので、1階からロフトの下へは従来どおり入れる。
 */
export const TWO_FLOOR_STAIR_BLOCKER_RADIUS = 0.35;
/**
 * 階段ブロッカーが作用する高さ上限 [m]。腰高の低い「壁」にする。
 * 1階(足元0)の侵入は阻止しつつ、階段上端を登る人(足元≈2.5)・2階(足元3.0)には作用させない。
 * 裏側ブロッカーの作用境界 z=-(0.35+0.35) における階段面の高さ 2.475m を下回る必要があるため、
 * 余裕を持って 1.2m とする(これより高いと登坂中に引っかかる)。
 */
export const TWO_FLOOR_STAIR_BLOCKER_YMAX = 1.2;
export function twoFloorStairBlockerSpots(): Array<{ x: number; z: number }> {
  const spots: Array<{ x: number; z: number }> = [];
  const w = TWO_FLOOR.width / 2;
  const step = 0.6;
  // 開放側(左側 x=stairXMin)。上端(z=loftFrontZ)まで隙間なく
  for (let z = TWO_FLOOR.stairZBottom; z <= TWO_FLOOR.loftFrontZ + 1e-6; z += step) {
    spots.push({ x: TWO_FLOOR.stairXMin, z });
  }
  // 裏側(z=loftFrontZ、階段幅 x∈[stairXMin,w])
  for (let x = TWO_FLOOR.stairXMin; x <= w + 1e-6; x += step) {
    spots.push({ x, z: TWO_FLOOR.loftFrontZ });
  }
  return spots;
}

/**
 * 崖(メサ)の頂上寸法。よじ登れる「壁」。
 * slopeRun はほぼ垂直の薄い斜面にする(これにより足元高さが急変し、
 * MovementService の登坂レート制限=よじ登りが確実に発動する。緩斜面だと即歩いて登れてしまう)。
 */
export const CLIFF = {
  halfWidth: 2,
  halfDepth: 2,
  height: 4,
  slopeRun: 0.3,
} as const;

export interface WorldDef {
  id: string;
  name: string;
  objects: WorldObjectSpec[];
  portals: PortalSpec[];
  npcs: NpcSpec[];
  /** 家(入れる建物)。ドアは +Z 向き */
  house?: HouseSpec;
  /** よじ登れる崖(メサ)の中心位置。寸法は CLIFF */
  cliff?: { x: number; z: number };
  /** イベントで動かせるプロップ(岩など) */
  props?: PropSpec[];
  /** 室内ワールド型の家(外観の小屋)。複数可。各ドアのポータルで room ワールドへ飛ぶ */
  portalHouses?: PortalHouseSpec[];
  /** このワールドが室内(囲まれた部屋)である場合の寸法。指定時は屋外環境を描かない */
  room?: RoomSpec;
  /** 室内ワールドか(屋外の空・地面・地形を描かない) */
  interior?: boolean;
  /** 室内の床種別。'two-floor' は階段+ロフト(2階)の高さ場を割り当てる */
  floorKind?: 'two-floor';
  /** 地形起伏の振幅 [m] */
  terrainAmplitude: number;
}

const TREE_BUBBLE = 'これは木です';
const ROCK_DIALOGUE = [
  'これは石だ。',
  'ごつごつしていて、ずっしり重そうだ。',
  '……特に何も起こらなかった。',
];
const CRYSTAL_BUBBLE = 'これはクリスタルです';
const CRYSTAL_DIALOGUE = [
  'これはクリスタルだ。',
  'ほのかに光って、さわると少しあたたかい。',
  '夜の世界のあかりになっているらしい。',
];
const ICE_BUBBLE = 'これは氷柱です';
const ICE_DIALOGUE = [
  'これは氷だ。',
  'ひんやりと冷たい。',
  '奥で何かが光った…気のせいだろうか。',
];
const PILLAR_BUBBLE = 'これは古代の柱です';
const PILLAR_DIALOGUE = [
  '古い石柱だ。',
  '風化していて文字は読めない。',
  '遠い昔、ここには都があったのかもしれない。',
];

export const WORLD_DEFS: WorldDef[] = [
  {
    id: 'day',
    terrainAmplitude: 0.8,
    name: '昼の世界',
    objects: [
      { kind: 'tree', x: -8, z: -2, name: '木', anchorY: 4.2, collisionRadius: 0.5, bubble: TREE_BUBBLE },
      { kind: 'tree', x: 9, z: -4, name: '木', anchorY: 4.2, collisionRadius: 0.5, bubble: TREE_BUBBLE },
      { kind: 'tree', x: -12, z: 8, name: '木', anchorY: 4.2, collisionRadius: 0.5, bubble: TREE_BUBBLE },
      { kind: 'tree', x: 13, z: 9, name: '木', anchorY: 4.2, collisionRadius: 0.5, bubble: TREE_BUBBLE },
      { kind: 'tree', x: -5, z: 14, name: '木', anchorY: 4.2, collisionRadius: 0.5, bubble: TREE_BUBBLE },
      { kind: 'tree', x: 6, z: 16, name: '木', anchorY: 4.2, collisionRadius: 0.5, bubble: TREE_BUBBLE },
      { kind: 'tree', x: -15, z: -8, name: '木', anchorY: 4.2, collisionRadius: 0.5, bubble: TREE_BUBBLE },
      { kind: 'rock', x: 4, z: 6, size: 0.7, name: '石', anchorY: 1.4, collisionRadius: 0.75, dialogue: ROCK_DIALOGUE },
      { kind: 'rock', x: -6, z: 5, size: 0.5, name: '石', anchorY: 1.1, collisionRadius: 0.55, dialogue: ROCK_DIALOGUE },
      { kind: 'rock', x: 10, z: 2, size: 0.9, name: '石', anchorY: 1.7, collisionRadius: 0.95, dialogue: ROCK_DIALOGUE },
      { kind: 'rock', x: -3, z: -12, size: 0.6, name: '石', anchorY: 1.2, collisionRadius: 0.65, dialogue: ROCK_DIALOGUE },
    ],
    portals: [
      { id: 'day-night', x: 0, z: -6, yaw: 0, targetWorldId: 'night', targetPortalId: 'night-day', frameColor: 0x7df9ff },
      { id: 'day-snow', x: 12, z: 2, yaw: -Math.PI / 2, targetWorldId: 'snow', targetPortalId: 'snow-day', frameColor: 0x9adcff },
      // 室内ワールド型の家の扉(小屋 (10,-13) の +Z 面中央 = z -13 + depth/2)。タップで入室する固い扉
      { id: 'day-grandhall', x: 10, z: -10.5, yaw: 0, targetWorldId: 'grand-hall', targetPortalId: 'grandhall-day', frameColor: 0xffd24d, kind: 'door' },
      // 2階建ての家の扉(小屋 (-16,-2) の +Z 面中央 = z -2 + depth/2)。タップで入室
      { id: 'day-twofloor', x: -16, z: 0.5, yaw: 0, targetWorldId: 'two-floor-house', targetPortalId: 'twofloor-day', frameColor: 0xc69a5b, kind: 'door' },
    ],
    npcs: [
      {
        x: 4, z: -1, name: '案内人', color: 0xe06a3c, wanderRadius: 5,
        bubble: 'こんにちは!',
        dialogue: [
          'やあ、旅人さん。ここは「昼の世界」。いつもおだやかな光に包まれているんだ。',
          '木や石にも近づいてみるといい。何か教えてくれるかもしれないよ。',
          '光る門はポータル。正面の門は「夜の世界」へ、右手の門は「雪の世界」へつながっている。',
        ],
      },
      {
        x: 3, z: -4.8, name: '門番', color: 0x4a8a4a, wanderRadius: 0,
        bubble: '門番だよ',
        dialogue: [
          'わたしはこの門の番人。ずっとここに立っているのさ。',
          '門の向こうは「夜の世界」。行き来は自由だから安心して。',
          '困ったら、そのへんを歩いている案内人に聞くといい。',
        ],
      },
      {
        // 家の中の住人(テレビの方を向いて立つ)
        x: -9.4, z: -12.4, name: '住人', color: 0xc25a8a, wanderRadius: 0, yaw: 0.66,
        bubble: 'テレビはいいぞ',
        dialogue: [
          'いらっしゃい、よく来たね。ここがわたしの家さ。',
          'このテレビ、何年もつけっぱなしなんだ。いい模様だろう?',
          'テーブルは昨日ふいたばかり。窓からの眺めも自慢なんだ。ゆっくりしていって。',
        ],
      },
      {
        // イベント: 話しかけると崖の前まで実際に歩いて案内する(day-guide)
        x: 6, z: 3, name: '案内役', color: 0x3aa0a0, wanderRadius: 0,
        bubble: 'ついておいで(案内)', dialogue: [], eventId: 'day-guide',
      },
      {
        // イベント: 話しかけると岩が動いて道が開く(day-rock)。完了後は通常会話に変わる
        x: -2, z: 9, name: '岩どかし', color: 0x9a7b3a, wanderRadius: 0,
        bubble: '岩をどかすよ', eventId: 'day-rock',
        dialogue: ['岩はもうどかしたよ。', 'もう向こうへ通れるだろう?'],
      },
      {
        // 戦闘: 話しかけて「はい」を選ぶと戦闘イベントが始まる(day-duel)
        x: 3, z: -3, name: '挑戦者', color: 0xb5453a, wanderRadius: 0,
        bubble: '勝負だ!', battleId: 'day-duel',
        dialogue: ['よう、見ない顔だな。', 'おれと一勝負しないか?'],
      },
    ],
    house: { x: -10, z: -13 },
    // 入ると別の室内ワールドへ飛ぶ小屋(ドアは +Z 向き)。大広間と2階建ての家の2棟
    portalHouses: [
      { x: 10, z: -13 }, // 大広間(grand-hall)
      { x: -16, z: -2 }, // 2階建ての家(two-floor-house)
    ],
    cliff: { x: 16, z: 16 },
    // イベントで動かせる岩(day-rock イベントで (1,7) へ動く)
    props: [{ id: 'day-rock', x: -2, z: 7, size: 0.9, collisionRadius: 1.0 }],
  },
  {
    id: 'night',
    terrainAmplitude: 0.7,
    name: '夜の世界',
    objects: [
      { kind: 'crystal', x: -7, z: -3, size: 1.6, color: 0x66ffee, name: 'クリスタル', anchorY: 2.2, collisionRadius: 0.55, bubble: CRYSTAL_BUBBLE, dialogue: CRYSTAL_DIALOGUE },
      { kind: 'crystal', x: 8, z: -5, size: 2.2, color: 0xff66dd, name: 'クリスタル', anchorY: 2.8, collisionRadius: 0.55, bubble: CRYSTAL_BUBBLE, dialogue: CRYSTAL_DIALOGUE },
      { kind: 'crystal', x: -11, z: 7, size: 1.8, color: 0x66aaff, name: 'クリスタル', anchorY: 2.4, collisionRadius: 0.55, bubble: CRYSTAL_BUBBLE, dialogue: CRYSTAL_DIALOGUE },
      { kind: 'crystal', x: 12, z: 10, size: 1.4, color: 0xaaff66, name: 'クリスタル', anchorY: 2.0, collisionRadius: 0.55, bubble: CRYSTAL_BUBBLE, dialogue: CRYSTAL_DIALOGUE },
      { kind: 'crystal', x: -4, z: 13, size: 2.0, color: 0xff9966, name: 'クリスタル', anchorY: 2.6, collisionRadius: 0.55, bubble: CRYSTAL_BUBBLE, dialogue: CRYSTAL_DIALOGUE },
      { kind: 'crystal', x: 5, z: 17, size: 1.7, color: 0x66ffee, name: 'クリスタル', anchorY: 2.3, collisionRadius: 0.55, bubble: CRYSTAL_BUBBLE, dialogue: CRYSTAL_DIALOGUE },
    ],
    portals: [
      { id: 'night-day', x: 0, z: -6, yaw: 0, targetWorldId: 'day', targetPortalId: 'day-night', frameColor: 0xffc04d },
      { id: 'night-ruins', x: -12, z: 2, yaw: Math.PI / 2, targetWorldId: 'ruins', targetPortalId: 'ruins-night', frameColor: 0xffa477 },
    ],
    npcs: [
      {
        x: -4, z: -1, name: '案内人', color: 0x7d5fd3, wanderRadius: 5,
        bubble: 'こんばんは!',
        dialogue: [
          'ようこそ「夜の世界」へ。ここでは星とクリスタルが道を照らしてくれる。',
          'クリスタルに触れてみるといい。ほんのり温かいんだ。',
          '正面の門は「昼の世界」へ。左手の門の先は「黄昏の遺跡」、不思議な場所だよ。',
        ],
      },
      {
        x: 2.8, z: -4.6, name: '星読み', color: 0x35648c, wanderRadius: 0,
        bubble: '星がきれいだ…',
        dialogue: [
          'わたしは星読み。ここから動かず、毎晩星を数えているんだ。',
          'この空の星は四百ほど。ぜんぶ名前をつけたよ。',
          '月のそばに立つと、クリスタルが少し明るくなる…気がする。',
        ],
      },
    ],
    house: { x: -9, z: -13 },
    cliff: { x: 16, z: 16 },
  },
  {
    id: 'snow',
    terrainAmplitude: 1.2,
    name: '雪の世界',
    objects: [
      { kind: 'ice', x: -6, z: -1, size: 2.4, name: '氷柱', anchorY: 2.8, collisionRadius: 0.55, bubble: ICE_BUBBLE, dialogue: ICE_DIALOGUE },
      { kind: 'ice', x: 7, z: -4, size: 3.0, name: '氷柱', anchorY: 3.4, collisionRadius: 0.55, bubble: ICE_BUBBLE, dialogue: ICE_DIALOGUE },
      { kind: 'ice', x: -10, z: 9, size: 2.0, name: '氷柱', anchorY: 2.4, collisionRadius: 0.55, bubble: ICE_BUBBLE, dialogue: ICE_DIALOGUE },
      { kind: 'ice', x: 9, z: 12, size: 2.6, name: '氷柱', anchorY: 3.0, collisionRadius: 0.55, bubble: ICE_BUBBLE, dialogue: ICE_DIALOGUE },
      { kind: 'ice', x: 3, z: 18, size: 2.2, name: '氷柱', anchorY: 2.6, collisionRadius: 0.55, bubble: ICE_BUBBLE, dialogue: ICE_DIALOGUE },
    ],
    portals: [
      { id: 'snow-day', x: 0, z: -6, yaw: 0, targetWorldId: 'day', targetPortalId: 'day-snow', frameColor: 0xffc04d },
    ],
    npcs: [
      {
        x: 4, z: 3, name: '案内人', color: 0x3f7fbf, wanderRadius: 5,
        bubble: 'さむいねえ!',
        dialogue: [
          'ここは「雪の世界」。一年中、静かな雪に覆われているんだ。',
          '氷柱の奥に何かが見える、なんて噂もある。確かめてみるかい?',
          '門をくぐれば「昼の世界」へ戻れるよ。',
        ],
      },
      {
        x: -3, z: -4, name: '旅商人', color: 0x8c5a86, wanderRadius: 0,
        bubble: 'いらっしゃい',
        dialogue: [
          '旅の商人さ。寒くて足が凍りついちまってね、ここから動けないんだ。',
          '売り物?氷柱のかけらだよ。とけないのが自慢…のはずだった。',
          '昼の世界へ帰るなら、あの門をくぐるといい。',
        ],
      },
    ],
    house: { x: 10, z: -12 },
    cliff: { x: 16, z: 16 },
  },
  {
    id: 'ruins',
    terrainAmplitude: 0.5,
    name: '黄昏の遺跡',
    objects: [
      { kind: 'pillar', x: -7, z: -2, size: 3.4, name: '柱', anchorY: 3.8, collisionRadius: 0.65, bubble: PILLAR_BUBBLE, dialogue: PILLAR_DIALOGUE },
      { kind: 'pillar', x: 8, z: -3, size: 2.2, name: '柱', anchorY: 2.6, collisionRadius: 0.65, bubble: PILLAR_BUBBLE, dialogue: PILLAR_DIALOGUE },
      { kind: 'pillar', x: -11, z: 8, size: 3.4, name: '柱', anchorY: 3.8, collisionRadius: 0.65, bubble: PILLAR_BUBBLE, dialogue: PILLAR_DIALOGUE },
      { kind: 'pillar', x: 12, z: 9, size: 1.6, name: '柱', anchorY: 2.0, collisionRadius: 0.65, bubble: PILLAR_BUBBLE, dialogue: PILLAR_DIALOGUE },
      { kind: 'pillar', x: -4, z: 14, size: 2.8, name: '柱', anchorY: 3.2, collisionRadius: 0.65, bubble: PILLAR_BUBBLE, dialogue: PILLAR_DIALOGUE },
      { kind: 'pillar', x: 5, z: 16, size: 3.4, name: '柱', anchorY: 3.8, collisionRadius: 0.65, bubble: PILLAR_BUBBLE, dialogue: PILLAR_DIALOGUE },
    ],
    portals: [
      { id: 'ruins-night', x: 0, z: -6, yaw: 0, targetWorldId: 'night', targetPortalId: 'night-ruins', frameColor: 0x7df9ff },
    ],
    npcs: [
      {
        x: -5, z: 3, name: '案内人', color: 0xb3863e, wanderRadius: 5,
        bubble: 'ようこそ!',
        dialogue: [
          'ここは「黄昏の遺跡」。沈まない夕日が照らす、古い都の跡さ。',
          '柱の文字はもう誰にも読めない。遠い昔の言葉なんだ。',
          '門の先は「夜の世界」。気をつけて行くんだよ。',
        ],
      },
      {
        x: 3, z: -4.4, name: '学者', color: 0x6d6d8a, wanderRadius: 0,
        bubble: 'ふむふむ…',
        dialogue: [
          'わたしは遺跡を調べている学者だ。この場所からが一番よく見える。',
          '柱の配置には規則がある。星の並びと同じなんだよ。',
          'この夕日は何百年も沈んでいない。不思議だろう?',
        ],
      },
    ],
    house: { x: 10, z: -12 },
    cliff: { x: 16, z: 16 },
  },
  {
    // 室内ワールド: 昼の世界の小屋(portalHouse)のドアから飛んでくる広大な大広間。
    // 外の小屋より遥かに広い(TARDIS型)。room 指定により屋外環境は描かない。
    id: 'grand-hall',
    interior: true,
    terrainAmplitude: 0,
    name: '大広間',
    room: { width: 30, depth: 24, height: 6 },
    objects: [
      { kind: 'pillar', x: -8, z: -4, size: 5.2, name: '大柱', anchorY: 5.6, collisionRadius: 0.7, bubble: 'これは大広間の柱です', dialogue: PILLAR_DIALOGUE },
      { kind: 'pillar', x: 8, z: -4, size: 5.2, name: '大柱', anchorY: 5.6, collisionRadius: 0.7, bubble: 'これは大広間の柱です', dialogue: PILLAR_DIALOGUE },
      { kind: 'pillar', x: -8, z: 5, size: 5.2, name: '大柱', anchorY: 5.6, collisionRadius: 0.7, bubble: 'これは大広間の柱です', dialogue: PILLAR_DIALOGUE },
      { kind: 'pillar', x: 8, z: 5, size: 5.2, name: '大柱', anchorY: 5.6, collisionRadius: 0.7, bubble: 'これは大広間の柱です', dialogue: PILLAR_DIALOGUE },
      { kind: 'crystal', x: 0, z: 2, size: 3.0, color: 0xffe08a, name: '中央の結晶', anchorY: 3.4, collisionRadius: 0.6, bubble: 'これは中央の結晶です', dialogue: ['ホールの中央で淡く輝く大きな結晶だ。', '見上げるほど高い天井をほのかに照らしている。'] },
    ],
    portals: [
      // 玄関(戻り)扉。玄関壁(z=-12)の手前に立ち、法線は +Z(室内向き)。タップで昼の世界へ出る
      { id: 'grandhall-day', x: 0, z: -11, yaw: 0, targetWorldId: 'day', targetPortalId: 'day-grandhall', frameColor: 0xffd24d, kind: 'door' },
    ],
    npcs: [
      {
        x: 0, z: 7, name: 'ホールの主', color: 0x8a6db0, wanderRadius: 0, yaw: Math.PI,
        bubble: 'ようこそ大広間へ',
        dialogue: [
          'ようこそ、小さな扉の向こうの「大広間」へ。外から見たより、ずっと広いだろう?',
          'この広間は扉とつながっているだけ。空も地面もない、不思議な部屋さ。',
          '玄関の光る扉をくぐれば、もとの昼の世界へ戻れるよ。',
        ],
      },
    ],
  },
  {
    // 室内ワールド: 2階建ての家。右側の階段でロフト(2階)へ登れる。
    // floorKind='two-floor' で TwoFloorField(階段+ロフトの高さ場)が割り当てられる。
    id: 'two-floor-house',
    interior: true,
    floorKind: 'two-floor',
    terrainAmplitude: 0,
    name: '2階建ての家',
    room: { width: TWO_FLOOR.width, depth: TWO_FLOOR.depth, height: TWO_FLOOR.height },
    objects: [],
    portals: [
      // 玄関(戻り)扉。玄関壁(z=-7)の手前・1階(h=0)に立つ。タップで昼の世界へ出る
      { id: 'twofloor-day', x: 0, z: -6, yaw: 0, targetWorldId: 'day', targetPortalId: 'day-twofloor', frameColor: 0xc69a5b, kind: 'door' },
    ],
    npcs: [
      {
        // 2階(ロフト)に立つ住人。z>=0 なので高さ場で h=floorHeight に乗る
        x: -3, z: 4, name: '2階の住人', color: 0x5a8ac2, wanderRadius: 0, yaw: Math.PI,
        bubble: 'よく上ってきたね',
        dialogue: [
          'いらっしゃい。ここは2階(ロフト)だよ。右の階段で上ってきたんだね。',
          '手すりから1階を見下ろせる。落ちないように気をつけて。',
          '玄関の扉をタップすれば、昼の世界へ戻れるよ。',
        ],
      },
    ],
  },
];

/**
 * イベント定義レジストリ。NpcSpec.eventId から参照する。
 * walkTo は主人公の自動歩行、moveProp は可動プロップ(World.props)の移動。
 */
export const EVENTS: Record<string, GameEvent> = {
  // 案内役: タップすると先導して崖の前まで歩き(主人公は追従)、案内後は元の位置へ戻る。
  // フラグ 'guided' で初回と2回目以降の台詞を変える(条件分岐のデモ)
  'day-guide': {
    id: 'day-guide',
    steps: [
      {
        kind: 'say', text: 'ついておいで。いい場所へ案内するよ。', duration: 2.5,
        when: { kind: 'not', cond: { kind: 'flag', flag: 'guided' } },
      },
      {
        kind: 'say', text: 'また案内しよう。ついておいで。', duration: 2.5,
        when: { kind: 'flag', flag: 'guided' },
      },
      { kind: 'escort', x: 12, z: 12 },
      { kind: 'say', text: 'ここが崖だ。登ってみるといい。私は戻るよ。', duration: 3 },
      { kind: 'actorHome' },
      { kind: 'setFlag', flag: 'guided' },
    ],
  },
  // 岩どかし: タップすると岩が動いて道が開く(一度きり。以後は通常会話に変わる)
  'day-rock': {
    id: 'day-rock',
    once: true,
    steps: [
      { kind: 'say', text: 'この岩、どかしてあげよう。', duration: 2 },
      { kind: 'moveProp', propId: 'day-rock', toX: 1, toZ: 7, duration: 2.5 },
      { kind: 'say', text: 'さあ、通れるようになったよ。', duration: 2.5 },
    ],
  },
};

/**
 * 戦闘定義レジストリ。NpcSpec.battleId から参照する。
 * 戦闘は副作用ゼロのオーバーレイ(進行状況・フラグは不変)。
 */
export const BATTLES: Record<string, BattleDefinition> = {
  'day-duel': {
    id: 'day-duel',
    opponent: {
      name: '挑戦者',
      color: 0xb5453a,
      comment: '今日のおれは止まらないぜ!',
      terrainName: '昼の草原',
      winComment: 'やるな…完敗だ。また勝負しよう!',
      loseComment: 'ふっ、まだまだ修行が足りないな。',
      techniques: TECH_DUELIST,
    },
    // 選べる9体(メイン+サポート)。技トリオ(速攻/剛力/遠隔)を循環で割り当て個性を出す
    roster: [
      { id: 'c1', name: 'アカ', color: 0xe2524a, techniques: TECH_SWIFT },
      { id: 'c2', name: 'ミドリ', color: 0x4caf6a, techniques: TECH_POWER },
      { id: 'c3', name: 'アオ', color: 0x4a86e2, techniques: TECH_RANGED },
      { id: 'c4', name: 'キイ', color: 0xe2c84a, techniques: TECH_SWIFT },
      { id: 'c5', name: 'モモ', color: 0xe27ab5, techniques: TECH_POWER },
      { id: 'c6', name: 'ソラ', color: 0x4ac8e2, techniques: TECH_RANGED },
      { id: 'c7', name: 'ムラサキ', color: 0x9a5fd3, techniques: TECH_SWIFT },
      { id: 'c8', name: 'ダイダイ', color: 0xe2954a, techniques: TECH_POWER },
      { id: 'c9', name: 'クロ', color: 0x444a5a, techniques: TECH_RANGED },
    ],
  },
};

/** ポータルの吹き出しのアンカー高さ */
export const PORTAL_BUBBLE_ANCHOR_Y = 3.6;

export const BUBBLE_RANGE = 5;
/** タップで会話を開ける距離 [m](旧3.5の1.5倍) */
export const INTERACT_RANGE = 5.25;
/** 会話中にこれ以上離れるとウィンドウが自動で閉じる距離 [m] */
export const DIALOGUE_BREAK_RANGE = 6.5;
/** 「前方」とみなすコーンの内積しきい値(cos60° → 前方±60°のみ話しかけ可能) */
export const INTERACT_FRONT_DOT = Math.cos(Math.PI / 3);

/** ポータル枠の柱の衝突半径 [m](面はコライダーなしで通過可能) */
export const PORTAL_PILLAR_RADIUS = 0.25;

export const PORTAL_HALF_WIDTH = 1.4;
export const PORTAL_HEIGHT = 3;
