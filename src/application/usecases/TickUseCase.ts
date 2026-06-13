import { GameSession } from '../../domain/entities/GameSession';
import { Npc } from '../../domain/entities/Npc';
import { Vec3 } from '../../domain/values/Vec3';
import { CollisionService } from '../../domain/services/CollisionService';
import { MovementService } from '../../domain/services/MovementService';
import { NpcWanderService } from '../../domain/services/NpcWanderService';
import { PortalTraversalService } from '../../domain/services/PortalTraversalService';

export interface TickResult {
  /** このフレームでポータルを通過したか */
  traversed: boolean;
}

/** 1フレーム分のゲーム状態更新(移動+衝突解決+NPC徘徊+ポータル通過判定)を行うユースケース */
export class TickUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly movement: MovementService,
    private readonly traversal: PortalTraversalService,
    private readonly collision: CollisionService = new CollisionService(),
    private readonly npcWander: NpcWanderService = new NpcWanderService(),
    /** 会話中にこれ以上離れるとウィンドウを自動で閉じる距離 [m] */
    private readonly dialogueBreakRange = 6.5,
  ) {}

  execute(dt: number): TickResult {
    const player = this.session.player;
    const currentWorld = this.session.currentWorld;
    const before = player.position;

    this.movement.tick(player, dt, currentWorld.terrain);
    // 押し出し後の位置でポータル判定する(押し戻されたフレームの誤通過を防ぐ)
    this.collision.resolve(player, currentWorld.colliders);
    // 押し出しで足元がずれた場合も地形へ再スナップ
    player.position = player.position.withY(
      currentWorld.terrain.heightAt(player.position.x, player.position.z),
    );

    // 全ワールドのNPCを徘徊させる(ポータル越しに見えるNPCも動く)。
    // 話しかけられている相手は立ち止まる
    for (const world of this.session.allWorlds) {
      for (const npc of world.npcs) {
        if (npc === this.session.dialogueSpeaker) continue;
        this.npcWander.tick(npc, dt, world.colliders, world.terrain);
      }
    }

    this.maintainDialogue();

    return this.checkPortals(before);
  }

  /**
   * 会話の維持処理:
   * 1. 相手がNPCなら常にプレイヤーの方を向く
   * 2. 相手から一定距離を超えて離れたらウィンドウを自動で閉じる
   */
  private maintainDialogue(): void {
    const speaker = this.session.dialogueSpeaker;
    if (!this.session.dialogue || !speaker) return;

    const player = this.session.player;
    const dx = player.position.x - speaker.position.x;
    const dz = player.position.z - speaker.position.z;

    if (Math.hypot(dx, dz) > this.dialogueBreakRange) {
      this.session.dialogue = null;
      this.session.dialogueSpeaker = null;
      return;
    }

    if (speaker instanceof Npc) {
      // forward = (-sin yaw, -cos yaw) がプレイヤー方向を向く yaw
      speaker.yaw = Math.atan2(-dx, -dz);
    }
  }

  private checkPortals(before: Vec3): TickResult {
    const player = this.session.player;
    for (const portal of this.session.currentWorld.portals) {
      if (!this.traversal.hasCrossed(portal, before, player.position)) continue;
      const dest = this.session.getWorld(portal.targetWorldId);
      this.traversal.traverse(player, portal, dest.getPortal(portal.targetPortalId));
      this.session.moveToWorld(dest.id);
      return { traversed: true };
    }
    return { traversed: false };
  }
}
