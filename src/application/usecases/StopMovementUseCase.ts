import { GameSession } from '../../domain/entities/GameSession';
import { MovementService } from '../../domain/services/MovementService';

/**
 * 仮想パッドを離した瞬間に慣性なしで停止させるユースケース。
 * はじき(ダッシュ)はこの停止の後にインパルスが適用されるため勢いが残る。
 */
export class StopMovementUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly movement: MovementService,
  ) {}

  execute(): void {
    this.movement.halt(this.session.player);
  }
}
