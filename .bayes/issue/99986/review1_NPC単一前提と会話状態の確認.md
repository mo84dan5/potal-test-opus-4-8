# review1 NPC単一前提と会話状態の確認

対象issue: `.bayes/issue/99986/静止NPCの追加と会話中の停止.md`

## 確認1: src/config/worldContent.ts(id=0、貢献度+1)

```
src/config/worldContent.ts
1 /**
2  * ワールドのオブジェクト配置・ポータル接続・文言の共有定義。
...省略
55 export interface WorldDef {
56   id: string;
57   name: string;
58   objects: WorldObjectSpec[];
59   portals: PortalSpec[];
60   npc?: NpcSpec;
61 }
```
→ 1ワールド1NPC前提。**`npcs: NpcSpec[]` に一般化**し、NpcSpec の wanderRadius=0 を静止指定とする。

## 確認2: src/domain/entities/GameSession.ts(id=1、貢献度+1)

```
src/domain/entities/GameSession.ts
1 import { DialogueSession } from './DialogueSession';
...省略
6 export class GameSession {
7   /** 表示中のメッセージウィンドウ。null なら非表示 */
8   public dialogue: DialogueSession | null = null;
9
10   private readonly worlds: Map<string, World>;
```
→ 会話の「相手」は保持していない。**dialogueSpeaker: Interactable | null を追加**し、TapInteract が設定/解除する。

## 確認3: src/application/usecases/TickUseCase.ts(id=2、貢献度+1)

```
src/application/usecases/TickUseCase.ts
30     // 全ワールドのNPCを徘徊させる(ポータル越しに見えるNPCも動く)
31     for (const world of this.session.allWorlds) {
32       for (const npc of world.npcs) {
33         this.npcWander.tick(npc, dt, world.colliders);
34       }
35     }
```
→ 無条件で全NPCを更新している。**`npc === session.dialogueSpeaker` のときスキップ**すれば会話中の停止になる(静止NPCは WanderService 側の早期returnで対応)。

## 確認4: src/adapters/rendering/ThreeRendererAdapter.ts(id=5、貢献度+1)

```
src/adapters/rendering/ThreeRendererAdapter.ts
205     const npcMeshes = new Map<string, THREE.Group>();
206     for (const npc of world.npcs) {
207       const mesh = buildNpcMesh(def?.npc?.color ?? 0xe06a3c);
208       const feet = npc.feet;
209       mesh.position.set(feet.x, 0, feet.z);
210       scene.add(mesh);
```
→ 色の参照が `def?.npc?.color`(単一前提)。**npcs 配列の同順インデックスから取得**するよう変更。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 1ワールド1NPC(徘徊のみ) | npcs 配列+wanderRadius=0 で静止NPCを追加(門番・星読み・旅商人・学者) |
| 会話中もNPCが歩き続ける | dialogueSpeaker を導入し、会話相手の徘徊更新をスキップ(閉じると再開) |
