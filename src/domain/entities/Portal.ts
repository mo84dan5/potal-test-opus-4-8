import { Vec3 } from '../values/Vec3';

/**
 * ポータル。ワールド内に立つ垂直な長方形の面。
 * yaw=0 のとき面は XY 平面に平行で、法線は +Z を向く。
 * ポータルは id で識別され、接続先ワールドの特定ポータル(targetPortalId)と対をなす。
 * 1つのワールドに複数のポータルを置ける。
 */
export class Portal {
  constructor(
    /** このポータルの識別子(全ワールドで一意) */
    public readonly id: string,
    /** ポータル面の中心の足元座標(y=0) */
    public readonly position: Vec3,
    /** 面の向き(Y軸まわりの回転、ラジアン) */
    public readonly yaw: number,
    public readonly halfWidth: number,
    public readonly height: number,
    /** 接続先ワールドのID */
    public readonly targetWorldId: string,
    /** 接続先ワールド内の対になるポータルのID */
    public readonly targetPortalId: string,
  ) {}

  /** 面の法線(水平) */
  get normal(): Vec3 {
    return new Vec3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** 面に沿った水平接線方向 */
  get tangent(): Vec3 {
    return new Vec3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** 点の面からの符号付き距離(法線方向が正) */
  signedDistance(p: Vec3): number {
    return p.sub(this.position).dot(this.normal);
  }

  /** 点の面に沿った接線方向オフセット */
  tangentOffset(p: Vec3): number {
    return p.sub(this.position).dot(this.tangent);
  }
}
