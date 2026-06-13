import { Vec3 } from './Vec3';

/** XZ平面の円(無限高さの円柱)として扱う衝突体 */
export interface Collider {
  readonly position: Vec3;
  readonly radius: number;
}
