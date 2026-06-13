import { describe, expect, it } from 'vitest';
import { GameSession } from '../../domain/entities/GameSession';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { Vec3 } from '../../domain/values/Vec3';
import { ApplyLookUseCase } from './ApplyLookUseCase';

const buildSession = (): GameSession => {
  const a = new World('day', '昼', [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')]);
  const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
  return new GameSession([a, b], 'day', new Player(Vec3.ZERO, Vec3.ZERO, 0, 0));
};

describe('ApplyLookUseCase', () => {
  it('右スワイプ(dx>0)で右を向く(ヨーが減少)', () => {
    const session = buildSession();
    new ApplyLookUseCase(session, 0.005).execute(100, 0);
    expect(session.player.yaw).toBeCloseTo(-0.5);
    expect(session.player.pitch).toBeCloseTo(0);
  });

  it('上スワイプ(dy<0)で上を向く(ピッチが増加)', () => {
    const session = buildSession();
    new ApplyLookUseCase(session, 0.005).execute(0, -100);
    expect(session.player.pitch).toBeCloseTo(0.5);
    expect(session.player.yaw).toBeCloseTo(0);
  });

  it('ピッチは ±0.9 rad でクランプされる', () => {
    const session = buildSession();
    const usecase = new ApplyLookUseCase(session, 0.005);
    usecase.execute(0, -10000); // 大きく上スワイプ
    expect(session.player.pitch).toBeCloseTo(0.9);
    usecase.execute(0, 10000); // 大きく下スワイプ
    expect(session.player.pitch).toBeCloseTo(-0.9);
  });

  it('連続スワイプで回転が累積する', () => {
    const session = buildSession();
    const usecase = new ApplyLookUseCase(session, 0.005);
    usecase.execute(40, 0);
    usecase.execute(40, 0);
    expect(session.player.yaw).toBeCloseTo(-0.4);
  });
});
