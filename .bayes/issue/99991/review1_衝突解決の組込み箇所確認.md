# review1 衝突解決の組込み箇所確認

対象issue: `.bayes/issue/99991/オブジェクトの当たり判定追加.md`

## 確認1: src/application/usecases/TickUseCase.ts(id=0、貢献度+1)

```
src/application/usecases/TickUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
2 import { MovementService } from '../../domain/services/MovementService';
...省略
20     const before = player.position;
21
22     this.movement.tick(player, dt);
23
24     const portal = this.session.currentWorld.portal;
25     if (this.traversal.hasCrossed(portal, before, player.position)) {
26       const dest = this.session.getWorld(portal.targetWorldId);
27       this.traversal.traverse(player, portal, dest.portal);
28       this.session.moveToWorld(dest.id);
29       return { traversed: true };
30     }
31     return { traversed: false };
32   }
33 }
```
→ 衝突解決は **L22(移動積分)の直後・L25(ポータル交差判定)の前**に入れる。押し出し後の位置でポータル判定を行うことで、押し戻されたフレームに誤って通過判定されない。

## 確認2: src/config/worldContent.ts(id=1、貢献度+1)

```
src/config/worldContent.ts
1 /**
2  * ワールドのオブジェクト配置と文言の共有定義。
...省略
36 export const DAY_OBJECTS: WorldObjectSpec[] = [
37   { kind: 'tree', x: -8, z: -2, name: '木', anchorY: 4.2, bubble: TREE_BUBBLE },
38   { kind: 'tree', x: 9, z: -4, name: '木', anchorY: 4.2, bubble: TREE_BUBBLE },
...省略
45   { kind: 'rock', x: 4, z: 6, size: 0.7, name: '石', anchorY: 1.4, dialogue: ROCK_DIALOGUE },
```
→ 配置はここに一元化済み(issue #99992)。**collisionRadius フィールドを追加**すれば描画・インタラクション・衝突の座標が一致する。

## 確認3: src/domain/services/MovementService.ts(id=3、貢献度+1)

```
src/domain/services/MovementService.ts
1 import { Player } from '../entities/Player';
2 import { Vec3 } from '../values/Vec3';
...省略
44   tick(player: Player, dt: number): void {
45     if (dt <= 0) return;
46     let pos = player.position.add(player.velocity.scale(dt)).withY(0);
47
48     const r = Math.hypot(pos.x, pos.z);
49     if (r > this.config.boundsRadius) {
```
→ 移動積分は単一責務のまま変更せず、**衝突は別の CollisionService(domainサービス)で解決**して TickUseCase が編成する(単一責任の維持)。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| オブジェクトをすり抜けられる | Collider(position+radius)+ CollisionService(押し出し+壁ずり)を新設し、TickUseCase の移動後・ポータル判定前に解決 |
| ポータル枠もすり抜ける | 枠の左右柱に半径0.25のコライダーを設定(面はコライダーなしで通過可能を維持) |
