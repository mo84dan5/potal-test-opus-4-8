import { describe, expect, it } from 'vitest';
import { GameSession } from '../../domain/entities/GameSession';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { Vec3 } from '../../domain/values/Vec3';
import { ApplyStickUseCase } from './ApplyStickUseCase';

const buildSession = (yaw = 0): GameSession => {
  const a = new World('day', '昼', [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')]);
  const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
  return new GameSession([a, b], 'day', new Player(Vec3.ZERO, Vec3.ZERO, yaw, 0));
};

describe('ApplyStickUseCase', () => {
  it('上に倒すと前方(-Z)への目標速度になる(倒し切り=最大歩行速度)', () => {
    const session = buildSession();
    new ApplyStickUseCase(session, 6).execute({ x: 0, y: -1 });
    expect(session.player.desiredVelocity).not.toBeNull();
    expect(session.player.desiredVelocity!.z).toBeCloseTo(-6);
    expect(session.player.desiredVelocity!.x).toBeCloseTo(0);
  });

  it('右に倒すと右(+X)への平行移動になり、視点は回転しない', () => {
    const session = buildSession();
    new ApplyStickUseCase(session, 6).execute({ x: 1, y: 0 });
    expect(session.player.desiredVelocity!.x).toBeCloseTo(6);
    expect(session.player.desiredVelocity!.z).toBeCloseTo(0);
    expect(session.player.yaw).toBeCloseTo(0);
  });

  it('下に倒すと後方への平行移動になり、視点は回転しない', () => {
    const session = buildSession(0.3);
    new ApplyStickUseCase(session, 6).execute({ x: 0, y: 1 });
    const d = session.player.desiredVelocity!;
    const f = session.player.forward;
    expect(d.x / 6).toBeCloseTo(-f.x);
    expect(d.z / 6).toBeCloseTo(-f.z);
    expect(session.player.yaw).toBeCloseTo(0.3);
  });

  it('全方向でヨー・ピッチが一切変化しない', () => {
    const session = buildSession(0.7);
    session.player.pitch = 0.2;
    const usecase = new ApplyStickUseCase(session, 6);
    const dirs = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: 0.7, y: 0.7 }, { x: -0.7, y: -0.7 },
    ];
    for (const d of dirs) usecase.execute(d);
    expect(session.player.yaw).toBeCloseTo(0.7);
    expect(session.player.pitch).toBeCloseTo(0.2);
  });

  it('倒し量が半分なら速度も半分になる', () => {
    const session = buildSession();
    new ApplyStickUseCase(session, 6).execute({ x: 0, y: -0.5 });
    expect(session.player.desiredVelocity!.length()).toBeCloseTo(3);
  });

  it('移動方向は視点基準(yaw=π/2 で上に倒すと -X へ前進)', () => {
    const session = buildSession(Math.PI / 2);
    new ApplyStickUseCase(session, 6).execute({ x: 0, y: -1 });
    expect(session.player.desiredVelocity!.x).toBeCloseTo(-6);
    expect(session.player.desiredVelocity!.z).toBeCloseTo(0);
  });

  it('デッドゾーン内では目標速度が解除される', () => {
    const session = buildSession();
    session.player.desiredVelocity = new Vec3(1, 0, 0);
    new ApplyStickUseCase(session, 6).execute({ x: 0.05, y: 0.05 });
    expect(session.player.desiredVelocity).toBeNull();
  });

  it('スティックが null(指を離した)なら目標速度が解除される', () => {
    const session = buildSession();
    session.player.desiredVelocity = new Vec3(1, 0, 0);
    new ApplyStickUseCase(session, 6).execute(null);
    expect(session.player.desiredVelocity).toBeNull();
  });
});
