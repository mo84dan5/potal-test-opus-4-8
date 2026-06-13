# review1 単一ポータル前提箇所の確認

対象issue: `.bayes/issue/99990/ポータルの一般化と4ワールド化.md`

## 確認1: src/domain/entities/Portal.ts(id=0、貢献度+1)

```
src/domain/entities/Portal.ts
1 import { Vec3 } from '../values/Vec3';
2
...省略
8   constructor(
9     /** ポータル面の中心の足元座標(y=0) */
10     public readonly position: Vec3,
11     /** 面の向き(Y軸まわりの回転、ラジアン) */
12     public readonly yaw: number,
13     public readonly halfWidth: number,
14     public readonly height: number,
15     /** 接続先ワールドのID */
16     public readonly targetWorldId: string,
17   ) {}
```
→ 接続先は「ワールドID」のみで、ワールドに複数ポータルがあると接続先ポータルを特定できない。**id と targetPortalId を追加**して「ポータル対」をIDで接続する。

## 確認2: src/application/usecases/TickUseCase.ts(id=2、貢献度+1)

```
src/application/usecases/TickUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
...省略
28     const portal = this.session.currentWorld.portal;
29     if (this.traversal.hasCrossed(portal, before, player.position)) {
30       const dest = this.session.getWorld(portal.targetWorldId);
31       this.traversal.traverse(player, portal, dest.portal);
32       this.session.moveToWorld(dest.id);
33       return { traversed: true };
34     }
35     return { traversed: false };
36   }
```
→ `currentWorld.portal`(単数)と `dest.portal`(単数)に依存。**currentWorld.portals を走査し、targetPortalId で接続先を解決**する形へ変更。PortalTraversalService 自体は from/to の対で動くため変更不要。

## 確認3: src/adapters/rendering/ThreeRendererAdapter.ts(id=3、貢献度+1)

```
src/adapters/rendering/ThreeRendererAdapter.ts
95   render(): void {
96     const current = this.viewOf(this.session.currentWorldId);
97     const otherWorldId = this.session.currentWorld.portal.targetWorldId;
98     const other = this.viewOf(otherWorldId);
99
100     this.syncCamera(this.session.player);
101
102     // 1. 仮想カメラ姿勢 = M(出口) × FlipY180 × M(入口)⁻¹ × メインカメラ姿勢
103     const fromPortal = this.session.currentWorld.portal;
104     const toPortal = this.session.getWorld(otherWorldId).portal;
```
→ 単一RT・単一ポータル前提。**現在ワールドの各ポータルについてRTプールから1枚割り当て、接続先ワールドを仮想カメラで描画**する方式へ一般化する(RT描画パス中は全ポータル面を非表示にして再帰・フィードバックを防止)。マテリアルはポータルごとに持ち、テクスチャを毎フレーム割当てる。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| Portal は targetWorldId のみ・World は単一 portal | Portal(id, targetWorldId, targetPortalId)・World.portals[] に一般化 |
| 2ワールド固定(day/night ハードコード) | worldContent の WORLD_DEFS(id/name/objects/portals)から汎用構築。雪・遺跡を追加し4ワールド化 |
| 単一RT描画 | ポータル数ぶんのRTプール+ポータルごとの仮想カメラ描画 |
