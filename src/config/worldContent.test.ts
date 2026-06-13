import { describe, expect, it } from 'vitest';
import {
  HOUSE,
  HOUSE_WALL_COLLIDER_RADIUS,
  houseWallColliderSpots,
} from './worldContent';

const HX = -10;
const HZ = -13;

describe('houseWallColliderSpots(家の壁コライダー)', () => {
  const spots = houseWallColliderSpots(HX, HZ);
  const w = HOUSE.width / 2;
  const d = HOUSE.depth / 2;

  it('すべての円が家の外周(4辺のいずれか)に載っている', () => {
    for (const s of spots) {
      const lx = s.x - HX;
      const lz = s.z - HZ;
      const onFrontBack = Math.abs(Math.abs(lz) - d) < 1e-6 && Math.abs(lx) <= w + 1e-6;
      const onSides = Math.abs(Math.abs(lx) - w) < 1e-6 && Math.abs(lz) <= d + 1e-6;
      expect(onFrontBack || onSides).toBe(true);
    }
  });

  it('前面(+Z)のドア開口にはコライダーがない(通って入れる)', () => {
    const front = spots.filter((s) => Math.abs(s.z - (HZ + d)) < 1e-6);
    for (const s of front) {
      // ドア中心±(半幅+0.2) には円の中心を置かない
      expect(Math.abs(s.x - HX)).toBeGreaterThan(HOUSE.doorWidth / 2 + 0.2 - 1e-6);
    }
    // ドアの左右どちらにも壁がある
    expect(front.some((s) => s.x < HX)).toBe(true);
    expect(front.some((s) => s.x > HX)).toBe(true);
  });

  it('壁の円は隣と十分近く、プレイヤー(半径0.35)がすり抜けられない', () => {
    // 背面の隣接間隔 ≤ 2×(壁円半径+プレイヤー半径) を満たす
    const back = spots
      .filter((s) => Math.abs(s.z - (HZ - d)) < 1e-6)
      .map((s) => s.x)
      .sort((a, b) => a - b);
    for (let i = 1; i < back.length; i++) {
      expect(back[i] - back[i - 1]).toBeLessThanOrEqual(
        2 * (HOUSE_WALL_COLLIDER_RADIUS + 0.35),
      );
    }
    // 背面は端から端まで覆われている
    expect(back[0]).toBeLessThanOrEqual(HX - w + 1e-6);
    expect(back[back.length - 1]).toBeGreaterThanOrEqual(HX + w - 0.51);
  });
});
