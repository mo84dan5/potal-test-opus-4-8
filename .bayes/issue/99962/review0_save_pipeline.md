# review0_save_pipeline

親Issue: [セーブデータの画像保存/ロード(アプリ名・保存日時つき)](./セーブデータの画像保存ロード(アプリ名・保存日時つき).md)

セーブ処理の現状を `### 関連コードPath` のファイルから事実確認する。

## src/domain/values/GameSnapshot.ts
```
1 /** セーブデータのフォーマット版(後方互換の判定に使う) */
2 export const SNAPSHOT_VERSION = 1;
3
8 export interface GameSnapshot {
9   version: number;
11   worldId: string;
13   player: { x: number; y: number; z: number; yaw: number; pitch: number };
15   flags: Record<string, boolean>;
17   completedEvents: string[];
19   props: Record<string, { x: number; z: number }>;
20 }
27 export interface SnapshotCodec {
29   encode(snapshot: GameSnapshot): string;
31   decode(code: string): GameSnapshot;
32 }
35 export function isValidSnapshot(value: unknown): value is GameSnapshot {
```
事実: `GameSnapshot` に `appName`/`savedAt` は無い。`SnapshotCodec` が文字列境界。
→ 新フィールドはここへ追加すれば、既存コーデックを通して自動的に画像へも内包される。

## src/domain/services/SaveService.ts
```
10 export class SaveService {
12   capture(session: GameSession): GameSnapshot {
20     return {
21       version: SNAPSHOT_VERSION,
22       worldId: session.currentWorldId,
23       player: { x: p.position.x, ... },
24       flags: Object.fromEntries(session.flags),
25       completedEvents: [...session.completedEvents],
26       props,
27     };
```
事実: コンストラクタ引数なし(`new SaveService()`)。capture は version/worldId/player/flags/...を返す。
→ `appName`/`Clock` をコンストラクタ注入し、capture で `appName`/`savedAt` を足す(DIP・テスト可能)。

## src/adapters/persistence/Base64JsonSnapshotCodec.ts
```
7 const PREFIX = 'PW1.';
17   encode(snapshot: GameSnapshot): string {
18     const json = JSON.stringify(snapshot);
20     return PREFIX + btoa(encodeURIComponent(json));
23   decode(code: string): GameSnapshot {
```
事実: スナップショット全体を JSON 化してエンコードする。新フィールドは変更不要で自動的に往復する。
→ 画像はこの文字列を運ぶだけ(契約不変=安全に忘れる)。

## src/main.ts(セーブ配線)
```
311 const saveService = new SaveService();
312 const snapshotCodec = new Base64JsonSnapshotCodec();
399 saveCopyBtn.addEventListener('click', () => {
400   const code = snapshotCodec.encode(saveService.capture(session));
405 saveLoadBtn.addEventListener('click', () => {
407     const snapshot = snapshotCodec.decode(saveCodeEl.value);
408     saveService.restore(session, snapshot);
```
事実: 文字列 code = `snapshotCodec.encode(saveService.capture(session))`。ロードは decode→restore。
→ 画像保存は `imageCodec.encode(code, label)`、画像読込は `snapshotCodec.decode(await imageCodec.decode(file))`。

## index.html(パネル)
```
317 <div id="save-panel">
321 <textarea id="save-code" ... placeholder="ここにセーブコードを貼り付けて「ロード」"></textarea>
323   <button id="save-copy">コピー</button>
324   <button id="save-load">ロード</button>
325   <button id="save-close">閉じる</button>
```
事実: パネルは textarea + コピー/ロード/閉じる。
→ 「画像で保存」「画像から読込」ボタン・隠し file input・プレビュー img を追加する。

## 結論
- 文字列セーブコードを境界に保てば、画像は別トランスポートの追加だけで実現できる(OCP)。
- アプリ名・保存日時は `GameSnapshot` 追加が最小・整合的(既存コーデックで自動往復)。
- 時刻は `Clock` 注入で `SaveService` の決定性・テスト容易性を保つ(DIP)。
- 記載と実コードに齟齬なし。`## 修正の提案` は不要。
