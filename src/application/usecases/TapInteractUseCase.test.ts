import { describe, expect, it } from 'vitest';
import { GameSession } from '../../domain/entities/GameSession';
import { Interactable } from '../../domain/entities/Interactable';
import { Npc } from '../../domain/entities/Npc';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { Vec3 } from '../../domain/values/Vec3';
import { InteractionService } from '../../domain/services/InteractionService';
import { INTERACT_RANGE } from '../../config/worldContent';
import { TapInteractUseCase } from './TapInteractUseCase';

const ROCK_LINES = ['これは石だ。', 'ごつごつしている。', '何も起こらない。'];

const buildSession = (interactables: Interactable[]): GameSession => {
  const a = new World(
    'day', '昼',
    [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')],
    interactables,
  );
  const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
  return new GameSession([a, b], 'day', new Player(Vec3.ZERO, Vec3.ZERO, 0, 0));
};

const buildUseCase = (session: GameSession): TapInteractUseCase =>
  new TapInteractUseCase(session, new InteractionService(), 3.5);

describe('TapInteractUseCase', () => {
  it('近くのオブジェクトをタップするとメッセージウィンドウが開く', () => {
    const rock = new Interactable('r', '石', new Vec3(0, 1, -2), null, ROCK_LINES);
    const session = buildSession([rock]);
    buildUseCase(session).execute();
    expect(session.dialogue).not.toBeNull();
    expect(session.dialogue!.currentLine).toBe('これは石だ。');
  });

  it('遠いオブジェクトはタップしても開かない', () => {
    const rock = new Interactable('r', '石', new Vec3(0, 1, -10), null, ROCK_LINES);
    const session = buildSession([rock]);
    buildUseCase(session).execute();
    expect(session.dialogue).toBeNull();
  });

  it('コメントのないオブジェクト(吹き出しのみ)は開かない', () => {
    const tree = new Interactable('t', '木', new Vec3(0, 4, -2), 'これは木です', []);
    const session = buildSession([tree]);
    buildUseCase(session).execute();
    expect(session.dialogue).toBeNull();
  });

  it('近くの案内人NPC(動くInteractable)をタップすると世界の説明が開く', () => {
    const npc = new Npc(
      'npc', '案内人',
      new Vec3(0, 0, -2), 2.0,
      'こんにちは!', ['ここは昼の世界。', '門の先は夜の世界だよ。'],
      new Vec3(0, 0, -2), 5,
    );
    const session = buildSession([npc]);
    buildUseCase(session).execute();
    expect(session.dialogue).not.toBeNull();
    expect(session.dialogue!.currentLine).toBe('ここは昼の世界。');
  });

  it('表示中にタップするとコメントが進み、最後のタップで閉じる', () => {
    const rock = new Interactable('r', '石', new Vec3(0, 1, -2), null, ROCK_LINES);
    const session = buildSession([rock]);
    const usecase = buildUseCase(session);

    usecase.execute(); // 開く: 1行目
    usecase.execute(); // 2行目
    expect(session.dialogue!.currentLine).toBe('ごつごつしている。');
    usecase.execute(); // 3行目
    expect(session.dialogue!.currentLine).toBe('何も起こらない。');
    usecase.execute(); // 閉じる
    expect(session.dialogue).toBeNull();
  });

  it('拡大された会話距離(5.25m=旧3.5の1.5倍)では5m先でも開き、5.5m先では開かない', () => {
    expect(INTERACT_RANGE).toBeCloseTo(3.5 * 1.5);

    const near = new Interactable('n', '石', new Vec3(0, 1, -5), null, ['これは石だ。']);
    const sessionNear = buildSession([near]);
    new TapInteractUseCase(sessionNear, new InteractionService(), INTERACT_RANGE).execute();
    expect(sessionNear.dialogue).not.toBeNull();

    const far = new Interactable('f', '石', new Vec3(0, 1, -5.5), null, ['これは石だ。']);
    const sessionFar = buildSession([far]);
    new TapInteractUseCase(sessionFar, new InteractionService(), INTERACT_RANGE).execute();
    expect(sessionFar.dialogue).toBeNull();
  });

  it('背後のオブジェクトはタップしても開かない', () => {
    const rock = new Interactable('r', '石', new Vec3(0, 1, 2), null, ROCK_LINES); // yaw=0 の真後ろ
    const session = buildSession([rock]);
    buildUseCase(session).execute();
    expect(session.dialogue).toBeNull();
  });

  it('真横(前方±60°の外)のオブジェクトはタップしても開かない', () => {
    const rock = new Interactable('r', '石', new Vec3(2, 1, 0), null, ROCK_LINES); // yaw=0 の真横+X
    const session = buildSession([rock]);
    buildUseCase(session).execute();
    expect(session.dialogue).toBeNull();
  });

  it('前方コーン内(±60°以内)の斜め前のオブジェクトは開く', () => {
    // 前方-Zに対して45°右前(dot=cos45°≈0.707 ≥ 0.5)
    const rock = new Interactable('r', '石', new Vec3(1.5, 1, -1.5), null, ROCK_LINES);
    const session = buildSession([rock]);
    buildUseCase(session).execute();
    expect(session.dialogue).not.toBeNull();
  });

  it('会話を開くと相手(dialogueSpeaker)が記録され、閉じると解除される', () => {
    const rock = new Interactable('r', '石', new Vec3(0, 1, -2), null, ['これは石だ。']);
    const session = buildSession([rock]);
    const usecase = buildUseCase(session);

    usecase.execute(); // 開く
    expect(session.dialogueSpeaker).toBe(rock);
    usecase.execute(); // 1行のみ → 閉じる
    expect(session.dialogue).toBeNull();
    expect(session.dialogueSpeaker).toBeNull();
  });
});
