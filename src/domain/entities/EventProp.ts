import { Collider } from '../values/Collider';
import { Vec3 } from '../values/Vec3';

/**
 * イベントで動かせるオブジェクト(岩など)。位置は可変で、コライダーは現在位置から導出する。
 * `moveProp` で position を動かすと当たり判定も追従するため、元の場所が通れるようになる。
 */
export class EventProp {
  constructor(
    public readonly id: string,
    /** 足元位置(XZ。y は地形に追従させるため 0 基準) */
    public position: Vec3,
    /** 衝突半径 [m] */
    public readonly radius: number,
    /** 見た目の大きさ [m](描画用) */
    public readonly size: number,
  ) {}

  /** 現在位置の円柱コライダー */
  get collider(): Collider {
    return { position: new Vec3(this.position.x, 0, this.position.z), radius: this.radius };
  }
}
