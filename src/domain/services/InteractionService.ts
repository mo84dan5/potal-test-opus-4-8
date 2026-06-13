import { Interactable } from '../entities/Interactable';
import { Vec3 } from '../values/Vec3';

/** インタラクト対象の近接判定を行うドメインサービス */
export class InteractionService {
  /** 水平距離が range 以内で最も近い対象を返す(なければ null) */
  nearestWithin(
    from: Vec3,
    interactables: readonly Interactable[],
    range: number,
  ): Interactable | null {
    let nearest: Interactable | null = null;
    let nearestDist = range;
    for (const it of interactables) {
      const d = it.horizontalDistanceFrom(from);
      if (d <= nearestDist) {
        nearest = it;
        nearestDist = d;
      }
    }
    return nearest;
  }

  /**
   * 前方コーン内(対象への水平方向と forward の内積が minDot 以上)かつ
   * range 以内で最も近い対象を返す。至近距離(方向が定まらない)は前方扱い。
   */
  nearestInFrontWithin(
    from: Vec3,
    forward: Vec3,
    interactables: readonly Interactable[],
    range: number,
    minDot: number,
  ): Interactable | null {
    let nearest: Interactable | null = null;
    let nearestDist = range;
    for (const it of interactables) {
      const d = it.horizontalDistanceFrom(from);
      if (d > nearestDist) continue;
      if (d > 1e-6) {
        const dx = (it.position.x - from.x) / d;
        const dz = (it.position.z - from.z) / d;
        if (dx * forward.x + dz * forward.z < minDot) continue;
      }
      nearest = it;
      nearestDist = d;
    }
    return nearest;
  }
}
