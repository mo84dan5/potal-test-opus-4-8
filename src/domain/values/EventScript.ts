/**
 * ゲーム状態(フラグ・完了イベント)を参照する条件式(データ駆動・直列化可能)。
 * 複雑なイベント分岐(フラグで動きが変わる等)を表現する。評価は `evaluateCondition`。
 * - flag:      flags[flag] が value(既定 true)と一致するか
 * - eventDone: そのイベントが完了済みか
 * - not/and/or: 論理結合
 */
export type EventCondition =
  | { kind: 'flag'; flag: string; value?: boolean }
  | { kind: 'eventDone'; eventId: string }
  | { kind: 'not'; cond: EventCondition }
  | { kind: 'and'; conds: readonly EventCondition[] }
  | { kind: 'or'; conds: readonly EventCondition[] };

/** 条件評価に必要な最小の状態(GameSession がこの形を満たす。DIP のため具象に依存しない) */
export interface EventState {
  readonly flags: ReadonlyMap<string, boolean>;
  readonly completedEvents: ReadonlySet<string>;
}

/** 条件式を評価する純粋関数 */
export function evaluateCondition(cond: EventCondition, state: EventState): boolean {
  switch (cond.kind) {
    case 'flag':
      return (state.flags.get(cond.flag) ?? false) === (cond.value ?? true);
    case 'eventDone':
      return state.completedEvents.has(cond.eventId);
    case 'not':
      return !evaluateCondition(cond.cond, state);
    case 'and':
      return cond.conds.every((c) => evaluateCondition(c, state));
    case 'or':
      return cond.conds.some((c) => evaluateCondition(c, state));
  }
}

/**
 * スクリプト化イベントの1ステップ本体。再生は EventService が担う。
 * - say:       一定時間メッセージを表示する
 * - walkTo:    主人公を (x,z) まで自動で歩かせる(地形追従・衝突は移動処理が担当)
 * - escort:    イベントの主役NPC(タップした相手)が (x,z) まで先導して歩き、主人公はその後ろを追う
 * - actorHome: 主役NPCが元の位置(wanderCenter)へ歩いて戻る。主人公は待機(見回しのみ)
 * - moveProp:  可動プロップ(EventProp)を (toX,toZ) へ duration 秒かけて動かす
 * - wait:      一定時間待つ
 * - setFlag:   フラグを立てる/下ろす(分岐や進行状況の記録に使う)
 */
export type EventStepBody =
  | { kind: 'say'; text: string; duration: number }
  | { kind: 'walkTo'; x: number; z: number }
  | { kind: 'escort'; x: number; z: number }
  | { kind: 'actorHome' }
  | { kind: 'moveProp'; propId: string; toX: number; toZ: number; duration: number }
  | { kind: 'wait'; duration: number }
  | { kind: 'setFlag'; flag: string; value?: boolean };

/**
 * イベントのステップ。`when` を付けると、その条件が偽のときステップはスキップされる。
 * フラグ等による分岐(同じイベント内で動きを変える)を表現できる。
 */
export type EventStep = EventStepBody & { when?: EventCondition };

/** イベント定義(ステップ列)。Interactable に持たせ、タップで開始する */
export interface GameEvent {
  readonly id: string;
  readonly steps: readonly EventStep[];
  /** true なら一度きり。完了後は再開せず、対象の通常会話(dialogue)に切り替わる */
  readonly once?: boolean;
  /** 開始可能条件(満たさなければ開始しない)。フラグ等でイベントの出現を制御する */
  readonly available?: EventCondition;
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
