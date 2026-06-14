import { DialogueSession } from '../../domain/entities/DialogueSession';
import { GameSession } from '../../domain/entities/GameSession';
import { Npc } from '../../domain/entities/Npc';
import { InteractionService } from '../../domain/services/InteractionService';
import { PortalTraversalService } from '../../domain/services/PortalTraversalService';
import { ActiveEvent } from '../../domain/values/EventScript';

/** 扉タップ入室時に、接続先の扉の正面(室内側)へ立たせる距離 [m] */
export const DOOR_ENTRY_OFFSET = 1.6;

/**
 * タップ操作のインタラクション。
 * - ウィンドウ表示中: コメントを送り(最後なら閉じる)
 * - 前方コーン内・近接の扉: 室内ワールドへ入室(placeInFrontOf で接続先扉の正面へ)
 * - 前方コーン内・近接のオブジェクト: メッセージウィンドウを開く
 */
export class TapInteractUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly interaction: InteractionService,
    /** タップでウィンドウを開ける/扉に入れる最大距離 [m] */
    private readonly interactRange = 3.5,
    /** 前方とみなすコーンの内積しきい値(cos60°=0.5 で前方±60°) */
    private readonly frontMinDot = 0.5,
    private readonly traversal: PortalTraversalService = new PortalTraversalService(),
  ) {}

  /** このタップでワールドが変わったか(扉入室)を返す */
  execute(): boolean {
    if (this.session.dialogue) {
      if (!this.session.dialogue.advance()) {
        this.session.dialogue = null;
        this.session.dialogueSpeaker = null;
      }
      return false;
    }

    const target = this.interaction.nearestInFrontWithin(
      this.session.player.position,
      this.session.player.forward,
      // 会話できる対象(コメントあり)・扉(doorPortalId)・イベント(event)をタップ候補にする
      this.session.currentWorld.interactables.filter(
        (i) => i.dialogue.length > 0 || i.doorPortalId !== null || i.event !== null,
      ),
      this.interactRange,
      this.frontMinDot,
    );
    if (!target) return false;

    // once イベントが完了済みなら開始せず、通常会話(dialogue)へ切り替える
    const eventAvailable =
      target.event !== null &&
      !(target.event.once && this.session.completedEvents.has(target.event.id));
    if (eventAvailable) {
      // イベント開始(以降のフレームで EventService が進行。操作は見回しのみに制限される)
      this.session.activeEvent = new ActiveEvent(target.event!);
      this.session.eventActor = target instanceof Npc ? target : null; // 先導・帰宅する主役
      this.session.eventMessage = null;
      return false;
    }

    if (target.doorPortalId !== null) {
      return this.enterDoor(target.doorPortalId);
    }

    if (target.dialogue.length > 0) {
      this.session.dialogue = new DialogueSession(target.dialogue);
      this.session.dialogueSpeaker = target;
    }
    return false;
  }

  /** 扉から接続先ワールドへ入室する */
  private enterDoor(doorPortalId: string): boolean {
    const portal = this.session.currentWorld.getPortal(doorPortalId);
    const dest = this.session.getWorld(portal.targetWorldId);
    const toPortal = dest.getPortal(portal.targetPortalId);

    this.traversal.placeInFrontOf(this.session.player, toPortal, DOOR_ENTRY_OFFSET);
    // 接続先の地形へ足元をスナップ
    const p = this.session.player.position;
    this.session.player.position = p.withY(dest.terrain.heightAt(p.x, p.z));
    this.session.moveToWorld(dest.id);
    return true;
  }
}
