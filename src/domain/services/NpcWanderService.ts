import { Npc } from '../entities/Npc';
import { Collider } from '../values/Collider';
import { FLAT_TERRAIN, HeightField } from '../values/Terrain';

const WALK_SPEED = 1.1; // [m/s]
const ARRIVE_DISTANCE = 0.25; // [m] 目的地到達とみなす距離
const MIN_PAUSE = 1.0; // [s]
const MAX_PAUSE = 3.5; // [s]

/** NPCの徘徊(目的地へ歩く→立ち止まる→次の目的地)を更新するドメインサービス */
export class NpcWanderService {
  tick(
    npc: Npc,
    dt: number,
    colliders: readonly Collider[],
    terrain: HeightField = FLAT_TERRAIN,
  ): void {
    if (dt <= 0) return;
    if (npc.wanderRadius <= 0) return; // 静止NPC(その場に立っている)

    if (npc.pauseTimer > 0) {
      npc.pauseTimer = Math.max(0, npc.pauseTimer - dt);
      return;
    }

    const feet = npc.feet;
    const dx = npc.targetX - feet.x;
    const dz = npc.targetZ - feet.z;
    const dist = Math.hypot(dx, dz);

    if (dist < ARRIVE_DISTANCE) {
      // 到着: しばらく立ち止まり、徘徊円内の次の目的地を選ぶ
      npc.pauseTimer = MIN_PAUSE + npc.rand() * (MAX_PAUSE - MIN_PAUSE);
      const angle = npc.rand() * Math.PI * 2;
      const r = Math.sqrt(npc.rand()) * npc.wanderRadius;
      npc.targetX = npc.wanderCenter.x + Math.cos(angle) * r;
      npc.targetZ = npc.wanderCenter.z + Math.sin(angle) * r;
      return;
    }

    const step = Math.min(dist, WALK_SPEED * dt);
    let nx = feet.x + (dx / dist) * step;
    let nz = feet.z + (dz / dist) * step;

    // 障害物からの押し出し(自分自身のコライダーは除く)
    for (const c of colliders) {
      if (c === npc.collider) continue;
      const ox = nx - c.position.x;
      const oz = nz - c.position.z;
      const d = Math.hypot(ox, oz);
      const minDist = c.radius + npc.collider.radius;
      if (d >= minDist) continue;
      const px = d > 1e-6 ? ox / d : 1;
      const pz = d > 1e-6 ? oz / d : 0;
      nx = c.position.x + px * minDist;
      nz = c.position.z + pz * minDist;
    }

    // 行動範囲のハード制限: 押し出し等で徘徊円の外に出されても境界へ引き戻す
    const cx = nx - npc.wanderCenter.x;
    const cz = nz - npc.wanderCenter.z;
    const fromCenter = Math.hypot(cx, cz);
    if (fromCenter > npc.wanderRadius) {
      const k = npc.wanderRadius / fromCenter;
      nx = npc.wanderCenter.x + cx * k;
      nz = npc.wanderCenter.z + cz * k;
    }

    // 進行方向を向く(forward = (-sin yaw, -cos yaw) の規約)
    npc.yaw = Math.atan2(-(dx / dist), -(dz / dist));
    npc.moveTo(nx, nz, terrain.heightAt(nx, nz)); // 地形に沿って歩く
  }
}
