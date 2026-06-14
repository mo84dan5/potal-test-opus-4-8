import { Vec3 } from '../../domain/values/Vec3';

export interface ThirdPersonCamera {
  /** カメラのワールド座標 */
  position: Vec3;
  /** カメラの注視点(プレイヤーの頭あたり) */
  target: Vec3;
}

/**
 * 3人称カメラの位置と注視点を求める純粋関数。
 * 視線方向(yaw/pitch)の逆方向へ distance だけ離れた後方に置き、プレイヤーの頭(feet + headHeight)を見る。
 * カメラが地面へ潜らないよう、足元 + minClearance を下限にクランプする。
 */
export function computeThirdPersonCamera(
  feet: Vec3,
  yaw: number,
  pitch: number,
  distance: number,
  headHeight: number,
  minClearance = 0.5,
): ThirdPersonCamera {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // 視線方向(前方)。yaw=0,pitch=0 で -Z(Player.forward と一致)
  const dir = new Vec3(-cp * Math.sin(yaw), sp, -cp * Math.cos(yaw));
  const target = new Vec3(feet.x, feet.y + headHeight, feet.z);
  const raw = target.sub(dir.scale(distance)); // 後方へ distance
  const y = Math.max(raw.y, feet.y + minClearance); // 地面下へ潜らない
  return { position: new Vec3(raw.x, y, raw.z), target };
}
