/**
 * ワールドのオブジェクト配置・ポータル接続・文言の共有定義。
 * 描画(ThreeRendererAdapter)とドメイン構築(main.ts)の双方がここを参照することで
 * 座標・接続のズレを防ぐ。
 *
 * ワールド接続グラフ:
 *   雪の世界 ⇄ 昼の世界 ⇄ 夜の世界 ⇄ 黄昏の遺跡
 */
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
}

/** 家のワールド内位置(ドアは +Z 向き) */
export interface HouseSpec {
  x: number;
  z: number;
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

export interface WorldDef {
  id: string;
  name: string;
  objects: WorldObjectSpec[];
  portals: PortalSpec[];
  npcs: NpcSpec[];
  /** 家(入れる建物)。ドアは +Z 向き */
  house?: HouseSpec;
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
    ],
    house: { x: -10, z: -13 },
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
  },
];

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
