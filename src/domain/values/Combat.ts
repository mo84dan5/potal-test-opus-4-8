/**
 * アクション戦闘のデータ定義(直列化可能な純粋値)。three.js/DOM 非依存。
 * 実時間シミュレーションは CombatService が担い、ここは「形」と定数だけを持つ。
 */

/** 技1つの性能。窶用(windup)で予備動作を見せ、終端で命中判定する(その瞬間にダッシュ無敵だと回避) */
export interface Technique {
  readonly name: string;
  /** 命中する最大距離 [m] */
  readonly range: number;
  /** 命中時のダメージ */
  readonly damage: number;
  /** 発生までの予備動作時間 [s](相手に見せる=回避の猶予) */
  readonly windup: number;
  /** 発生後の硬直時間 [s] */
  readonly recovery: number;
}

/** 戦うキャラクター(3種の技を持つ)。表示色はアバター代わり */
export interface CombatFighter {
  readonly name: string;
  readonly color: number;
  /** 3種類の技。index 0=上 / 1=右 / 2=左 のフリックに対応 */
  readonly techniques: readonly [Technique, Technique, Technique];
}

/** フリック入力で起こす行動。0/1/2 は技スロット(上/右/左)、'dash' は離脱ダッシュ(下) */
export type CombatAction = 0 | 1 | 2 | 'dash';

/** 1フレーム分の入力(移動は連続値、行動は単発) */
export interface CombatInput {
  /** 左右移動(右が正、-1..1) */
  readonly strafe: number;
  /** 前後移動(相手へ近づく方向が正、-1..1) */
  readonly forward: number;
  /** この瞬間に発火した行動(なければ null) */
  readonly action: CombatAction | null;
}

/** 何もしない入力(敵AIの待機やテスト用) */
export const IDLE_INPUT: CombatInput = { strafe: 0, forward: 0, action: null };

// --- 戦闘パラメータ ---
/** 戦闘開始時のHP */
export const COMBAT_MAX_HP = 120;
/** サポート編成時にメインへ加算されるHPボーナス */
export const SUPPORT_HP_BONUS = 30;
/** 通常移動の速度 [m/s](3人称移動と同等) */
export const MOVE_SPEED = 3.2;
/** ダッシュ速度 [m/s] */
export const DASH_SPEED = 8.5;
/** ダッシュの継続時間 [s](この間は無敵=ジャスト回避の受付窓) */
export const DASH_TIME = 0.26;
/** アリーナ(円形フィールド)の半径 [m] */
export const ARENA_RADIUS = 6;
/** 2者がこれ以上重ならないようにする最小間隔 [m] */
export const ACTOR_MIN_GAP = 1.0;

/**
 * 技トリオのプリセット。各キャラへ循環で割り当てて個性を出す(OCP: 追加で増やせる)。
 * index 0=上 / 1=右 / 2=左。
 */
export const TECH_SWIFT: readonly [Technique, Technique, Technique] = [
  { name: '突き', range: 2.0, damage: 8, windup: 0.3, recovery: 0.3 },
  { name: '蹴り', range: 1.8, damage: 12, windup: 0.45, recovery: 0.45 },
  { name: '連撃', range: 2.2, damage: 10, windup: 0.4, recovery: 0.5 },
];
export const TECH_POWER: readonly [Technique, Technique, Technique] = [
  { name: '振り下ろし', range: 1.8, damage: 22, windup: 0.7, recovery: 0.8 },
  { name: '横薙ぎ', range: 2.4, damage: 18, windup: 0.6, recovery: 0.7 },
  { name: 'タックル', range: 2.0, damage: 14, windup: 0.5, recovery: 0.6 },
];
export const TECH_RANGED: readonly [Technique, Technique, Technique] = [
  { name: '気弾', range: 4.5, damage: 10, windup: 0.55, recovery: 0.5 },
  { name: '貫き', range: 3.5, damage: 14, windup: 0.6, recovery: 0.6 },
  { name: '波動', range: 5.0, damage: 9, windup: 0.7, recovery: 0.7 },
];

/** プリセットの循環順(キャラ割り当て用) */
export const TECH_PRESETS: readonly (readonly [Technique, Technique, Technique])[] = [
  TECH_SWIFT,
  TECH_POWER,
  TECH_RANGED,
];
