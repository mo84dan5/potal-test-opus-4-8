import { Player } from '../entities/Player';
import { Collider } from '../values/Collider';
import { Vec3 } from '../values/Vec3';

/** プレイヤーの衝突半径 [m] */
export const PLAYER_RADIUS = 0.35;
/** プレイヤーの背丈 [m](高さ制限コライダーとの重なり判定に使う) */
export const PLAYER_HEIGHT = 1.7;

/**
 * 円柱コライダーとの衝突を解決するドメインサービス。
 * めり込みを法線方向へ押し出し、障害物へ向かう速度成分を打ち消して壁ずりさせる。
 * 高さ制限(yMin/yMax)を持つコライダーは、プレイヤーの足元〜頭がその範囲に重なる時だけ作用する。
 */
export class CollisionService {
  constructor(private readonly playerRadius = PLAYER_RADIUS) {}

  resolve(player: Player, colliders: readonly Collider[]): void {
    // 複数コライダーの押し出しが干渉する角などのため数回反復する
    for (let iteration = 0; iteration < 3; iteration++) {
      let pushed = false;
      const feet = player.position.y;
      const head = feet + PLAYER_HEIGHT;
      for (const c of colliders) {
        // 高さ制限コライダー: プレイヤーの背丈と高さ範囲が重ならなければ作用しない
        if (c.yMax !== undefined && feet > c.yMax) continue;
        if (c.yMin !== undefined && head < c.yMin) continue;

        const dx = player.position.x - c.position.x;
        const dz = player.position.z - c.position.z;
        const dist = Math.hypot(dx, dz);
        const minDist = c.radius + this.playerRadius;
        if (dist >= minDist) continue;

        // 中心が一致した場合は +X 方向へ逃がす
        const nx = dist > 1e-6 ? dx / dist : 1;
        const nz = dist > 1e-6 ? dz / dist : 0;
        const push = minDist - dist;
        // y(地形の高さ)は保持する。押し出し後の再スナップは呼び出し側が行う
        player.position = new Vec3(
          player.position.x + nx * push,
          player.position.y,
          player.position.z + nz * push,
        );

        // 障害物へ向かう速度成分(法線の負方向)のみ打ち消す → 壁ずり
        const into = player.velocity.x * nx + player.velocity.z * nz;
        if (into < 0) {
          player.velocity = new Vec3(
            player.velocity.x - nx * into,
            player.velocity.y,
            player.velocity.z - nz * into,
          );
        }
        pushed = true;
      }
      if (!pushed) break;
    }
  }
}
