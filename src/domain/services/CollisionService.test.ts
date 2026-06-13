import { describe, expect, it } from 'vitest';
import { Player } from '../entities/Player';
import { Vec3 } from '../values/Vec3';
import { CollisionService } from './CollisionService';

const newPlayer = (pos: Vec3, vel = Vec3.ZERO): Player => new Player(pos, vel, 0, 0);

describe('CollisionService', () => {
  const service = new CollisionService(0.35);
  const rock = { position: new Vec3(0, 0, 0), radius: 0.5 };

  it('めり込んだら法線方向に押し出される', () => {
    const player = newPlayer(new Vec3(0.5, 0, 0));
    service.resolve(player, [rock]);
    expect(player.position.x).toBeCloseTo(0.85); // 0.5 + 0.35
    expect(player.position.z).toBeCloseTo(0);
  });

  it('障害物へ向かう速度成分だけ打ち消され、接線成分は残る(壁ずり)', () => {
    const player = newPlayer(new Vec3(0.8, 0, 0), new Vec3(-1, 0, 1));
    service.resolve(player, [rock]);
    expect(player.velocity.x).toBeCloseTo(0); // 法線(-X向き)成分は消える
    expect(player.velocity.z).toBeCloseTo(1); // 接線成分は保存
  });

  it('離れていれば何も起きない', () => {
    const player = newPlayer(new Vec3(2, 0, 0), new Vec3(-1, 0, 0));
    service.resolve(player, [rock]);
    expect(player.position.x).toBeCloseTo(2);
    expect(player.velocity.x).toBeCloseTo(-1);
  });

  it('中心が一致しても押し出せる(+X方向へ退避)', () => {
    const player = newPlayer(new Vec3(0, 0, 0));
    service.resolve(player, [rock]);
    expect(player.position.x).toBeCloseTo(0.85);
  });

  it('複数コライダーの間でもめり込みが解消される', () => {
    const a = { position: new Vec3(0, 0, 0), radius: 0.5 };
    const b = { position: new Vec3(1.2, 0, 0), radius: 0.5 };
    const player = newPlayer(new Vec3(0.6, 0, 0.1));
    service.resolve(player, [a, b]);
    const da = Math.hypot(player.position.x - 0, player.position.z - 0);
    const db = Math.hypot(player.position.x - 1.2, player.position.z - 0);
    expect(da).toBeGreaterThanOrEqual(0.85 - 1e-6);
    expect(db).toBeGreaterThanOrEqual(0.85 - 1e-6);
  });
});
