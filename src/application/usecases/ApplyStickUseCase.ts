import { GameSession } from '../../domain/entities/GameSession';

export interface StickInput {
  /** 正規化済みスティック値(右が正、|(x,y)| ≤ 1) */
  x: number;
  /** 正規化済みスティック値(下が正) */
  y: number;
}

const DEAD_ZONE = 0.12;

/**
 * 仮想パッドのスティック値を毎フレーム目標速度へ変換するユースケース。
 * 1本指は移動のみを担い、視点は一切変えない(上=前進、下=後進、左右=平行移動)。
 * 視点の回転は2本指見回し(ApplyLookUseCase)に分離されている。
 * stick が null(指を離している)なら目標速度を解除する。
 */
export class ApplyStickUseCase {
  constructor(
    private readonly session: GameSession,
    /** 最大歩行速度 [m/s](スティックを倒し切ったとき) */
    private readonly walkSpeed = 6,
  ) {}

  execute(stick: StickInput | null): void {
    const player = this.session.player;
    const magnitude = stick ? Math.hypot(stick.x, stick.y) : 0;
    if (!stick || magnitude < DEAD_ZONE) {
      player.desiredVelocity = null;
      return;
    }

    // 上に倒す(y<0)= 前進、右に倒す(x>0)= 右への平行移動
    const direction = player.right
      .scale(stick.x)
      .add(player.forward.scale(-stick.y));
    const dirLen = direction.length();
    if (dirLen === 0) return;
    const unit = direction.scale(1 / dirLen);
    player.desiredVelocity = unit.scale(Math.min(1, magnitude) * this.walkSpeed);
  }
}
