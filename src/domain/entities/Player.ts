import { Vec3 } from '../values/Vec3';

/** プレイヤー。位置は足元(y=0)、視点はヨー・ピッチで表す */
export class Player {
  /** 仮想パッド押下中の目標速度。null なら入力なし(慣性減衰に任せる) */
  public desiredVelocity: Vec3 | null = null;

  constructor(
    public position: Vec3,
    public velocity: Vec3,
    public yaw: number,
    public pitch: number,
  ) {}

  static readonly EYE_HEIGHT = 1.6;

  /** 視点のワールド座標(足元 + 目線高さ) */
  get eyePosition(): Vec3 {
    return this.position.withY(this.position.y + Player.EYE_HEIGHT);
  }

  /** カメラが向いている水平前方向(yaw=0 で -Z 方向 = three.js のカメラ既定と一致) */
  get forward(): Vec3 {
    return new Vec3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** カメラの右方向 */
  get right(): Vec3 {
    return new Vec3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}
