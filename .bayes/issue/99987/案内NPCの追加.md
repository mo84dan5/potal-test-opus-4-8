# issue-worker: `案内NPCの追加 #99987`

## issue-worker

## 案内NPCの追加

### 関連コードPath
| id | file_path | 概要 | 貢献度(初期値=0) |
| --- | --- | --- | --- |
| 0 | src/domain/entities/Interactable.ts | L11 position が readonly。動くNPCを既存インタラクション機構に乗せるため可変化する対象 | 1 |
| 1 | src/application/usecases/TickUseCase.ts | フレーム更新。NPCの徘徊更新の組込み先 | 1 |
| 2 | src/domain/entities/World.ts | npcs 一覧の追加先 | 0 |
| 3 | src/config/worldContent.ts | ワールド定義。NPCのスポーン位置・台詞の追加先 | 0 |
| 4 | src/adapters/rendering/ThreeRendererAdapter.ts | NPCメッシュの構築と毎フレームの位置反映 | 0 |
| 5 | src/main.ts | NPC構築(インタラクタブル・コライダー登録含む) | 0 |
| 6 | src/application/usecases/TapInteractUseCase.ts | 既存のタップ会話(変更不要の見込み。NPCはInteractableのサブクラスとして自然に対象になる) | 1 |

### ソースコードを参照した事実確認チェックルール
> **⚠️ 必須実行ルール**
> 各セクションで「参考ソース」または「ソースコード参照」が指定されている場合、**必ず本チェックルールを実行してからドキュメント作成・編集を行うこと**。
> reviewファイルを作成せずにドキュメントを直接編集することは禁止する。
(手順は issue #99998 と同一。reviewファイルは `.bayes/issue/99987/review[連番]_[確認ファイル名].md`)

## Issue Workerの計画

### [o] セクション0 このIssueで何をやりたいかをこのセクションに詳細を書く。

#### 元の依頼文
> ぶらぶら歩いている人を作って、世界の説明をさせてください。デプロイまで一気通貫で実施してください。

#### やりたいことの詳細
1. **案内人NPC**: 各ワールドに1人ずつ、ぶらぶら歩き回る人型NPC(案内人)を置く。
   - 徘徊: スポーン地点を中心とした円内のランダムな目的地へ歩き(約1.1m/s)、着いたら少し立ち止まってまた歩き出す。シード付き擬似乱数で決定的。
   - 障害物に重なったら押し出し(オブジェクトにめり込まない)。プレイヤーからもNPCに当たり判定(すり抜け不可)。
2. **世界の説明**: 近づくと吹き出し「こんにちは!」、タップするとメッセージウィンドウでそのワールドの説明(3コメント程度: 世界の紹介・見どころ・ポータルの行き先)をしてくれる。既存のFN-005機構(吹き出し+コメント送り)を流用する。
3. **設計**: NPCは「動くInteractable」としてドメインに追加(Interactable.position を可変化し Npc がサブクラス化)。徘徊は NpcWanderService(ドメインサービス)。見た目(胴体+頭の人型、ワールドごとの色)はレンダラが担当。
4. テスト・ビルド・GitHub Pages 公開・配信確認まで一気通貫。

#### 完了条件(Definition of Done)
- [ ] 各ワールドに歩き回るNPCがいる(立ち止まり・再出発を繰り返す)
- [ ] NPCに近づくと吹き出し、タップで世界の説明(複数コメント→閉じる)が出る
- [ ] 徘徊ロジック(目的地到達・休止・範囲内・押し出し)がテストで担保されている
- [ ] 仕様書(機能一覧 / FN-007新規 / SCR-001)更新
- [ ] テスト全件成功・ビルド成功・GitHub Pages で公開確認

### [o] セクション1 `### 関連コードPath` を作成する
#### 結果
- Interactable の readonly position(L11)、TickUseCase の更新フロー、World/worldContent/レンダラ/main の拡張箇所を id 0〜6 として登録。

### [o] セクション2 作成予定ファイル、削除予定ファイル一覧を作成する

#### 編集予定ファイル一覧
| file_path | 編集内容 |
| --- | --- |
| src/domain/entities/Interactable.ts | position を可変化(NPCが動けるように) |
| src/domain/entities/World.ts | npcs: readonly Npc[] を追加(デフォルト[]) |
| src/application/usecases/TickUseCase.ts | 全ワールドのNPC徘徊更新を組込み |
| src/config/worldContent.ts | WorldDef に npc(スポーン・色・台詞)を追加 |
| src/adapters/rendering/ThreeRendererAdapter.ts | 人型メッシュ構築+毎フレーム位置・向き反映 |
| src/main.ts | Npc構築(interactables / colliders / npcs へ登録) |
| .bayes/spec/機能一覧.md / 機能仕様書/index.md / SCR-001 | FN-007 追加 |

#### 作成予定ファイル一覧
| file_path | 内容 |
| --- | --- |
| src/domain/entities/Npc.ts | 動くInteractable(徘徊状態・コライダー保持) |
| src/domain/services/NpcWanderService.ts | 徘徊更新(目的地選択・歩行・休止・押し出し) |
| src/domain/services/NpcWanderService.test.ts | 徘徊のテスト |
| src/application/usecases/TapInteractUseCase.test.ts(追記) | NPCタップで説明が開くテスト |
| .bayes/spec/機能仕様書/FN-007_案内NPC.md | 機能仕様書 |

#### 削除予定ファイル一覧
なし

### [o] セクション3 残りのセクションを作成する。

### [o] セクション4 事実確認と実装・仕様書更新

#### 方針
- review1 で対象実装を確認後、domain(Npc/WanderService)→ TickUseCase → config → renderer → main → 仕様書の順で実施。

#### 結果
- review1_NPC組込み箇所の確認.md を作成(id 0,1,6 貢献度+1)。TapInteract/NearbyBubble はNPCをサブクラスとして自然に扱えるため変更不要と確定。
- domain: Interactable.position を可変化。Npc(動くInteractable、徘徊状態+追従コライダー半径0.45)、NpcWanderService(目的地徘徊1.1m/s・休止1〜3.5s・障害物押し出し・自己コライダー除外・シード付き決定的)を新設。World に npcs 追加。
- TickUseCase: 全ワールドのNPCを毎フレーム更新(ポータル越しの姿も動く)。
- config: WorldDef.npc(4ワールド分のスポーン・服色・挨拶・世界説明3コメント)。
- renderer: buildNpcMesh(胴体+頭+帽子+つばの人型、服色ワールド別)、syncNpcs で毎フレーム位置・向き反映。
- main: Npc構築(interactables / colliders / npcs に登録)。
- 仕様書: FN-007_案内NPC.md 新規、機能一覧(FN-006のNPC追記含む)・機能仕様書index・SCR-001 を更新。

### ソースコードを参照した事実確認
- [x] チェックルールに則ってreviewファイル作成(review1_NPC組込み箇所の確認.md)
- [x] ソースコードを参照した事実確認を実行

### [o] セクション5 テスト・ビルド・デプロイ・公開URL確認

#### 方針
- `rtk npm test` → `rtk npm run build` → commit → push → Actions 完了待ち → 公開URLで新バンドル配信確認。

#### 結果
- テスト**78件全て成功**(NpcWanderService 6件、NPCタップ会話1件を追加)。ビルド成功(JS 509.66kB)。
- commit「ぶらぶら歩く案内人NPCを各ワールドに追加」(c260c0f)を push、Actions 成功。
- 公開URLで新バンドル `assets/index-C-iht5iF.js`(200 / 509,655 bytes、ローカルと一致)を確認。バンドル内に「案内人」「やあ、旅人さん」の文言を確認。

#### 完了条件の検証
- [x] 各ワールドに歩き回るNPCがいる(歩く→立ち止まる→再出発、テストで担保)
- [x] NPCに近づくと吹き出し、タップで世界の説明(NPCタップ会話テストで担保)
- [x] 徘徊ロジック(到達・休止・範囲内・押し出し・自己除外・コライダー追従)がテストで担保
- [x] 仕様書(機能一覧 / FN-007新規 / SCR-001)更新
- [x] テスト全件成功・ビルド成功・GitHub Pages で公開確認

## ステータス: ✅ 完了(2026-06-13)
公開URL: https://mo84dan5.github.io/potal-test-fable-05/
