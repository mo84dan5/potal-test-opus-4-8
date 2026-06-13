# review1 addGround の確認

対象issue: `.bayes/issue/99988/地面の模様追加.md`

## 確認1: src/adapters/rendering/ThreeRendererAdapter.ts(id=0、貢献度+1)

```
src/adapters/rendering/ThreeRendererAdapter.ts
1 import * as THREE from 'three';
2 import { GameSession } from '../../domain/entities/GameSession';
...省略
268   private addGround(scene: THREE.Scene, color: number): void {
269     const ground = new THREE.Mesh(
270       new THREE.CircleGeometry(40, 48),
271       new THREE.MeshLambertMaterial({ color }),
272     );
273     ground.rotation.x = -Math.PI / 2;
274     scene.add(ground);
275   }
```
→ 地面は単色 `MeshLambertMaterial`(半径40の円)。呼出は L217(day)/L227(night)/L245(snow)/L255(ruins)の4箇所。
**ワールド別のパターン種別を引数に追加し、Canvas で生成した `CanvasTexture` を `map` に設定**する(UV は CircleGeometry 標準のものを RepeatWrapping で繰り返し)。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 単色の地面(模様なし) | `addGround(scene, pattern)` とし、grass / dirt / snow / stone の4種をシード付き擬似乱数で決定的に生成。SRGBColorSpace・anisotropy・repeat 設定 |
