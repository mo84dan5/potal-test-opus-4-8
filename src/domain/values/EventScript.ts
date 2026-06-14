/**
 * スクリプト化イベントの1ステップ。再生は EventService が担う。
 * - say:       一定時間メッセージを表示する
 * - walkTo:    主人公を (x,z) まで自動で歩かせる(地形追従・衝突は移動処理が担当)
 * - escort:    イベントの主役NPC(タップした相手)が (x,z) まで先導して歩き、主人公はその後ろを追う
 * - actorHome: 主役NPCが元の位置(wanderCenter)へ歩いて戻る。主人公は待機(見回しのみ)
 * - moveProp:  可動プロップ(EventProp)を (toX,toZ) へ duration 秒かけて動かす
 * - wait:      一定時間待つ
 */
export type EventStep =
  | { kind: 'say'; text: string; duration: number }
  | { kind: 'walkTo'; x: number; z: number }
  | { kind: 'escort'; x: number; z: number }
  | { kind: 'actorHome' }
  | { kind: 'moveProp'; propId: string; toX: number; toZ: number; duration: number }
  | { kind: 'wait'; duration: number };

/** イベント定義(ステップ列)。Interactable に持たせ、タップで開始する */
export interface GameEvent {
  readonly id: string;
  readonly steps: readonly EventStep[];
  /** true なら一度きり。完了後は再開せず、対象の通常会話(dialogue)に切り替わる */
  readonly once?: boolean;
}

/** 進行中イベントの状態(現ステップ・経過時間・moveProp の開始位置を保持) */
export class ActiveEvent {
  index = 0;
  elapsed = 0;
  /** moveProp ステップ開始時のプロップ位置(補間の起点)。ステップ遷移でリセット */
  propFromX: number | null = null;
  propFromZ: number | null = null;

  constructor(public readonly event: GameEvent) {}

  get step(): EventStep {
    return this.event.steps[this.index];
  }

  get done(): boolean {
    return this.index >= this.event.steps.length;
  }

  /** 次のステップへ進める */
  next(): void {
    this.index += 1;
    this.elapsed = 0;
    this.propFromX = null;
    this.propFromZ = null;
  }
}
