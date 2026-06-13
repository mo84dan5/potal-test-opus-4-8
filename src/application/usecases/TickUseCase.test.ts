import { describe, expect, it } from 'vitest';
import { DialogueSession } from '../../domain/entities/DialogueSession';
import { GameSession } from '../../domain/entities/GameSession';
import { Npc } from '../../domain/entities/Npc';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { Vec3 } from '../../domain/values/Vec3';
import { MovementService } from '../../domain/services/MovementService';
import { PortalTraversalService } from '../../domain/services/PortalTraversalService';
import { TickUseCase } from './TickUseCase';

const buildSession = (player: Player): GameSession => {
  const a = new World('day', '昼', [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')]);
  const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
  return new GameSession([a, b], 'day', player);
};

const buildTick = (session: GameSession): TickUseCase =>
  new TickUseCase(session, new MovementService(), new PortalTraversalService());

describe('TickUseCase', () => {
  it('ポータルに向かって進むと通過しワールドが切り替わる', () => {
    const player = new Player(new Vec3(0, 0, -5.5), new Vec3(0, 0, -2), 0, 0);
    const session = buildSession(player);

    const result = buildTick(session).execute(0.5);

    expect(result.traversed).toBe(true);
    expect(session.currentWorldId).toBe('night');
    // (0,0,-6.5) が出口ポータル系へ写像され、出口の表側 z=-5.5 に出る
    expect(player.position.z).toBeCloseTo(-5.5);
    // 視点は反転し、出口ポータルから遠ざかる向きになる
    expect(player.forward.z).toBeCloseTo(1);
  });

  it('ポータルに届かなければ何も切り替わらない', () => {
    const player = new Player(new Vec3(0, 0, 4), new Vec3(0, 0, -1), 0, 0);
    const session = buildSession(player);

    const result = buildTick(session).execute(0.016);

    expect(result.traversed).toBe(false);
    expect(session.currentWorldId).toBe('day');
  });

  it('ポータル面の幅の外を通っても切り替わらない', () => {
    const player = new Player(new Vec3(8, 0, -5.5), new Vec3(0, 0, -4), 0, 0);
    const session = buildSession(player);

    const result = buildTick(session).execute(0.5);

    expect(result.traversed).toBe(false);
    expect(session.currentWorldId).toBe('day');
  });

  it('1ワールドに複数ポータルがあっても、横切ったポータルの接続先へ通過する', () => {
    // 2基目: x=6 に立ち -X 向き(yaw=-π/2)。雪の世界の snow-p1 と対
    const p1 = new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1');
    const p2 = new Portal('day-p2', new Vec3(6, 0, 0), -Math.PI / 2, 1.4, 3, 'snow', 'snow-p1');
    const day = new World('day', '昼', [p1, p2]);
    const night = new World('night', '夜', [
      new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1'),
    ]);
    const snow = new World('snow', '雪', [
      new Portal('snow-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p2'),
    ]);
    const player = new Player(new Vec3(5, 0, 0), new Vec3(4, 0, 0), 0, 0);
    const session = new GameSession([day, night, snow], 'day', player);

    const result = buildTick(session).execute(0.3); // x=5 → 6.2 で p2 面を横切る

    expect(result.traversed).toBe(true);
    expect(session.currentWorldId).toBe('snow'); // p1(夜)ではなく p2 の接続先
  });

  it('話しかけられているNPCは徘徊を停止し、会話が終わると再開する', () => {
    const npc = new Npc(
      'guide', '案内人',
      new Vec3(5, 0, 5), 2.0,
      'こんにちは!', ['ここは昼の世界。'],
      new Vec3(5, 0, 5), 5, 42,
    );
    npc.targetX = 10; // 遠くの目的地へ歩いている最中
    npc.targetZ = 5;
    const a = new World(
      'day', '昼',
      [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')],
      [npc], [], [npc],
    );
    const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
    const player = new Player(new Vec3(0, 0, 4), Vec3.ZERO, 0, 0);
    const session = new GameSession([a, b], 'day', player);
    const tick = buildTick(session);

    // 会話中: 動かない
    session.dialogueSpeaker = npc;
    tick.execute(0.5);
    expect(npc.feet.x).toBeCloseTo(5);

    // 会話終了: 歩き出す
    session.dialogueSpeaker = null;
    tick.execute(0.5);
    expect(npc.feet.x).toBeGreaterThan(5);
  });

  it('会話中のNPCは常にプレイヤーの方を向く(移動すると追従)', () => {
    const npc = new Npc(
      'guide', '案内人',
      new Vec3(5, 0, 5), 2.0,
      'こんにちは!', ['ここは昼の世界。'],
      new Vec3(5, 0, 5), 5, 42,
    );
    const a = new World(
      'day', '昼',
      [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')],
      [npc], [], [npc],
    );
    const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
    const player = new Player(new Vec3(5, 0, 8), Vec3.ZERO, 0, 0);
    const session = new GameSession([a, b], 'day', player);
    session.dialogue = new DialogueSession(npc.dialogue);
    session.dialogueSpeaker = npc;
    const tick = buildTick(session);

    // プレイヤーは +Z 側 → NPCの forward が (0,0,+1) になる yaw=π
    tick.execute(0.016);
    expect(Math.abs(npc.yaw)).toBeCloseTo(Math.PI);

    // プレイヤーが +X 側へ回り込むと向きが追従する(forward=(+1,0,0) → yaw=-π/2)
    player.position = new Vec3(8, 0, 5);
    tick.execute(0.016);
    expect(npc.yaw).toBeCloseTo(-Math.PI / 2);
  });

  it('会話中に一定以上離れるとウィンドウが自動で閉じる', () => {
    const npc = new Npc(
      'guide', '案内人',
      new Vec3(0, 0, 0), 2.0,
      'こんにちは!', ['ここは昼の世界。'],
      new Vec3(0, 0, 0), 5, 42,
    );
    const a = new World(
      'day', '昼',
      [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')],
      [npc], [], [npc],
    );
    const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
    const player = new Player(new Vec3(0, 0, 3), Vec3.ZERO, 0, 0);
    const session = new GameSession([a, b], 'day', player);
    session.dialogue = new DialogueSession(npc.dialogue);
    session.dialogueSpeaker = npc;
    const tick = buildTick(session); // 終了距離はデフォルト 6.5m

    // 範囲内: 開いたまま
    tick.execute(0.016);
    expect(session.dialogue).not.toBeNull();

    // 6.5m 超: 自動で閉じて speaker も解除、NPCは徘徊を再開できる
    player.position = new Vec3(0, 0, 7);
    tick.execute(0.016);
    expect(session.dialogue).toBeNull();
    expect(session.dialogueSpeaker).toBeNull();
  });

  it('起伏のある地形では足元が地形の高さにスナップして移動する', () => {
    const terrain = { heightAt: (x: number, z: number) => 0.1 * x + 0.05 * z };
    const player = new Player(new Vec3(0, 0, 4), new Vec3(2, 0, 0), 0, 0);
    const a = new World(
      'day', '昼',
      [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')],
      [], [], [], terrain,
    );
    const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
    const session = new GameSession([a, b], 'day', player);

    buildTick(session).execute(0.5); // x=1 へ移動

    expect(player.position.x).toBeCloseTo(1);
    expect(player.position.y).toBeCloseTo(0.1 * 1 + 0.05 * 4); // h(1, 4) = 0.3
  });

  it('コライダーのあるオブジェクトはすり抜けられない(押し出し+壁ずり)', () => {
    const player = new Player(new Vec3(0, 0, 0), new Vec3(0, 0, -6), 0, 0);
    const rock = { position: new Vec3(0, 0, -2), radius: 0.5 };
    const a = new World(
      'day', '昼',
      [new Portal('day-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'night', 'night-p1')],
      [], [rock],
    );
    const b = new World('night', '夜', [new Portal('night-p1', new Vec3(0, 0, -6), 0, 1.4, 3, 'day', 'day-p1')]);
    const session = new GameSession([a, b], 'day', player);

    const result = buildTick(session).execute(0.3); // 衝突なしなら z=-1.8(石の内側)まで進む

    expect(result.traversed).toBe(false);
    // 石の表面(z = -2 + 0.85)で止まる
    expect(player.position.z).toBeCloseTo(-1.15);
    // 石へ向かう速度成分は打ち消されている
    expect(player.velocity.z).toBeCloseTo(0);
  });
});
