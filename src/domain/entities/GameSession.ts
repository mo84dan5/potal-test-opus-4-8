import { DialogueSession } from './DialogueSession';
import { Interactable } from './Interactable';
import { Npc } from './Npc';
import { Player } from './Player';
import { World } from './World';
import { ActiveEvent } from '../values/EventScript';
import { BattleSession } from './BattleSession';
import { ChoicePrompt } from '../values/Choice';

/** ゲーム全体の状態を束ねる集約ルート */
export class GameSession {
  /** 表示中のメッセージウィンドウ。null なら非表示 */
  public dialogue: DialogueSession | null = null;
  /** 会話中の相手(NPCなら徘徊を停止する)。ウィンドウを閉じたら null */
  public dialogueSpeaker: Interactable | null = null;
  /** 進行中のイベント。null なら通常操作。進行中は見回し以外の操作を止める */
  public activeEvent: ActiveEvent | null = null;
  /** イベント中に表示するメッセージ。null なら非表示 */
  public eventMessage: string | null = null;
  /** イベントの主役NPC(タップした相手)。escort/actorHome で先導・帰宅する */
  public eventActor: Npc | null = null;
  /** 完了したイベントのID集合(once イベントの再開抑止・条件評価に使う) */
  public readonly completedEvents = new Set<string>();
  /** ゲーム進行フラグ(イベントの分岐・出現条件に使う) */
  public readonly flags = new Map<string, boolean>();
  /** 提示中の選択肢(はい/いいえ等)。null なら非表示。選択待ちは操作をロックする */
  public choice: ChoicePrompt | null = null;
  /** 進行中の戦闘。null なら通常。進行中は世界を凍結し戦闘オーバーレイを表示する */
  public activeBattle: BattleSession | null = null;

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
