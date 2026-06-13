# review1 会話フレーム処理と距離定数の確認

対象issue: `.bayes/issue/99985/会話中の注視と距離による終了.md`

## 確認1: src/application/usecases/TickUseCase.ts(id=0、貢献度+1)

```
src/application/usecases/TickUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
...省略
30     // 全ワールドのNPCを徘徊させる(ポータル越しに見えるNPCも動く)。
31     // 話しかけられている相手は立ち止まる
32     for (const world of this.session.allWorlds) {
33       for (const npc of world.npcs) {
34         if (npc === this.session.dialogueSpeaker) continue;
35         this.npcWander.tick(npc, dt, world.colliders);
36       }
37     }
```
→ 会話相手はスキップして「停止」するだけで、**注視も距離による終了も未実装**。同じフレーム処理に `maintainDialogue()`(① speaker が Npc ならプレイヤー方向へ yaw 更新、② 距離超過でウィンドウ閉鎖+speaker解除)を追加する。

## 確認2: src/config/worldContent.ts(id=1、貢献度+1)

```
src/config/worldContent.ts
...省略
240 export const BUBBLE_RANGE = 5;
241 export const INTERACT_RANGE = 3.5;
242
243 /** ポータル枠の柱の衝突半径 [m](面はコライダーなしで通過可能) */
244 export const PORTAL_PILLAR_RADIUS = 0.25;
```
→ 会話開始距離は定数1箇所(L241)。**5.25(1.5倍)へ変更**し、終了距離 `DIALOGUE_BREAK_RANGE = 6.5` を追加する。main は既に INTERACT_RANGE を TapInteractUseCase へ注入済みのため、変更は定数値と TickUseCase への注入のみ。

## 確認3: src/main.ts(id=2、貢献度+1)

```
src/main.ts
133 const tapInteract = new TapInteractUseCase(session, interaction, INTERACT_RANGE);
134 const nearbyBubble = new NearbyBubbleUseCase(session, interaction, BUBBLE_RANGE);
135 const tick = new TickUseCase(session, movement, traversal);
```
→ TickUseCase はデフォルト引数構築(L135)。**CollisionService / NpcWanderService / DIALOGUE_BREAK_RANGE を明示注入**する形に変更。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 会話中のNPCは停止のみ(向きは歩いていた方向のまま) | 毎フレーム、プレイヤー方向へ yaw を更新(常に注視) |
| どれだけ離れてもウィンドウが開いたまま | 相手から 6.5m 超で自動クローズ+speaker解除 |
| 会話開始距離 3.5m | 5.25m(1.5倍) |
