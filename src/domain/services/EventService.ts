import { GameSession } from '../entities/GameSession';
import { Vec3 } from '../values/Vec3';
import { MovementService } from './MovementService';

/** 自動歩行の速度 [m/s] */
export const EVENT_WALK_SPEED = 3;
/** walkTo の到達とみなす水平距離 [m] */
export const EVENT_ARRIVE_EPSILON = 0.5;
/** walkTo が到達できないまま続いた場合に打ち切る時間 [s](ソフトロック防止) */
export const EVENT_WALK_TIMEOUT = 12;

/**
 * 進行中イベントを1フレーム進めるドメインサービス(単一責務)。
 * 移動は MovementService に委譲(walkTo は desiredVelocity を設定するだけ)。
 * three.js / DOM には一切依存しない。
 */
export class EventService {
  constructor(private readonly movement: MovementService) {}

  /** 進行中イベントがあれば1ステップ分進める。表示文は session.eventMessage に反映する */
  tick(session: GameSession, dt: number): void {
    const active = session.activeEvent;
    if (!active || dt <= 0) return;

    const step = active.step;
    switch (step.kind) {
      case 'say': {
        session.eventMessage = step.text;
        active.elapsed += dt;
        if (active.elapsed >= step.duration) this.advance(session);
        break;
      }
      case 'wait': {
        active.elapsed += dt;
        if (active.elapsed >= step.duration) this.advance(session);
        break;
      }
      case 'walkTo': {
        active.elapsed += dt;
        const p = session.player.position;
        const dx = step.x - p.x;
        const dz = step.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= EVENT_ARRIVE_EPSILON || active.elapsed > EVENT_WALK_TIMEOUT) {
          this.movement.halt(session.player);
          this.advance(session);
        } else {
          // 目的地方向へ(ワールド座標)。視点(見回し)とは独立に移動する
          session.player.desiredVelocity = new Vec3(dx / dist, 0, dz / dist).scale(
            EVENT_WALK_SPEED,
          );
        }
        break;
      }
      case 'moveProp': {
        const prop = session.currentWorld.props.find((p) => p.id === step.propId);
        if (!prop) {
          this.advance(session); // 対象が無ければスキップ
          break;
        }
        if (active.propFromX === null) {
          active.propFromX = prop.position.x;
          active.propFromZ = prop.position.z;
        }
        active.elapsed += dt;
        const t = step.duration > 0 ? Math.min(active.elapsed / step.duration, 1) : 1;
        const ease = t * t * (3 - 2 * t); // smoothstep
        prop.position = new Vec3(
          active.propFromX + (step.toX - active.propFromX) * ease,
          prop.position.y,
          active.propFromZ! + (step.toZ - active.propFromZ!) * ease,
        );
        if (t >= 1) this.advance(session);
        break;
      }
    }
  }

  /** 現ステップを終え、次へ。最後まで進んだらイベント終了(操作を解放) */
  private advance(session: GameSession): void {
    const active = session.activeEvent;
    if (!active) return;
    active.next();
    session.eventMessage = null;
    if (active.done) {
      this.movement.halt(session.player);
      session.activeEvent = null;
    }
  }
}
