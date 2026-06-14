import { describe, expect, it } from 'vitest';
import { GameSession } from '../entities/GameSession';
import { EventProp } from '../entities/EventProp';
import { Player } from '../entities/Player';
import { World } from '../entities/World';
import { FLAT_TERRAIN } from '../values/Terrain';
import { ActiveEvent } from '../values/EventScript';
import { GameSnapshot } from '../values/GameSnapshot';
import { Vec3 } from '../values/Vec3';
import { SaveService } from './SaveService';

const build = (): { session: GameSession; prop: EventProp } => {
  const prop = new EventProp('rock', new Vec3(5, 0, 5), 1, 0.9);
  const day = new World('day', '昼', [], [], [], [], FLAT_TERRAIN, [prop]);
  const night = new World('night', '夜', []);
  const player = new Player(new Vec3(1, 0, 2), Vec3.ZERO, 0.5, 0.1);
  return { session: new GameSession([day, night], 'day', player), prop };
};

describe('SaveService', () => {
  it('capture: 現在の状態(ワールド/姿勢/フラグ/完了/プロップ)を採取する', () => {
    const { session, prop } = build();
    session.flags.set('guided', true);
    session.completedEvents.add('day-rock');
    prop.position = new Vec3(1, 0, 7);

    const snap = new SaveService().capture(session);
    expect(snap.worldId).toBe('day');
    expect(snap.flags.guided).toBe(true);
    expect(snap.completedEvents).toContain('day-rock');
    expect(snap.props.rock).toEqual({ x: 1, z: 7 });
    expect(snap.player).toMatchObject({ x: 1, z: 2, yaw: 0.5, pitch: 0.1 });
  });

  it('restore: スナップショットから復元し、進行中イベントを解除する', () => {
    const { session, prop } = build();
    session.activeEvent = new ActiveEvent({ id: 'x', steps: [{ kind: 'wait', duration: 1 }] });
    const snap: GameSnapshot = {
      version: 1,
      worldId: 'night',
      player: { x: 3, y: 0, z: 4, yaw: 1, pitch: 0.2 },
      flags: { seen: true },
      completedEvents: ['e1'],
      props: { rock: { x: 9, z: 9 } },
    };
    new SaveService().restore(session, snap);

    expect(session.currentWorldId).toBe('night');
    expect(session.activeEvent).toBeNull();
    expect(session.flags.get('seen')).toBe(true);
    expect(session.completedEvents.has('e1')).toBe(true);
    expect(prop.position.x).toBe(9);
    expect(prop.position.z).toBe(9);
    expect(session.player.position.z).toBe(4);
    expect(session.player.yaw).toBe(1);
  });

  it('capture→restore のラウンドトリップで状態が一致する', () => {
    const { session } = build();
    session.flags.set('a', true);
    session.completedEvents.add('done');
    const snap = new SaveService().capture(session);
    // いったん状態を変える
    session.flags.set('a', false);
    session.completedEvents.clear();
    session.currentWorldId = 'night';
    new SaveService().restore(session, snap);
    expect(session.flags.get('a')).toBe(true);
    expect(session.completedEvents.has('done')).toBe(true);
    expect(session.currentWorldId).toBe('day');
  });

  it('未知のワールドIDの復元は例外になる(改ざん検知)', () => {
    const { session } = build();
    const bad: GameSnapshot = {
      version: 1, worldId: 'nowhere', player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
      flags: {}, completedEvents: [], props: {},
    };
    expect(() => new SaveService().restore(session, bad)).toThrow();
  });
});
