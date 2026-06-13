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

  /** 1フレーム分の積分: 位置更新・速度制御(追従 or 減衰)・範囲クランプ・地形スナップ */
  tick(player: Player, dt: number, terrain: HeightField = FLAT_TERRAIN): void {
    if (dt <= 0) return;
    let pos = player.position.add(player.velocity.scale(dt));

    const r = Math.hypot(pos.x, pos.z);
    if (r > this.config.boundsRadius) {
      const k = this.config.boundsRadius / r;
      pos = new Vec3(pos.x * k, pos.y, pos.z * k);
    }
    // 足元を地形の高さへスナップ(地形に沿って移動する)
    player.position = pos.withY(terrain.heightAt(pos.x, pos.z));

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
  }
}
