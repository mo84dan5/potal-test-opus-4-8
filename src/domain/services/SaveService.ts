import { GameSession } from '../entities/GameSession';
import { Clock, systemClock } from '../values/Clock';
import { GameSnapshot, SNAPSHOT_VERSION } from '../values/GameSnapshot';
import { Vec3 } from '../values/Vec3';

/**
 * ゲーム状態のスナップショット採取/復元を行うドメインサービス(単一責務)。
 * 文字列化(セーブコード)は SnapshotCodec(ポート)が担い、本サービスは関与しない。
 * three.js / DOM には依存しない。
 *
 * アプリ名・保存時刻は外部都合(非決定的)なので、コンストラクタで注入する(DIP)。
 * これにより本サービスは `new Date()` を直接呼ばず、テストで決定的に検証できる。
 */
export class SaveService {
  constructor(
    private readonly appName = 'Portal Walk',
    private readonly clock: Clock = systemClock,
  ) {}

  /** 現在のゲーム状態をスナップショットに採取する */
  capture(session: GameSession): GameSnapshot {
    const p = session.player;
    const props: Record<string, { x: number; z: number }> = {};
    for (const world of session.allWorlds) {
      for (const prop of world.props) {
        props[prop.id] = { x: prop.position.x, z: prop.position.z };
      }
    }
    return {
      version: SNAPSHOT_VERSION,
      appName: this.appName,
      savedAt: this.clock.nowIso(),
      worldId: session.currentWorldId,
      player: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch },
      flags: Object.fromEntries(session.flags),
      completedEvents: [...session.completedEvents],
      props,
    };
  }

  /** スナップショットを現在のゲームへ復元する(進行中のイベント/会話は解除する) */
  restore(session: GameSession, snapshot: GameSnapshot): void {
    // 一時状態を解除
    session.activeEvent = null;
    session.eventActor = null;
    session.eventMessage = null;
    session.dialogue = null;
    session.dialogueSpeaker = null;

    // フラグ・完了イベント
    session.flags.clear();
    for (const [key, value] of Object.entries(snapshot.flags)) session.flags.set(key, value);
    session.completedEvents.clear();
    for (const id of snapshot.completedEvents) session.completedEvents.add(id);

    // 可動プロップの位置(y は地形に追従するため XZ のみ)
    for (const world of session.allWorlds) {
      for (const prop of world.props) {
        const saved = snapshot.props[prop.id];
        if (saved) prop.position = new Vec3(saved.x, 0, saved.z);
      }
    }

    // ワールドとプレイヤー姿勢(未知ワールドなら moveToWorld が例外を投げる)
    session.moveToWorld(snapshot.worldId);
    const p = session.player;
    p.position = new Vec3(snapshot.player.x, snapshot.player.y, snapshot.player.z);
    p.yaw = snapshot.player.yaw;
    p.pitch = snapshot.player.pitch;
    p.velocity = Vec3.ZERO;
    p.desiredVelocity = null;
    p.airborne = false;
    p.gliding = false;
    p.climbing = false;
  }
}
