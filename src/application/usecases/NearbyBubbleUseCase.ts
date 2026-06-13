import { GameSession } from '../../domain/entities/GameSession';
import { Interactable } from '../../domain/entities/Interactable';
import { InteractionService } from '../../domain/services/InteractionService';

/**
 * 接近吹き出しの対象を決めるユースケース。
 * 吹き出し文を持つオブジェクトのうち、bubbleRange 以内で最も近いものを返す。
 * メッセージウィンドウ表示中は吹き出しを出さない。
 */
export class NearbyBubbleUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly interaction: InteractionService,
    /** 吹き出しが出る最大距離 [m] */
    private readonly bubbleRange = 5,
  ) {}

  execute(): Interactable | null {
    if (this.session.dialogue) return null;
    return this.interaction.nearestWithin(
      this.session.player.position,
      this.session.currentWorld.interactables.filter((i) => i.bubbleText !== null),
      this.bubbleRange,
    );
  }
}
