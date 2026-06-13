import { GameSession } from '../../domain/entities/GameSession';

const PITCH_LIMIT = 0.9; // [rad] 真上/真下付近を避ける

/** 2本指スワイプの移動デルタを視点回転(ヨー+ピッチ)へ変換するユースケース */
export class ApplyLookUseCase {
  constructor(
    private readonly session: GameSession,
    /** スワイプ量[px] → 回転[rad] の変換係数 */
    private readonly sensitivity = 0.005,
  ) {}

  /** dx/dy はスワイプの移動デルタ [px](右・下が正)。右スワイプ=右を向く、上スワイプ=上を向く */
  execute(dx: number, dy: number): void {
    const player = this.session.player;
    player.yaw -= dx * this.sensitivity;
    player.pitch = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, player.pitch - dy * this.sensitivity),
    );
  }
}
