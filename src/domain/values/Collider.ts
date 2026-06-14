import { Vec3 } from './Vec3';

/**
 * XZ平面の円柱として扱う衝突体。
 * yMin/yMax を指定すると、その高さ範囲にいるプレイヤーにのみ作用する(多層床用)。
 * 省略時は無限高さ(全ての高さに作用 = 壁など)。
 */
export interface Collider {
  readonly position: Vec3;
  readonly radius: number;
  /** 作用する高さの下限 [m](省略時 -∞) */
  readonly yMin?: number;
  /** 作用する高さの上限 [m](省略時 +∞) */
  readonly yMax?: number;
}
