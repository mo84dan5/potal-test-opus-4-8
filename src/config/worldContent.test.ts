import { describe, expect, it } from 'vitest';
import {
  HOUSE,
  HOUSE_WALL_COLLIDER_RADIUS,
  houseWallColliderSpots,
  PORTAL_HALF_WIDTH,
  PORTAL_HOUSE,
  portalHouseWallColliderSpots,
  ROOM_WALL_COLLIDER_RADIUS,
  roomWallColliderSpots,
  WORLD_DEFS,
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

describe('WORLD_DEFS のポータル整合性', () => {
  const byId = new Map(WORLD_DEFS.map((d) => [d.id, d]));

  it('すべてのポータルは実在するワールド・ポータルへ接続し、相互に対をなす', () => {
    for (const def of WORLD_DEFS) {
      for (const p of def.portals) {
        const target = byId.get(p.targetWorldId);
        expect(target, `${p.id} の接続先ワールド ${p.targetWorldId}`).toBeDefined();
        const back = target!.portals.find((q) => q.id === p.targetPortalId);
        expect(back, `${p.id} の接続先ポータル ${p.targetPortalId}`).toBeDefined();
        // 戻り側はこのポータルへ返ってくる(双方向の対)
        expect(back!.targetWorldId).toBe(def.id);
        expect(back!.targetPortalId).toBe(p.id);
      }
    }
  });

  it('ポータルIDは全ワールドで一意', () => {
    const ids = WORLD_DEFS.flatMap((d) => d.portals.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('室内ワールド「大広間」が存在し、完全平坦・部屋寸法を持つ', () => {
    const hall = byId.get('grand-hall');
    expect(hall).toBeDefined();
    expect(hall!.interior).toBe(true);
    expect(hall!.terrainAmplitude).toBe(0);
    expect(hall!.room).toBeDefined();
    // 室内は外の小屋より広い(TARDIS型)
    expect(hall!.room!.width).toBeGreaterThan(PORTAL_HOUSE.width);
    expect(hall!.room!.depth).toBeGreaterThan(PORTAL_HOUSE.depth);
  });

  it('夜・雪・遺跡の各シーンに家が配置されている', () => {
    for (const id of ['night', 'snow', 'ruins']) {
      expect(byId.get(id)!.house, `${id} の家`).toBeDefined();
    }
  });

  it('portalHouse のドア位置(+Z面中央)にポータルが立っている', () => {
    for (const def of WORLD_DEFS) {
      if (!def.portalHouse) continue;
      const doorX = def.portalHouse.x;
      const doorZ = def.portalHouse.z + PORTAL_HOUSE.depth / 2;
      const door = def.portals.find(
        (p) => Math.abs(p.x - doorX) < 1e-6 && Math.abs(p.z - doorZ) < 1e-6,
      );
      expect(door, `${def.id} のドアポータル`).toBeDefined();
    }
  });
});

describe('portalHouseWallColliderSpots(室内型の家の外観壁)', () => {
  const HX = 10;
  const HZ = -13;
  const spots = portalHouseWallColliderSpots(HX, HZ);
  const w = PORTAL_HOUSE.width / 2;
  const d = PORTAL_HOUSE.depth / 2;

  it('すべての円が小屋の外周に載っている', () => {
    for (const s of spots) {
      const lx = s.x - HX;
      const lz = s.z - HZ;
      const onFrontBack = Math.abs(Math.abs(lz) - d) < 1e-6 && Math.abs(lx) <= w + 1e-6;
      const onSides = Math.abs(Math.abs(lx) - w) < 1e-6 && Math.abs(lz) <= d + 1e-6;
      expect(onFrontBack || onSides).toBe(true);
    }
  });

  it('+Z面のドア開口にはコライダーがなく、両脇には壁がある', () => {
    const front = spots.filter((s) => Math.abs(s.z - (HZ + d)) < 1e-6);
    for (const s of front) {
      expect(Math.abs(s.x - HX)).toBeGreaterThan(PORTAL_HOUSE.doorWidth / 2 + 0.2 - 1e-6);
    }
    expect(front.some((s) => s.x < HX)).toBe(true);
    expect(front.some((s) => s.x > HX)).toBe(true);
  });

  it('ドア開口はポータル全幅(2×halfWidth)以上で、面が枠に潰されない', () => {
    expect(PORTAL_HOUSE.doorWidth).toBeGreaterThanOrEqual(PORTAL_HALF_WIDTH * 2);
  });
});

describe('roomWallColliderSpots(室内ワールドの壁)', () => {
  const room = { width: 30, depth: 24, height: 6 };
  const doorX = 0;
  const doorWidth = PORTAL_HALF_WIDTH * 2 + 0.6;
  const spots = roomWallColliderSpots(room, doorX, doorWidth);
  const w = room.width / 2;
  const d = room.depth / 2;

  it('すべての円が部屋の外周に載っている', () => {
    for (const s of spots) {
      const onFrontBack = Math.abs(Math.abs(s.z) - d) < 1e-6 && Math.abs(s.x) <= w + 1e-6;
      const onSides = Math.abs(Math.abs(s.x) - w) < 1e-6 && Math.abs(s.z) <= d + 1e-6;
      expect(onFrontBack || onSides).toBe(true);
    }
  });

  it('玄関壁(-Z)のドア開口にはコライダーがなく、ポータルへ通れる', () => {
    const entrance = spots.filter((s) => Math.abs(s.z - -d) < 1e-6);
    for (const s of entrance) {
      expect(Math.abs(s.x - doorX)).toBeGreaterThan(doorWidth / 2 + 0.3 - 1e-6);
    }
    // 開口幅はポータル全幅より広い
    expect(doorWidth).toBeGreaterThan(PORTAL_HALF_WIDTH * 2);
  });

  it('壁の円は隣と十分近く、プレイヤー(半径0.35)がすり抜けられない', () => {
    const sideX = spots
      .filter((s) => Math.abs(s.x - w) < 1e-6)
      .map((s) => s.z)
      .sort((a, b) => a - b);
    for (let i = 1; i < sideX.length; i++) {
      expect(sideX[i] - sideX[i - 1]).toBeLessThanOrEqual(
        2 * (ROOM_WALL_COLLIDER_RADIUS + 0.35),
      );
    }
  });
});
