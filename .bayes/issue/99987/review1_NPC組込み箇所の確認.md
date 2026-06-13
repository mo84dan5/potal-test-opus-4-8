# review1 NPC組込み箇所の確認

対象issue: `.bayes/issue/99987/案内NPCの追加.md`

## 確認1: src/domain/entities/Interactable.ts(id=0、貢献度+1)

```
src/domain/entities/Interactable.ts
1 import { Vec3 } from '../values/Vec3';
2
...省略
8 export class Interactable {
9   constructor(
10     public readonly id: string,
11     public readonly name: string,
12     public position: Vec3,  ← 現状は readonly
13     /** 接近時に頭上へ出す吹き出し文。null なら吹き出しなし */
14     public readonly bubbleText: string | null,
```
※実ファイルでは L12 が `public readonly position: Vec3`。
→ **position の readonly を外せば**、吹き出し(NearbyBubble)・タップ会話(TapInteract)・距離判定(InteractionService)は位置参照ベースのため**動くNPCにそのまま適用できる**。Npc を Interactable のサブクラスにする。

## 確認2: src/application/usecases/TickUseCase.ts(id=1、貢献度+1)

```
src/application/usecases/TickUseCase.ts
20   execute(dt: number): TickResult {
21     const player = this.session.player;
22     const before = player.position;
23
24     this.movement.tick(player, dt);
25     // 押し出し後の位置でポータル判定する(押し戻されたフレームの誤通過を防ぐ)
26     this.collision.resolve(player, this.session.currentWorld.colliders);
```
→ NPCの徘徊更新は **L24-26 のプレイヤー更新と同じフレーム処理内**に追加する(全ワールドのNPCを更新し、ポータル越しに見えるNPCも動くようにする)。`session.allWorlds` は issue #99990 で追加済み。

## 確認3: src/application/usecases/TapInteractUseCase.ts(id=6、貢献度+1)

```
src/application/usecases/TapInteractUseCase.ts
26     const target = this.interaction.nearestWithin(
27       this.session.player.position,
28       this.session.currentWorld.interactables.filter((i) => i.dialogue.length > 0),
29       this.interactRange,
30     );
31     if (target) {
32       this.session.dialogue = new DialogueSession(target.dialogue);
33     }
```
→ 対象は `world.interactables` の dialogue 保持者。**Npc(Interactableのサブクラス)を interactables に登録すれば変更不要**で会話できる。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| Interactable.position が readonly(静的オブジェクト前提) | 可変化し、Npc サブクラスが徘徊で更新する |
| NPCという概念がない | Npc エンティティ+NpcWanderService(目的地徘徊・休止・押し出し)を新設。World.npcs と worldContent の npc 定義を追加 |
