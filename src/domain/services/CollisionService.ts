import { Player } from '../entities/Player';
import { Collider } from '../values/Collider';
import { Vec3 } from '../values/Vec3';

/** プレイヤーの衝突半径 [m] */
export const PLAYER_RADIUS = 0.35;

/**
 * 円柱コライダーとの衝突を解決するドメインサービス。
 * めり込みを法線方向へ押し出し、障害物へ向かう速度成分を打ち消して壁ずりさせる。
 */
export class CollisionService {
  constructor(private readonly playerRadius = PLAYER_RADIUS) {}

  resolve(player: Player, colliders: readonly Collider[]): void {
    // 複数コライダーの押し出しが干渉する角などのため数回反復する
    for (let iteration = 0; iteration < 3; iteration++) {
      let pushed = false;
      for (const c of colliders) {
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
