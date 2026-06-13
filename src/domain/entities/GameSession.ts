import { DialogueSession } from './DialogueSession';
import { Interactable } from './Interactable';
import { Player } from './Player';
import { World } from './World';

/** ゲーム全体の状態を束ねる集約ルート */
export class GameSession {
  /** 表示中のメッセージウィンドウ。null なら非表示 */
  public dialogue: DialogueSession | null = null;
  /** 会話中の相手(NPCなら徘徊を停止する)。ウィンドウを閉じたら null */
  public dialogueSpeaker: Interactable | null = null;

  private readonly worlds: Map<string, World>;

  constructor(
    worlds: World[],
    public currentWorldId: string,
    public readonly player: Player,
  ) {
    this.worlds = new Map(worlds.map((w) => [w.id, w]));
    if (!this.worlds.has(currentWorldId)) {
      throw new Error(`unknown world: ${currentWorldId}`);
    }
  }

  get currentWorld(): World {
    return this.getWorld(this.currentWorldId);
  }

  get allWorlds(): World[] {
    return [...this.worlds.values()];
  }

  getWorld(id: string): World {
    const world = this.worlds.get(id);
    if (!world) throw new Error(`unknown world: ${id}`);
    return world;
  }

  moveToWorld(id: string): void {
    this.getWorld(id); // 存在チェック
    this.currentWorldId = id;
  }
}
