import { describe, expect, it } from 'vitest';
import { GameSession } from '../entities/GameSession';
import { EventProp } from '../entities/EventProp';
import { Npc } from '../entities/Npc';
import { Player } from '../entities/Player';
import { World } from '../entities/World';
import { FLAT_TERRAIN } from '../values/Terrain';
import { ActiveEvent, GameEvent } from '../values/EventScript';
import { Vec3 } from '../values/Vec3';
import { MovementService } from './MovementService';
import { EventService } from './EventService';

interface BuildOpts {
  prop?: EventProp;
  actor?: Npc;
}

const build = (
  event: GameEvent,
  opts: BuildOpts = {},
): { session: GameSession; svc: EventService } => {
  const player = new Player(new Vec3(0, 0, 0), Vec3.ZERO, 0, 0);
  const world = new World('day', '昼', [], [], [], [], FLAT_TERRAIN, opts.prop ? [opts.prop] : []);
  const session = new GameSession([world], 'day', player);
  session.activeEvent = new ActiveEvent(event);
  session.eventActor = opts.actor ?? null;
  return { session, svc: new EventService(new MovementService()) };
};

const makeNpc = (x: number, z: number): Npc =>
  new Npc('guide', '案内', new Vec3(x, 0, z), 2, 'b', [], new Vec3(x, 0, z), 0, 1);

describe('EventService', () => {
  it('say: 一定時間メッセージを表示し、経過で次へ進む', () => {
    const { session, svc } = build({ id: 'e', steps: [{ kind: 'say', text: 'やあ', duration: 1 }] });
    svc.tick(session, 0.5);
    expect(session.eventMessage).toBe('やあ');
    expect(session.activeEvent).not.toBeNull();
    svc.tick(session, 0.6); // 累計1.1 >= 1 → 最終ステップ完了
    expect(session.activeEvent).toBeNull();
    expect(session.eventMessage).toBeNull();
  });

  it('walkTo: 目的地が遠ければ目的地方向へ desiredVelocity を設定する', () => {
    const { session, svc } = build({ id: 'e', steps: [{ kind: 'walkTo', x: 0, z: 5 }] });
    svc.tick(session, 0.1);
    expect(session.player.desiredVelocity).not.toBeNull();
    expect(session.player.desiredVelocity!.z).toBeGreaterThan(0); // +Z へ向かう
    expect(session.activeEvent).not.toBeNull(); // まだ到達していない
  });

  it('walkTo: 目的地に到達したら停止して次へ進む', () => {
    const { session, svc } = build({ id: 'e', steps: [{ kind: 'walkTo', x: 0, z: 5 }] });
    session.player.position = new Vec3(0, 0, 4.7); // 距離0.3 < 0.5
    svc.tick(session, 0.1);
    expect(session.player.velocity.length()).toBe(0); // halt
    expect(session.activeEvent).toBeNull(); // 最終ステップ完了
  });

  it('moveProp: プロップを目的地へ補間し、完了で次へ', () => {
    const prop = new EventProp('rock', new Vec3(5, 0, 5), 1, 0.9);
    const { session, svc } = build(
      { id: 'e', steps: [{ kind: 'moveProp', propId: 'rock', toX: 5, toZ: 0, duration: 1 }] },
      { prop },
    );
    svc.tick(session, 0.5);
    expect(prop.position.z).toBeGreaterThan(0); // まだ途中
    expect(prop.position.z).toBeLessThan(5);
    svc.tick(session, 0.6); // 累計1.1 → 完了
    expect(prop.position.z).toBeCloseTo(0);
    expect(prop.position.x).toBeCloseTo(5);
    expect(session.activeEvent).toBeNull();
  });

  it('複数ステップを順に消化してイベントが終わる', () => {
    const { session, svc } = build({
      id: 'e',
      steps: [
        { kind: 'say', text: 'A', duration: 1 },
        { kind: 'wait', duration: 1 },
      ],
    });
    svc.tick(session, 1); // say 完了 → wait へ
    expect(session.activeEvent).not.toBeNull();
    expect(session.activeEvent!.index).toBe(1);
    svc.tick(session, 1); // wait 完了 → 終了
    expect(session.activeEvent).toBeNull();
  });

  it('escort: 主役NPCが目的地方向へ歩き進行方向を向く / 主人公は離れていれば追従する', () => {
    const actor = makeNpc(0, 0);
    const { session, svc } = build({ id: 'e', steps: [{ kind: 'escort', x: 0, z: 5 }] }, { actor });
    session.player.position = new Vec3(0, 0, -4); // NPCから4m後方
    svc.tick(session, 0.1);
    expect(actor.position.z).toBeGreaterThan(0); // NPCが+Zへ先導
    expect(session.player.desiredVelocity).not.toBeNull(); // 主人公は追従
    expect(session.activeEvent).not.toBeNull();
  });

  it('escort: NPCが目的地に着き主人公が追従距離内なら次へ', () => {
    const actor = makeNpc(0, 0);
    const { session, svc } = build({ id: 'e', steps: [{ kind: 'escort', x: 0, z: 5 }] }, { actor });
    actor.moveTo(0, 5, 0); // 目的地に到達済み
    session.player.position = new Vec3(0, 0, 3); // NPCから2m(追従距離内)
    svc.tick(session, 0.1);
    expect(session.activeEvent).toBeNull(); // 単一ステップ完了
  });

  it('actorHome: 主役NPCが元の位置へ戻り、向きを homeYaw に戻して終了する', () => {
    const actor = makeNpc(0, 0); // wanderCenter (0,0)
    actor.homeYaw = 1.2;
    actor.moveTo(0, 0, 0.3); // ほぼ自宅(距離0.3<=0.5)
    const { session, svc } = build({ id: 'e', steps: [{ kind: 'actorHome' }] }, { actor });
    svc.tick(session, 0.1);
    expect(actor.position.z).toBeCloseTo(0); // 自宅へ
    expect(actor.yaw).toBeCloseTo(1.2); // 元の向き
    expect(session.activeEvent).toBeNull();
    expect(session.eventActor).toBeNull(); // 主役は解放される
  });

  it('escort: 主役NPCがいなければスキップする', () => {
    const { session, svc } = build({ id: 'e', steps: [{ kind: 'escort', x: 0, z: 5 }] });
    svc.tick(session, 0.1);
    expect(session.activeEvent).toBeNull();
  });

  it('進行中イベントが無ければ何もしない', () => {
    const { session, svc } = build({ id: 'e', steps: [{ kind: 'say', text: 'x', duration: 1 }] });
    session.activeEvent = null;
    expect(() => svc.tick(session, 0.5)).not.toThrow();
  });
});

describe('EventProp', () => {
  it('コライダーは現在位置(y=0)を反映する', () => {
    const prop = new EventProp('rock', new Vec3(3, 0, -2), 1.2, 0.9);
    expect(prop.collider.position.x).toBe(3);
    expect(prop.collider.position.z).toBe(-2);
    expect(prop.collider.position.y).toBe(0);
    expect(prop.collider.radius).toBe(1.2);
  });
});
