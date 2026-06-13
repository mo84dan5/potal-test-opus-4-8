import { describe, expect, it } from 'vitest';
import { GameSession } from '../../domain/entities/GameSession';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { Vec3 } from '../../domain/values/Vec3';
import { MovementService } from '../../domain/services/MovementService';
import { ApplyDashUseCase } from './ApplyDashUseCase';

const buildSession = (yaw = 0): GameSession => {
  const a = new World('day', '昼', [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')]);
  const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
  return new GameSession([a, b], 'day', new Player(Vec3.ZERO, Vec3.ZERO, yaw, 0));
};

describe('ApplyDashUseCase', () => {
  it('上はじき(dy<0)で前方(-Z)へダッシュする', () => {
    const session = buildSession();
    new ApplyDashUseCase(session, new MovementService()).execute({ dx: 0, dy: -100 });
    expect(session.player.velocity.z).toBeCloseTo(-5); // 100px × gain 0.05
    expect(session.player.velocity.x).toBeCloseTo(0);
  });

  it('右はじき(dx>0)で右(+X)へダッシュする', () => {
    const session = buildSession();
    new ApplyDashUseCase(session, new MovementService()).execute({ dx: 100, dy: 0 });
    expect(session.player.velocity.x).toBeCloseTo(5);
    expect(session.player.velocity.z).toBeCloseTo(0);
  });

  it('視点が90°左(yaw=π/2)を向いていれば上はじきは -X へダッシュ', () => {
    const session = buildSession(Math.PI / 2);
    new ApplyDashUseCase(session, new MovementService()).execute({ dx: 0, dy: -100 });
    expect(session.player.velocity.x).toBeCloseTo(-5);
    expect(session.player.velocity.z).toBeCloseTo(0);
  });

  it('ダッシュ速度は最大速度でクランプされる', () => {
    const session = buildSession();
    new ApplyDashUseCase(session, new MovementService()).execute({ dx: 0, dy: -1000 });
    expect(session.player.velocity.length()).toBeCloseTo(10); // DEFAULT maxSpeed
  });

  it('移動量ゼロでは何も起きない', () => {
    const session = buildSession();
    new ApplyDashUseCase(session, new MovementService()).execute({ dx: 0, dy: 0 });
    expect(session.player.velocity.length()).toBe(0);
  });
});
