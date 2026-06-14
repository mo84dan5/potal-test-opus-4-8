import { describe, expect, it } from 'vitest';
import { GameSession } from '../../domain/entities/GameSession';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { Vec3 } from '../../domain/values/Vec3';
import { StartGlideUseCase } from './StartGlideUseCase';

const buildSession = (): GameSession => {
  const a = new World('day', '昼', [new Portal('p', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'q')]);
  const b = new World('night', '夜', [new Portal('q', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'p')]);
  return new GameSession([a, b], 'day', new Player(Vec3.ZERO, Vec3.ZERO, 0, 0));
};

describe('StartGlideUseCase', () => {
  it('滞空中ならタップで滑空を開始する', () => {
    const session = buildSession();
    session.player.airborne = true;
    const started = new StartGlideUseCase(session).execute();
    expect(started).toBe(true);
    expect(session.player.gliding).toBe(true);
  });

  it('地上(滞空していない)では滑空しない', () => {
    const session = buildSession();
    session.player.airborne = false;
    const started = new StartGlideUseCase(session).execute();
    expect(started).toBe(false);
    expect(session.player.gliding).toBe(false);
  });

  it('すでに滑空中なら何もしない(false)', () => {
    const session = buildSession();
    session.player.airborne = true;
    session.player.gliding = true;
    const started = new StartGlideUseCase(session).execute();
    expect(started).toBe(false);
    expect(session.player.gliding).toBe(true);
  });
});
