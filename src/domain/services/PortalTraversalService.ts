import { Player } from '../entities/Player';
import { Portal } from '../entities/Portal';
import { Vec3 } from '../values/Vec3';

/** ポータルの交差判定と、ポータル対を通り抜ける座標変換 */
export class PortalTraversalService {
  /**
   * フレーム間の移動 p0→p1 がポータル面を横切ったか。
   * 面の符号付き距離の符号反転かつ、交差点が面の幅の内側にあること。
   */
  hasCrossed(portal: Portal, p0: Vec3, p1: Vec3): boolean {
    const d0 = portal.signedDistance(p0);
    const d1 = portal.signedDistance(p1);
    if (d0 === d1 || d0 * d1 > 0) return false;

    const t = d0 / (d0 - d1); // 交差パラメータ [0,1]
    const hit = p0.add(p1.sub(p0).scale(t));
    return Math.abs(portal.tangentOffset(hit)) <= portal.halfWidth;
  }

  /**
   * 入口ポータル(from)の系から出口ポータル(to)の系へプレイヤーを写像する。
   * 表から入って出口の表から出るよう、ローカル系でY軸180°反転を挟む。
   */
  traverse(player: Player, from: Portal, to: Portal): void {
    player.position = this.mapPoint(player.position, from, to);
    player.velocity = this.mapVector(player.velocity, from, to);
    if (player.desiredVelocity) {
      player.desiredVelocity = this.mapVector(player.desiredVelocity, from, to);
    }
    player.yaw = player.yaw + (to.yaw - from.yaw + Math.PI);
  }

  mapPoint(p: Vec3, from: Portal, to: Portal): Vec3 {
    const local = p.sub(from.position).rotateY(-from.yaw);
    const flipped = new Vec3(-local.x, local.y, -local.z);
    return flipped.rotateY(to.yaw).add(to.position);
  }

  mapVector(v: Vec3, from: Portal, to: Portal): Vec3 {
    const local = v.rotateY(-from.yaw);
    const flipped = new Vec3(-local.x, local.y, -local.z);
    return flipped.rotateY(to.yaw);
  }
}
