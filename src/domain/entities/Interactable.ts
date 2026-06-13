import { Vec3 } from '../values/Vec3';

/**
 * ワールド内のインタラクト対象オブジェクト。
 * position の y は吹き出し表示のアンカー高さ(距離判定は水平面のみで行う)。
 * position は可変(NPCのような動く対象がサブクラスで更新する)。
 */
export class Interactable {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public position: Vec3,
    /** 接近時に頭上へ出す吹き出し文。null なら吹き出しなし */
    public readonly bubbleText: string | null,
    /** タップ時にメッセージウィンドウで送るコメント列。空ならタップ反応なし */
    public readonly dialogue: readonly string[],
  ) {}

  /** プレイヤー足元からの水平距離 */
  horizontalDistanceFrom(p: Vec3): number {
    return Math.hypot(this.position.x - p.x, this.position.z - p.z);
  }
}
