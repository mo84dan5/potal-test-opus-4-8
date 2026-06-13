import { describe, expect, it } from 'vitest';
import { Npc } from '../entities/Npc';
import { Vec3 } from '../values/Vec3';
import { NpcWanderService } from './NpcWanderService';

const buildNpc = (): Npc =>
  new Npc(
    'npc', '案内人',
    new Vec3(0, 0, 0), 2.0,
    'こんにちは!', ['ここは昼の世界。'],
    new Vec3(0, 0, 0), 5, 42,
  );

const service = new NpcWanderService();

describe('NpcWanderService', () => {
  it('目的地へ向かって歩き、進行方向を向く', () => {
    const npc = buildNpc();
    npc.targetX = 5;
    npc.targetZ = 0;
    service.tick(npc, 1, []);
    expect(npc.feet.x).toBeCloseTo(1.1); // 1.1 m/s
    expect(npc.feet.z).toBeCloseTo(0);
    // +X へ歩く → forward(yaw)=(+1,0) となる yaw=-π/2
    expect(npc.yaw).toBeCloseTo(-Math.PI / 2);
  });

  it('目的地に着くと立ち止まり、徘徊円内の次の目的地を選ぶ', () => {
    const npc = buildNpc();
    npc.targetX = 0.1;
    npc.targetZ = 0;
    service.tick(npc, 0.016, []);
    expect(npc.pauseTimer).toBeGreaterThan(0);
    const dist = Math.hypot(npc.targetX, npc.targetZ);
    expect(dist).toBeLessThanOrEqual(5);
  });

  it('立ち止まり中は動かない', () => {
    const npc = buildNpc();
    npc.pauseTimer = 2;
    npc.targetX = 5;
    service.tick(npc, 0.5, []);
    expect(npc.feet.x).toBeCloseTo(0);
    expect(npc.pauseTimer).toBeCloseTo(1.5);
  });

  it('障害物にめり込まない(押し出し)', () => {
    const npc = buildNpc();
    npc.targetX = 2;
    npc.targetZ = 0;
    const rock = { position: new Vec3(1, 0, 0), radius: 0.5 };
    service.tick(npc, 0.5, [rock]); // 押し出しがなければ x=0.55(岩に重なる)
    const d = Math.hypot(npc.feet.x - 1, npc.feet.z);
    expect(d).toBeGreaterThanOrEqual(0.95 - 1e-6); // 0.5 + NPC半径0.45
  });

  it('自分自身のコライダーには反応しない', () => {
    const npc = buildNpc();
    npc.targetX = 2;
    npc.targetZ = 0;
    service.tick(npc, 0.5, [npc.collider]);
    expect(npc.feet.x).toBeCloseTo(0.55); // 押し出されず普通に歩く
  });

  it('wanderRadius=0 の静止NPCは動かない', () => {
    const npc = new Npc(
      'guard', '門番',
      new Vec3(3, 0, -4.8), 2.0,
      '門番だよ', ['わたしは番人。'],
      new Vec3(3, 0, -4.8), 0, 7,
    );
    npc.yaw = 1.2;
    for (let i = 0; i < 100; i++) service.tick(npc, 0.1, []);
    expect(npc.feet.x).toBeCloseTo(3);
    expect(npc.feet.z).toBeCloseTo(-4.8);
    expect(npc.yaw).toBeCloseTo(1.2); // 向きも変わらない
  });

  it('長時間歩いても徘徊円の外には一切出ない(コライダー追従も確認)', () => {
    const npc = buildNpc();
    for (let i = 0; i < 3000; i++) {
      service.tick(npc, 0.1, []);
      const d = Math.hypot(npc.feet.x, npc.feet.z);
      expect(d).toBeLessThanOrEqual(5 + 1e-6); // 毎フレーム、半径5の円内を保証
    }
    expect(npc.collider.position.x).toBeCloseTo(npc.feet.x);
    expect(npc.collider.position.z).toBeCloseTo(npc.feet.z);
  });

  it('地形を渡すと足元と吹き出しアンカーが地形の高さに追従する', () => {
    const npc = buildNpc();
    npc.targetX = 5;
    npc.targetZ = 0;
    const terrain = { heightAt: (x: number) => 0.2 * x };
    service.tick(npc, 1, [], terrain); // x=1.1 まで歩く
    expect(npc.feet.x).toBeCloseTo(1.1);
    expect(npc.feet.y).toBeCloseTo(0.22); // h(1.1) = 0.22
    expect(npc.position.y).toBeCloseTo(0.22 + 2.0); // 吹き出しアンカーも追従
  });

  it('障害物に円の外へ押し出されても徘徊円の境界へ引き戻される(範囲優先)', () => {
    const npc = buildNpc(); // 中心(0,0) 半径5
    // 円の縁(x=4.9)から外向きの目的地へ歩かせ、背後の障害物が円外(x=5.55)へ押し出す状況を作る
    npc.moveTo(4.9, 0);
    npc.targetX = 6;
    npc.targetZ = 0;
    const wall = { position: new Vec3(4.6, 0, 0), radius: 0.5 }; // 押し出し先 = 4.6+0.95 = 5.55(円外)
    service.tick(npc, 0.1, [wall]);

    const d = Math.hypot(npc.feet.x, npc.feet.z);
    expect(d).toBeLessThanOrEqual(5 + 1e-6); // 円外に出ない
    expect(npc.feet.x).toBeCloseTo(5); // 境界(半径5)へクランプ
  });
});
