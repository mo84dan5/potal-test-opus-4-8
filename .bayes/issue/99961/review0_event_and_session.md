# review0_event_and_session

親Issue: [戦闘イベント](./戦闘イベント.md)

戦闘イベントの seam を決めるため、既存のイベント機構・集約・タップ会話を事実確認する。

## src/domain/entities/GameSession.ts(一時状態の置き場)
```
9 export class GameSession {
11   public dialogue: DialogueSession | null = null;
13   public dialogueSpeaker: Interactable | null = null;
15   public activeEvent: ActiveEvent | null = null;
17   public eventMessage: string | null = null;
19   public eventActor: Npc | null = null;
21   public readonly completedEvents = new Set<string>();
23   public readonly flags = new Map<string, boolean>();
```
事実: 一時状態(dialogue/activeEvent/eventMessage/eventActor)は集約のフィールドとして並ぶ。
→ 戦闘も同様に `activeBattle: BattleSession | null` と `choice: ChoicePrompt | null` を足すのが自然。
進捗は `completedEvents`/`flags`。戦闘がこれらに触れなければ「進捗・フラグ不変」が保証される。

## src/domain/values/EventScript.ts(既存イベントはワールド内スクリプト)
```
47 export type EventStepBody =
48   | { kind: 'say'; text: string; duration: number }
49   | { kind: 'walkTo'; x: number; z: number }
50   | { kind: 'escort'; x: number; z: number }
54   | { kind: 'setFlag'; flag: string; value?: boolean };
```
事実: 既存イベントは「ワールド内の自動移動・プロップ移動」を線形に再生する仕組み。
→ 多画面・選択分岐を伴う戦闘をここへ詰めるのは責務違反。戦闘は別ドメインに分離する(SRP)。

## src/application/usecases/TapInteractUseCase.ts(会話送り)
```
29   execute(): boolean {
30     if (this.session.dialogue) {
31       if (!this.session.dialogue.advance()) {
32         this.session.dialogue = null;
33         this.session.dialogueSpeaker = null;
34       }
35       return false;
36     }
```
事実: 会話表示中のタップは `advance()`。最後まで行くと dialogue/speaker を null にして閉じる。
→ ここで「閉じる」直前に話者の `choiceOnEnd` があれば `session.choice` に積む。会話の最後で選択肢提示。

## src/domain/entities/Interactable.ts(タップ対象)
```
9 export class Interactable {
10   constructor(
16     public readonly dialogue: readonly string[],
22     public readonly doorPortalId: string | null = null,
24     public readonly event: GameEvent | null = null,
25   ) {}
```
事実: 末尾に任意パラメータ(doorPortalId/event)を足す方式。
→ 同様に `choiceOnEnd: ChoicePrompt | null = null` を末尾に追加。Npc も super へ引き渡す。

## src/config/worldContent.ts(NPC/イベント定義)
```
49 export interface NpcSpec {
63   /** タップで開始するイベントのID(EVENTS のキー) */
64   eventId?: string;
65 }
571 export const EVENTS: Record<string, GameEvent> = {
```
事実: NpcSpec に `eventId?`、`EVENTS` レジストリ。main の buildWorld が `EVENTS[spec.eventId]` を渡す。
→ `NpcSpec.battleId?` と `BATTLES: Record<string, BattleDefinition>` を同様に足し、
buildWorld で battleId のとき choiceOnEnd を生成して Npc に渡す。

## src/main.ts(ループ・入力ロック)
```
462 const inputLocked = (): boolean => session.activeEvent !== null || savePanelOpen;
525   if (session.activeEvent) {
527     eventService.tick(session, dt);
528   } else if (!savePanelOpen) {
529     applyStick.execute(stickInput.getStick());
```
事実: 入力ロックとループ分岐は activeEvent/savePanelOpen を見ている。
→ ここに `session.activeBattle`/`session.choice` を加える(戦闘/選択中は世界を凍結・操作ロック)。

## 結論
- 戦闘は副作用ゼロの独立ドメインにし、集約 seam は activeBattle/choice の2つに留める。
- 「進捗・フラグ不変」は BattleService がワールド状態に触れない設計で構造的に担保。
- 選択肢は汎用化(ChoicePrompt)し戦闘解釈はアプリ層へ(ドメインは戦闘非依存)。
- 既存記載と実コードに齟齬なし。`## 修正の提案` は不要。
