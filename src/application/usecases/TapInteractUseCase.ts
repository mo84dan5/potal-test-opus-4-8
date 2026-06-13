import { DialogueSession } from '../../domain/entities/DialogueSession';
import { GameSession } from '../../domain/entities/GameSession';
import { InteractionService } from '../../domain/services/InteractionService';

/**
 * タップ操作のインタラクション。
 * ウィンドウ表示中ならコメントを送り(最後なら閉じる)、
 * 非表示なら前方コーン内かつ近く(interactRange 以内)のオブジェクトのウィンドウを開く。
 */
export class TapInteractUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly interaction: InteractionService,
    /** タップでウィンドウを開ける最大距離 [m] */
    private readonly interactRange = 3.5,
    /** 前方とみなすコーンの内積しきい値(cos60°=0.5 で前方±60°) */
    private readonly frontMinDot = 0.5,
  ) {}

  execute(): void {
    if (this.session.dialogue) {
      if (!this.session.dialogue.advance()) {
        this.session.dialogue = null;
        this.session.dialogueSpeaker = null;
      }
      return;
    }

    const target = this.interaction.nearestInFrontWithin(
      this.session.player.position,
      this.session.player.forward,
      this.session.currentWorld.interactables.filter((i) => i.dialogue.length > 0),
      this.interactRange,
      this.frontMinDot,
    );
    if (target) {
      this.session.dialogue = new DialogueSession(target.dialogue);
      this.session.dialogueSpeaker = target;
    }
  }
}
