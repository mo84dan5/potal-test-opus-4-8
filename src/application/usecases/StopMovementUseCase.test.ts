import { describe, expect, it } from 'vitest';
import { GameSession } from '../../domain/entities/GameSession';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { Vec3 } from '../../domain/values/Vec3';
import { MovementService } from '../../domain/services/MovementService';
import { ApplyDashUseCase } from './ApplyDashUseCase';
import { StopMovementUseCase } from './StopMovementUseCase';

const buildSession = (): GameSession => {
  const a = new World('day', '昼', [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')]);
  const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
  return new GameSession([a, b], 'day', new Player(Vec3.ZERO, Vec3.ZERO, 0, 0));
};

describe('StopMovementUseCase', () => {
  it('実行すると慣性なしで停止する(速度・目標速度ともゼロ)', () => {
    const session = buildSession();
    session.player.velocity = new Vec3(0, 0, -6);
    session.player.desiredVelocity = new Vec3(0, 0, -6);

    new StopMovementUseCase(session, new MovementService()).execute();

    expect(session.player.velocity.length()).toBe(0);
    expect(session.player.desiredVelocity).toBeNull();
  });

  it('停止→ダッシュの順で適用すると、ダッシュの勢いだけが残る', () => {
    const session = buildSession();
    const movement = new MovementService();
    session.player.velocity = new Vec3(4, 0, 0); // 歩行中の横向き速度

    // VirtualStickInputAdapter.onUp と同じ順序: onStickEnd → onDash
    new StopMovementUseCase(session, movement).execute();
    new ApplyDashUseCase(session, movement).execute({ dx: 0, dy: -100 });

    // 歩行速度(+X)は消え、ダッシュ(-Z, 100px × 0.05 = 5 m/s)のみが残る
    expect(session.player.velocity.x).toBeCloseTo(0);
    expect(session.player.velocity.z).toBeCloseTo(-5);
  });
});
