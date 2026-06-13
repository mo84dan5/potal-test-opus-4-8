# review1 対象選択ロジックの確認

対象issue: `.bayes/issue/99984/前方のオブジェクトのみ話しかけ可能に.md`

## 確認1: src/domain/services/InteractionService.ts(id=0、貢献度+1)

```
src/domain/services/InteractionService.ts
1 import { Interactable } from '../entities/Interactable';
2 import { Vec3 } from '../values/Vec3';
3
4 /** インタラクト対象の近接判定を行うドメインサービス */
5 export class InteractionService {
6   /** 水平距離が range 以内で最も近い対象を返す(なければ null) */
7   nearestWithin(
8     from: Vec3,
9     interactables: readonly Interactable[],
10     range: number,
11   ): Interactable | null {
```
→ 距離のみで選択しており向きは見ていない。**前方コーン条件つきの `nearestInFrontWithin` を追加**する(吹き出し用の nearestWithin は全方向のまま残す)。

## 確認2: src/application/usecases/TapInteractUseCase.ts(id=1、貢献度+1)

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
→ ここを `nearestInFrontWithin(position, player.forward, ...)` に切り替える。

## 確認3: src/domain/entities/Player.ts(id=2、貢献度+1)

```
src/domain/entities/Player.ts
22   /** カメラが向いている水平前方向(yaw=0 で -Z 方向 = three.js のカメラ既定と一致) */
23   get forward(): Vec3 {
24     return new Vec3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
25   }
```
→ 水平前方向は取得済み(単位ベクトル)。前方判定の基準にそのまま使える。

## 確認4: src/application/usecases/TapInteractUseCase.test.ts(id=4、貢献度+1)

```
src/application/usecases/TapInteractUseCase.test.ts
27   it('近くのオブジェクトをタップするとメッセージウィンドウが開く', () => {
28     const rock = new Interactable('r', '石', new Vec3(2, 1, 0), null, ROCK_LINES);
```
→ 既存テストの対象は (2,1,0) など**真横(+X)配置**で、yaw=0(前方-Z)の前方コーン外。前方判定の導入により**対象を前方(-Z軸上)へ配置し直す**必要がある。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 距離だけで会話対象を選択(背後でも話しかかる) | 前方±60°コーン内(forwardとの内積 ≥ cos60°=0.5)に限定。至近距離は前方扱い |
| 既存テストの対象が真横配置 | 前方(-Z)配置へ修正し、背後・真横で開かないテストを追加 |
