import { GameSession } from '../../domain/entities/GameSession';
import { MovementService } from '../../domain/services/MovementService';

export interface DashInput {
  /** はじいたスクリーン水平移動量 [px](右が正) */
  dx: number;
  /** はじいたスクリーン垂直移動量 [px](下が正) */
  dy: number;
}

/** はじき(フリック)を視点基準のダッシュインパルスへ変換するユースケース */
export class ApplyDashUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly movement: MovementService,
    /** スワイプ長[px] → 速度[m/s] の変換係数 */
    private readonly gain = 0.05,
  ) {}

  execute(input: DashInput): void {
    const magnitude = Math.hypot(input.dx, input.dy);
    if (magnitude === 0) return;

    const player = this.session.player;
    // 上はじき(dy<0)= 前方ダッシュ、右はじき(dx>0)= 右ダッシュ
    const direction = player.right
      .scale(input.dx)
      .add(player.forward.scale(-input.dy));
    this.movement.applyImpulse(player, direction, magnitude * this.gain);
  }
}
