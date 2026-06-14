# review0_savable_state — 事実確認

親Issue: [セーブロード機能(文字列コード)の設計と実装.md](./セーブロード機能(文字列コード)の設計と実装.md)

## 確認1: セーブ対象の状態は GameSession に集約されている

src/domain/entities/GameSession.ts
```
   public activeEvent: ActiveEvent | null = null;
   public eventMessage: string | null = null;
   public eventActor: Npc | null = null;
   /** 完了したイベントのID集合(once イベントの再開抑止・条件評価に使う) */
   public readonly completedEvents = new Set<string>();
   /** ゲーム進行フラグ(イベントの分岐・出現条件に使う) */
   public readonly flags = new Map<string, boolean>();
   ...
   public currentWorldId: string,
   public readonly player: Player,
```
→ 永続化すべきは `flags` / `completedEvents` / `currentWorldId` / `player(姿勢)`。
進行中の `activeEvent`/`dialogue` は一時状態なのでロード時に解除する。

## 確認2: プレイヤー姿勢のフィールド

src/domain/entities/Player.ts
```
   constructor(
     public position: Vec3,
     public velocity: Vec3,
     public yaw: number,
     public pitch: number,
```
→ 位置(x,y,z)・yaw・pitch を保存/復元する。velocity/desiredVelocity/airborne 等は復元時に初期化。

## 確認3: 可動プロップの位置はイベント結果の状態(保存しないと不整合)

src/domain/entities/EventProp.ts
```
   export class EventProp {
     constructor(
       public readonly id: string,
       public position: Vec3,
       public readonly radius: number,
       public readonly size: number,
     ) {}
```
src/domain/services/EventService.ts(moveProp で position を動かす)
```
       prop.position = new Vec3(
         active.propFromX + (step.toX - active.propFromX) * ease,
         prop.position.y,
         active.propFromZ! + (step.toZ - active.propFromZ!) * ease,
       );
```
→ 「岩をどかした」結果は `prop.position`。completedEvents だけ復元して位置を戻さないと不整合になるため、
`props(id→x,z)` も保存・復元する。

## 確認4: 文字列化の手段(base64)はプラットフォーム寄り → domain に置かない

- `btoa`/`atob` は Web/Node のグローバル(DOM ノードではないが「実装」)。domain は three.js/DOM 非依存方針
  ([[solid-clean-architecture]])のため、文字列化の具象はアダプタへ。domain は `SnapshotCodec` ポート(IF)のみ持つ(DIP)。

## 結論(設計確定 / SOLID・クリーンアーキ)

| 層 | 追加 | 責務 |
| --- | --- | --- |
| domain/values | `GameSnapshot` / `SnapshotCodec`(ポート) | 保存データの形と「snapshot⇄string」契約 |
| domain/services | `SaveService` | capture(session)→snapshot / restore(session,snapshot) |
| adapter/persistence | `Base64JsonSnapshotCodec` | ポート実装(JSON+base64)。将来の画像形式は別アダプタで同じ文字列を運ぶ |
| main/index.html | セーブ/ロードパネル | クリップボード(コピー/貼り付け)。イベント中は無効 |
