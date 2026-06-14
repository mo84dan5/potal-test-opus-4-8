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

/**
 * 3人称カメラの遮蔽回避: 注視点からカメラ希望位置へ向けたレイの最初の交差距離 hitDistance を受け、
 * 実際のカメラ距離を返す。遮蔽が無い(null)か希望距離より遠いなら希望距離のまま。
 * 遮蔽があれば交差手前(hitDistance - margin)へ寄せ、近すぎないよう minDist で下限を設ける。
 */
export function occludedCameraDistance(
  desiredDistance: number,
  hitDistance: number | null,
  margin = 0.3,
  minDist = 0.6,
): number {
  if (hitDistance === null || hitDistance >= desiredDistance) return desiredDistance;
  return Math.max(minDist, hitDistance - margin);
}
