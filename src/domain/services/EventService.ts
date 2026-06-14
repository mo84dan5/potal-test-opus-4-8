import { GameSession } from '../entities/GameSession';
import { evaluateCondition } from '../values/EventScript';
import { Vec3 } from '../values/Vec3';
import { MovementService } from './MovementService';

/** 自動歩行の速度 [m/s] */
export const EVENT_WALK_SPEED = 3;
/** walkTo の到達とみなす水平距離 [m] */
export const EVENT_ARRIVE_EPSILON = 0.5;
/** walkTo/escort/actorHome が到達できないまま続いた場合に打ち切る時間 [s](ソフトロック防止) */
export const EVENT_WALK_TIMEOUT = 12;
/** 先導NPC(主役)の歩行速度 [m/s] */
export const EVENT_NPC_SPEED = 2.6;
/** escort で主人公が主役NPCの後ろを保つ距離 [m] */
export const EVENT_FOLLOW_DISTANCE = 2.5;

/**
 * 進行中イベントを1フレーム進めるドメインサービス(単一責務)。
 * 移動は MovementService に委譲(walkTo は desiredVelocity を設定するだけ)。
 * three.js / DOM には一切依存しない。
 */
export class EventService {
  constructor(private readonly movement: MovementService) {}

  /** 進行中イベントがあれば1ステップ分進める。表示文は session.eventMessage に反映する */
  tick(session: GameSession, dt: number): void {
    if (!session.activeEvent || dt <= 0) return;

    // 即時に消化できるステップ(when 条件で飛ばす / setFlag)を先に進める(安全のため上限つき)
    for (let guard = 0; session.activeEvent && guard < 64; guard++) {
      const s = session.activeEvent.step;
      if (s.when && !evaluateCondition(s.when, session)) {
        this.advance(session); // 条件を満たさないステップはスキップ
        continue;
      }
      if (s.kind === 'setFlag') {
        session.flags.set(s.flag, s.value ?? true);
        this.advance(session);
        continue;
      }
      break; // 時間のかかるステップ(say/walkTo/...)に到達
    }

    const active = session.activeEvent;
    if (!active) return;

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
      case 'escort': {
        // 主役NPCが先導して (x,z) へ歩き、主人公は後ろを追う
        const npc = session.eventActor;
        if (!npc) {
          this.advance(session);
          break;
        }
        active.elapsed += dt;
        const terrain = session.currentWorld.terrain;
        const ndx = step.x - npc.position.x;
        const ndz = step.z - npc.position.z;
        const ndist = Math.hypot(ndx, ndz);
        const arrived = ndist <= EVENT_ARRIVE_EPSILON;
        if (!arrived) {
          const s = Math.min(EVENT_NPC_SPEED * dt, ndist);
          const nx = npc.position.x + (ndx / ndist) * s;
          const nz = npc.position.z + (ndz / ndist) * s;
          npc.moveTo(nx, nz, terrain.heightAt(nx, nz));
          npc.yaw = Math.atan2(-ndx, -ndz); // 進行方向を向く
        }
        // 主人公は主役NPCの後方 EVENT_FOLLOW_DISTANCE を保って追従
        const p = session.player.position;
        const pdx = npc.position.x - p.x;
        const pdz = npc.position.z - p.z;
        const pdist = Math.hypot(pdx, pdz);
        if (pdist > EVENT_FOLLOW_DISTANCE) {
          session.player.desiredVelocity = new Vec3(pdx / pdist, 0, pdz / pdist).scale(
            EVENT_WALK_SPEED,
          );
        } else {
          session.player.desiredVelocity = null;
        }
        if (
          (arrived && pdist <= EVENT_FOLLOW_DISTANCE + 0.5) ||
          active.elapsed > EVENT_WALK_TIMEOUT
        ) {
          this.movement.halt(session.player);
          this.advance(session);
        }
        break;
      }
      case 'actorHome': {
        // 主役NPCが元の位置(wanderCenter)へ戻る。主人公は待機(見回しのみ)
        const npc = session.eventActor;
        this.movement.halt(session.player);
        if (!npc) {
          this.advance(session);
          break;
        }
        active.elapsed += dt;
        const terrain = session.currentWorld.terrain;
        const home = npc.wanderCenter;
        const dx = home.x - npc.position.x;
        const dz = home.z - npc.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= EVENT_ARRIVE_EPSILON || active.elapsed > EVENT_WALK_TIMEOUT) {
          npc.moveTo(home.x, home.z, terrain.heightAt(home.x, home.z));
          npc.yaw = npc.homeYaw; // 元の向きへ
          this.advance(session);
        } else {
          const s = Math.min(EVENT_NPC_SPEED * dt, dist);
          const nx = npc.position.x + (dx / dist) * s;
          const nz = npc.position.z + (dz / dist) * s;
          npc.moveTo(nx, nz, terrain.heightAt(nx, nz));
          npc.yaw = Math.atan2(-dx, -dz);
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
      session.completedEvents.add(active.event.id); // once イベントの再開抑止
      session.activeEvent = null;
      session.eventActor = null;
    }
  }
}
