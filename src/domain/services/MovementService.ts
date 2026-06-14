import { Player } from '../entities/Player';
import { FLAT_TERRAIN, HeightField } from '../values/Terrain';
import { Vec3 } from '../values/Vec3';

export interface MovementConfig {
  /** 速度の指数減衰係数 [1/s](入力なし時) */
  damping: number;
  /** 最大速度 [m/s] */
  maxSpeed: number;
  /** 移動可能な円形範囲の半径 [m] */
  boundsRadius: number;
  /** 目標速度への追従の強さ [1/s](仮想パッド押下中) */
  acceleration: number;
}

export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  damping: 2.2,
  maxSpeed: 10,
  boundsRadius: 28,
  acceleration: 8,
};

/** これ以下の段差は床として即スナップ(段差越え)。これを超える落差は滑らかに降下する [m] */
export const FALL_STEP_THRESHOLD = 0.6;
/** 段差を踏み外したときの通常の降下速度 [m/s] */
export const FALL_SPEED = 6;
/** 滑空中の降下速度 [m/s](通常落下よりさらに遅い) */
export const GLIDE_FALL_SPEED = 1.5;
/** 滑空中の水平移動の最大速度 [m/s](ゆっくり前後左右に移動) */
export const GLIDE_MOVE_SPEED = 3;
/** 急斜面/崖をよじ登るときの上昇速度 [m/s](これを超える急上昇は登坂として時間をかける) */
export const CLIMB_SPEED = 2.5;

/** 慣性つき移動のドメインサービス */
export class MovementService {
  constructor(private readonly config: MovementConfig = DEFAULT_MOVEMENT_CONFIG) {}

  /** 水平方向の速度インパルスを与える(最大速度でクランプ) */
  applyImpulse(player: Player, direction: Vec3, speed: number): void {
    const len = direction.length();
    if (len === 0 || speed <= 0) return;
    const v = player.velocity.add(direction.scale(speed / len)).withY(0);
    const vLen = v.length();
    player.velocity =
      vLen > this.config.maxSpeed ? v.scale(this.config.maxSpeed / vLen) : v;
  }

  /** 即時停止: 速度と目標速度を破棄する(仮想パッド解放時) */
  halt(player: Player): void {
    player.velocity = Vec3.ZERO;
    player.desiredVelocity = null;
  }

  /** (x,z) で立つべき床面の高さ(多層床は currentY を考慮) */
  private surfaceAt(terrain: HeightField, x: number, z: number, currentY: number): number {
    return terrain.floorAt ? terrain.floorAt(x, z, currentY) : terrain.heightAt(x, z);
  }

  /**
   * 足元の床面の高さを解決する。
   * - 床が currentY 付近(段差越えの範囲)なら即スナップ(上り坂・階段・小段差)
   * - 床が currentY より大きく下なら一定速度で滑らかに降下(ロフトの縁などから落ちる)
   * dt=0 を渡すと降下は進めず「届く段差だけスナップ」する(衝突後の再スナップ用)。
   */
  floorY(terrain: HeightField, x: number, z: number, currentY: number, dt: number): number {
    const floor = this.surfaceAt(terrain, x, z, currentY);
    const delta = floor - currentY; // + = 床が上(上り) / - = 床が下(下り)
    if (delta > FALL_STEP_THRESHOLD) return currentY; // 急な上り(崖)は再スナップでは登らない(tickが担当)
    if (delta >= -FALL_STEP_THRESHOLD) return floor; // 段差越え(緩い上り下り)は即スナップ
    return Math.max(floor, currentY - FALL_SPEED * dt); // 大きな落差は滑らかに降下
  }

  /** 1フレーム分の積分: 位置更新・速度制御(追従 or 減衰)・範囲クランプ・登坂/落下/滑空 */
  tick(player: Player, dt: number, terrain: HeightField = FLAT_TERRAIN): void {
    if (dt <= 0) return;
    const currentY = player.position.y; // 今フレームの垂直解決の基準
    const x0 = player.position.x;
    const z0 = player.position.z;
    let pos = player.position.add(player.velocity.scale(dt));

    const r = Math.hypot(pos.x, pos.z);
    if (r > this.config.boundsRadius) {
      const k = this.config.boundsRadius / r;
      pos = new Vec3(pos.x * k, pos.y, pos.z * k);
    }

    // 垂直方向の解決: 急な上り=よじ登り / 段差越え / 落下
    const floor = this.surfaceAt(terrain, pos.x, pos.z, currentY);
    const delta = floor - currentY;
    if (delta > FALL_STEP_THRESHOLD) {
      // 崖をよじ登る: 1フレームの上昇を CLIMB_SPEED に制限し、水平も同率に抑えて面に沿わせる
      const maxRise = CLIMB_SPEED * dt;
      const frac = Math.min(1, maxRise / delta);
      const cx = x0 + (pos.x - x0) * frac;
      const cz = z0 + (pos.z - z0) * frac;
      player.position = new Vec3(cx, currentY + Math.min(delta, maxRise), cz);
      player.climbing = true;
      player.airborne = false;
      player.gliding = false;
    } else if (delta >= -FALL_STEP_THRESHOLD) {
      // 段差越え(緩い上り下り・歩行)
      player.position = pos.withY(floor);
      player.climbing = false;
      player.airborne = false;
      player.gliding = false; // 着地で滑空は解除
    } else {
      // 大きな落差: 落下(滑空中はさらに遅い)
      const fallSpeed = player.gliding ? GLIDE_FALL_SPEED : FALL_SPEED;
      player.position = pos.withY(Math.max(floor, currentY - fallSpeed * dt));
      player.airborne = true;
      player.climbing = false;
    }

    if (player.desiredVelocity) {
      // 仮想パッド押下中: 目標速度へ指数追従
      const blend = 1 - Math.exp(-this.config.acceleration * dt);
      player.velocity = player.velocity
        .add(player.desiredVelocity.sub(player.velocity).scale(blend))
        .withY(0);
    } else {
      // 入力なし: 慣性の指数減衰
      player.velocity = player.velocity.scale(Math.exp(-this.config.damping * dt));
    }

    // 滑空中は水平速度を緩やかにクランプ(ゆっくり前後左右に移動)
    if (player.gliding) {
      const h = Math.hypot(player.velocity.x, player.velocity.z);
      if (h > GLIDE_MOVE_SPEED) {
        const k = GLIDE_MOVE_SPEED / h;
        player.velocity = new Vec3(player.velocity.x * k, 0, player.velocity.z * k);
      }
    }
  }
}
