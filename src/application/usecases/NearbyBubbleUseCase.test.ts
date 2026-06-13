import { describe, expect, it } from 'vitest';
import { DialogueSession } from '../../domain/entities/DialogueSession';
import { GameSession } from '../../domain/entities/GameSession';
import { Interactable } from '../../domain/entities/Interactable';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { Vec3 } from '../../domain/values/Vec3';
import { InteractionService } from '../../domain/services/InteractionService';
import { NearbyBubbleUseCase } from './NearbyBubbleUseCase';

const buildSession = (interactables: Interactable[]): GameSession => {
  const a = new World(
    'day', '昼',
    [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')],
    interactables,
  );
  const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
  return new GameSession([a, b], 'day', new Player(Vec3.ZERO, Vec3.ZERO, 0, 0));
};

const tree = new Interactable('t', '木', new Vec3(3, 4, 0), 'これは木です', []);
const rock = new Interactable('r', '石', new Vec3(2, 1, 0), null, ['これは石だ。']);

describe('NearbyBubbleUseCase', () => {
  it('範囲内の吹き出し付きオブジェクトを返す', () => {
    const session = buildSession([tree, rock]);
    const found = new NearbyBubbleUseCase(session, new InteractionService(), 5).execute();
    expect(found?.id).toBe('t'); // 岩の方が近いが吹き出しを持たない
    expect(found?.bubbleText).toBe('これは木です');
  });

  it('範囲外なら null', () => {
    const session = buildSession([tree]);
    const found = new NearbyBubbleUseCase(session, new InteractionService(), 2).execute();
    expect(found).toBeNull();
  });

  it('メッセージウィンドウ表示中は吹き出しを出さない', () => {
    const session = buildSession([tree]);
    session.dialogue = new DialogueSession(['これは石だ。']);
    const found = new NearbyBubbleUseCase(session, new InteractionService(), 5).execute();
    expect(found).toBeNull();
  });
});
