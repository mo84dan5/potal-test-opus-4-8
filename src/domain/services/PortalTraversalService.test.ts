import { describe, expect, it } from 'vitest';
import { Player } from '../entities/Player';
import { Portal } from '../entities/Portal';
import { Vec3 } from '../values/Vec3';
import { PortalTraversalService } from './PortalTraversalService';

const portalA = new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1');
const portalB = new Portal('night-p1', new Vec3(10, 0, 20), Math.PI / 2, 1.4, 3, 'day', 'day-p1');
const service = new PortalTraversalService();

describe('PortalTraversalService.hasCrossed', () => {
  it('面の幅の内側を符号反転して横切ったら true', () => {
    expect(
      service.hasCrossed(portalA, new Vec3(0.5, 0, -5), new Vec3(0.5, 0, -7)),
    ).toBe(true);
  });

  it('面の幅の外側を通過しても false', () => {
    expect(
      service.hasCrossed(portalA, new Vec3(5, 0, -5), new Vec3(5, 0, -7)),
    ).toBe(false);
  });

  it('面の手前で止まったら false', () => {
    expect(
      service.hasCrossed(portalA, new Vec3(0, 0, -4), new Vec3(0, 0, -5.9)),
    ).toBe(false);
  });

  it('逆方向(裏から表)の通過も検知する', () => {
    expect(
      service.hasCrossed(portalA, new Vec3(0, 0, -7), new Vec3(0, 0, -5)),
    ).toBe(true);
  });
});

describe('PortalTraversalService.traverse', () => {
  it('入口の中心は出口の中心へ写像される', () => {
    const p = service.mapPoint(portalA.position, portalA, portalB);
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(20);
  });

  it('面からの符号付き距離は反転する(表側→出口の裏側)', () => {
    const front = new Vec3(0.3, 0, -5); // d_A = +1
    const mapped = service.mapPoint(front, portalA, portalB);
    expect(portalB.signedDistance(mapped)).toBeCloseTo(-portalA.signedDistance(front));
  });

  it('速度・視点も一貫して写像される(写像後の前方向=写像後の速度方向)', () => {
    const player = new Player(new Vec3(0, 0, -6), new Vec3(0, 0, -2), 0, 0.1);
    service.traverse(player, portalA, portalB);

    // 速度の長さは保存される
    expect(player.velocity.length()).toBeCloseTo(2);
    // 通過前は速度=前方向(-Z)。通過後も前方向と速度が一致していること
    const f = player.forward;
    const v = player.velocity.scale(1 / player.velocity.length());
    expect(v.x).toBeCloseTo(f.x);
    expect(v.z).toBeCloseTo(f.z);
    // ピッチは変化しない
    expect(player.pitch).toBeCloseTo(0.1);
  });

  it('desiredVelocity(仮想パッドの目標速度)も同じ回転で写像される', () => {
    const player = new Player(new Vec3(0, 0, -6), new Vec3(0, 0, -2), 0, 0);
    player.desiredVelocity = new Vec3(0, 0, -6);
    service.traverse(player, portalA, portalB);
    // 速度と目標速度は同じ向きのまま(長さも保存)
    expect(player.desiredVelocity!.length()).toBeCloseTo(6);
    const v = player.velocity;
    const d = player.desiredVelocity!;
    expect(d.x / 3).toBeCloseTo(v.x);
    expect(d.z / 3).toBeCloseTo(v.z);
  });

  it('同一形状のポータル対なら、通過後すぐ裏返って戻ると元の位置に帰る', () => {
    const start = new Vec3(0.4, 0, -5.2);
    const there = service.mapPoint(start, portalA, portalB);
    const back = service.mapPoint(there, portalB, portalA);
    expect(back.x).toBeCloseTo(start.x);
    expect(back.z).toBeCloseTo(start.z);
  });
});
