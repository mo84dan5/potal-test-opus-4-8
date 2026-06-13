# issue-worker: `静止NPCの追加と会話中の停止 #99986`

## issue-worker

## 静止NPCの追加と会話中の停止

### 関連コードPath
| id | file_path | 概要 | 貢献度(初期値=0) |
| --- | --- | --- | --- |
| 0 | src/config/worldContent.ts | L60 `npc?: NpcSpec`(1ワールド1人)。複数NPC(npcs配列)+静止指定へ拡張 | 1 |
| 1 | src/domain/entities/GameSession.ts | L8 dialogue 保持。会話相手(dialogueSpeaker)の追加先 | 1 |
| 2 | src/application/usecases/TickUseCase.ts | L32-33 NPC徘徊更新。会話相手スキップの組込み先 | 1 |
| 3 | src/application/usecases/TapInteractUseCase.ts | 会話の開始/終了。dialogueSpeaker の設定/解除先 | 0 |
| 4 | src/domain/services/NpcWanderService.ts | 徘徊。wanderRadius=0(静止)の早期return追加 | 0 |
| 5 | src/adapters/rendering/ThreeRendererAdapter.ts | L207 NPC色の参照が単一npc前提。配列対応 | 1 |
| 6 | src/main.ts | NPC構築の複数化と静止NPCの初期向き | 0 |

### ソースコードを参照した事実確認チェックルール
> **⚠️ 必須実行ルール**
> 各セクションで「参考ソース」または「ソースコード参照」が指定されている場合、**必ず本チェックルールを実行してからドキュメント作成・編集を行うこと**。
> reviewファイルを作成せずにドキュメントを直接編集することは禁止する。
(手順は issue #99998 と同一。reviewファイルは `.bayes/issue/99986/review[連番]_[確認ファイル名].md`)

## Issue Workerの計画

### [o] セクション0 このIssueで何をやりたいかをこのセクションに詳細を書く。

#### 元の依頼文
> NPCは動かないやつも追加してください。さらに話しかけてる間、動いてるNPCも話しかけてる間は動かないようにしてください。デプロイまで一気通貫で実施してください

#### やりたいことの詳細
1. **静止NPCの追加**: 各ワールドに「その場に立っている」NPCを1人追加する(`wanderRadius: 0` で静止指定)。
   - 昼=門番、夜=星読み、雪=旅商人、遺跡=学者。それぞれ吹き出し+タップで3コメントの会話。
   - 静止NPCは広場の中心を向いて立つ。タップ会話・吹き出し・当たり判定は徘徊NPCと同じ機構。
2. **会話中は動かない**: メッセージウィンドウで話しかけている相手のNPCは、会話が開いている間は徘徊を停止する(閉じると再開)。
   - GameSession に会話相手(dialogueSpeaker)を保持し、TapInteract が開始時に設定・終了時に解除。TickUseCase は会話相手のNPCの徘徊更新をスキップ。
3. worldContent の `npc?: NpcSpec` を `npcs: NpcSpec[]` に一般化(1ワールド複数NPC)。
4. テスト・ビルド・GitHub Pages 公開・配信確認まで一気通貫。

#### 完了条件(Definition of Done)
- [ ] 各ワールドに静止NPCが1人追加され、会話できる
- [ ] 徘徊NPCに話しかけている間は立ち止まり、会話を閉じると再開する
- [ ] 静止・会話停止のロジックがテストで担保されている
- [ ] 仕様書(FN-007 / 機能一覧 / SCR-001)更新
- [ ] テスト全件成功・ビルド成功・GitHub Pages で公開確認

### [o] セクション1 `### 関連コードPath` を作成する
#### 結果
- 単一NPC前提の箇所(worldContent L60、レンダラ L207)と会話状態の保持・更新箇所を id 0〜6 として登録。

### [o] セクション2 作成予定ファイル、削除予定ファイル一覧を作成する

#### 編集予定ファイル一覧
| file_path | 編集内容 |
| --- | --- |
| src/config/worldContent.ts | npc → npcs: NpcSpec[](wanderRadius 0=静止)。静止NPC4人を追加 |
| src/domain/entities/GameSession.ts | dialogueSpeaker: Interactable \| null を追加 |
| src/application/usecases/TapInteractUseCase.ts | 開始時に speaker 設定、終了時に解除 |
| src/application/usecases/TickUseCase.ts | 会話相手のNPCをスキップ |
| src/domain/services/NpcWanderService.ts | wanderRadius<=0 は何もしない |
| src/adapters/rendering/ThreeRendererAdapter.ts | NPC色を npcs[i] から取得 |
| src/main.ts | npcs 配列構築+静止NPCは中心を向く初期yaw |
| 各テスト(TickUseCase / NpcWanderService / TapInteract) | 静止・会話停止のテスト追加 |
| .bayes/spec/機能仕様書/FN-007_案内NPC.md ほか | 静止NPC・会話中停止を記載 |

#### 作成予定ファイル一覧
なし

#### 削除予定ファイル一覧
なし

### [o] セクション3 残りのセクションを作成する。

### [o] セクション4 事実確認と実装・仕様書更新

#### 方針
- review1 で単一NPC前提箇所と会話状態を確認後、domain → application → config → renderer → main → 仕様書の順で実施。

#### 結果
- review1_NPC単一前提と会話状態の確認.md を作成(id 0,1,2,5 貢献度+1)。
- GameSession に dialogueSpeaker を追加。TapInteract が会話開始時に設定・終了時に解除。TickUseCase は会話相手のNPCの徘徊更新をスキップ。
- NpcWanderService に wanderRadius<=0 の早期return(静止NPC)。
- worldContent: npc → npcs 配列に一般化し、静止NPC4人(門番・星読み・旅商人・学者、各3コメント)を追加。
- main: npcs 配列構築(個体別シード)。静止NPCは広場中心を向く初期yaw。レンダラは npcs[i] から服色取得。
- 仕様書: FN-007(静止NPC・会話中停止・NPC表を2人体制に)、機能一覧、SCR-001 を更新。

### ソースコードを参照した事実確認
- [x] チェックルールに則ってreviewファイル作成(review1_NPC単一前提と会話状態の確認.md)
- [x] ソースコードを参照した事実確認を実行

### [o] セクション5 テスト・ビルド・デプロイ・公開URL確認

#### 方針
- `rtk npm test` → `rtk npm run build` → commit → push → Actions 完了待ち → 公開URLで新バンドル配信確認。

#### 結果
- テスト**81件全て成功**(静止NPC不動 1件、会話中停止→再開 1件、dialogueSpeaker 設定/解除 1件を追加)。ビルド成功(JS 511.25kB)。
- commit「静止NPCを追加し、会話中はNPCが立ち止まるよう変更」(1085294)を push、Actions 成功。
- 公開URLで新バンドル `assets/index-CZbyUnVo.js`(200 / 511,245 bytes、ローカルと一致)を確認。バンドル内に「門番」「星読み」「旅商人」「学者」の文言を確認。

#### 完了条件の検証
- [x] 各ワールドに静止NPCが1人追加され、会話できる(既存FN-005機構で動作、静止はテストで担保)
- [x] 徘徊NPCに話しかけている間は立ち止まり、会話を閉じると再開する(テストで担保)
- [x] 静止・会話停止のロジックがテストで担保されている(3件追加)
- [x] 仕様書(FN-007 / 機能一覧 / SCR-001)更新
- [x] テスト全件成功・ビルド成功・GitHub Pages で公開確認

## ステータス: ✅ 完了(2026-06-13)
公開URL: https://mo84dan5.github.io/potal-test-fable-05/
