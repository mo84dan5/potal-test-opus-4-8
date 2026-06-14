import { describe, expect, it } from 'vitest';
import { GameSession } from '../../domain/entities/GameSession';
import { Interactable } from '../../domain/entities/Interactable';
import { Npc } from '../../domain/entities/Npc';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { Vec3 } from '../../domain/values/Vec3';
import { InteractionService } from '../../domain/services/InteractionService';
import { GameEvent } from '../../domain/values/EventScript';
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

  it('会話を最後まで送ると choiceOnEnd の選択肢が提示される', () => {
    const choice = {
      question: '戦う?',
      options: [
        { label: 'はい', value: 'battle:duel' },
        { label: 'いいえ', value: 'no' },
      ],
    };
    const npc = new Interactable(
      'g', '挑戦者', new Vec3(0, 1, -2), 'b', ['勝負しないか?'], null, null, choice,
    );
    const session = buildSession([npc]);
    const usecase = buildUseCase(session);
    usecase.execute(); // 会話を開く(1行)
    expect(session.choice).toBeNull();
    usecase.execute(); // 最後を送って閉じる → 選択肢提示
    expect(session.dialogue).toBeNull();
    expect(session.choice).toBe(choice);
  });

  it('choiceOnEnd の無い相手は会話を閉じても選択肢を出さない', () => {
    const rock = new Interactable('r', '石', new Vec3(0, 1, -2), null, ['石だ。']);
    const session = buildSession([rock]);
    const usecase = buildUseCase(session);
    usecase.execute();
    usecase.execute();
    expect(session.choice).toBeNull();
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

// --- 扉(タップ入室)---
const buildDoorSession = (): GameSession => {
  const door = new Portal('out-in', new Vec3(0, 0, -2), 0, 1.4, 3, 'in', 'in-out', true);
  const out = new World('out', '外', [door], [
    // 扉インタラクタブル(doorPortalId='out-in'、会話コメントなし)。プレイヤー前方(-Z)
    new Interactable('it-door', '扉', new Vec3(0, 2.6, -2), 'タップで入る', [], 'out-in'),
  ]);
  const back = new Portal('in-out', new Vec3(0, 0, -11), 0, 1.4, 3, 'out', 'out-in', true);
  const inWorld = new World('in', '中', [back]);
  return new GameSession([out, inWorld], 'out', new Player(Vec3.ZERO, Vec3.ZERO, 0, 0));
};

describe('TapInteractUseCase(イベント)', () => {
  const onceEvent: GameEvent = {
    id: 'rock',
    once: true,
    steps: [{ kind: 'say', text: 'どかすよ', duration: 1 }],
  };
  const makeRockNpc = () =>
    new Interactable('r', '岩どかし', new Vec3(0, 1, -2), 'b', ['岩はもうどかしたよ。'], null, onceEvent);

  it('未完了の once イベントはタップで開始する(会話は開かない)', () => {
    const session = buildSession([makeRockNpc()]);
    new TapInteractUseCase(session, new InteractionService(), INTERACT_RANGE).execute();
    expect(session.activeEvent).not.toBeNull();
    expect(session.dialogue).toBeNull();
  });

  it('完了済みの once イベントは再開せず、通常会話に切り替わる', () => {
    const session = buildSession([makeRockNpc()]);
    session.completedEvents.add('rock');
    new TapInteractUseCase(session, new InteractionService(), INTERACT_RANGE).execute();
    expect(session.activeEvent).toBeNull(); // イベントは始まらない
    expect(session.dialogue).not.toBeNull(); // 会話が開く
    expect(session.dialogue!.currentLine).toBe('岩はもうどかしたよ。');
  });

  it('available 条件を満たさないイベントは開始せず会話になる', () => {
    const gated: GameEvent = {
      id: 'gated',
      available: { kind: 'flag', flag: 'ready' },
      steps: [{ kind: 'say', text: 'go', duration: 1 }],
    };
    const npc = new Interactable('g', '門', new Vec3(0, 1, -2), 'b', ['まだだよ'], null, gated);
    const session = buildSession([npc]);
    // ready 未設定 → 開始不可
    new TapInteractUseCase(session, new InteractionService(), INTERACT_RANGE).execute();
    expect(session.activeEvent).toBeNull();
    expect(session.dialogue!.currentLine).toBe('まだだよ');
    // ready 設定 → 開始
    session.dialogue = null;
    session.flags.set('ready', true);
    new TapInteractUseCase(session, new InteractionService(), INTERACT_RANGE).execute();
    expect(session.activeEvent).not.toBeNull();
  });
});

describe('TapInteractUseCase(扉)', () => {
  it('前方の扉をタップすると入室し(世界が変わり)、会話は開かない', () => {
    const session = buildDoorSession();
    const entered = new TapInteractUseCase(
      session, new InteractionService(), INTERACT_RANGE, 0.5,
    ).execute();

    expect(entered).toBe(true);
    expect(session.currentWorldId).toBe('in');
    expect(session.dialogue).toBeNull();
    // 接続先扉(in-out: (0,-11)・法線+Z)の正面=室内側(z>-11)に立つ
    expect(session.player.position.z).toBeGreaterThan(-11);
  });

  it('背後の扉はタップしても入室しない', () => {
    const session = buildDoorSession();
    // プレイヤーを反転(yaw=π → forward +Z)させ、扉(-Z)を背後にする
    session.player.yaw = Math.PI;
    const entered = new TapInteractUseCase(
      session, new InteractionService(), INTERACT_RANGE, 0.5,
    ).execute();

    expect(entered).toBe(false);
    expect(session.currentWorldId).toBe('out');
  });
});
