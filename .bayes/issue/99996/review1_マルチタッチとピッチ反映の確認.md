# review1 マルチタッチとピッチ反映の確認

対象issue: `.bayes/issue/99996/2本指スワイプ見回しの追加.md`

## 確認1: src/adapters/input/VirtualStickInputAdapter.ts(id=0、貢献度+1)

```
src/adapters/input/VirtualStickInputAdapter.ts
1 export interface StickState {
2   /** 正規化済みスティック値(右が正、|(x,y)| ≤ 1) */
...省略
61   private readonly onDown = (e: PointerEvent): void => {
62     if (this.pointerId !== null) return; // マルチタッチの2本目以降は無視
63     this.pointerId = e.pointerId;
64     this.originX = e.clientX;
65     this.originY = e.clientY;
66     this.startTime = e.timeStamp;
```
→ 現在は単一ポインタ前提で2本目を無視(L62)。**複数ポインタを Map で管理し、2本目で stick→look モードへ遷移する設計に変更**する。

## 確認2: src/adapters/rendering/ThreeRendererAdapter.ts(id=1、貢献度+1)

```
src/adapters/rendering/ThreeRendererAdapter.ts
1 import * as THREE from 'three';
2 import { GameSession } from '../../domain/entities/GameSession';
...省略
117   private syncCamera(player: Player): void {
118     const eye = player.eyePosition;
119     this.camera.position.set(eye.x, eye.y, eye.z);
120     this.camera.rotation.set(player.pitch, player.yaw, 0);
121     this.camera.updateMatrixWorld();
122   }
```
→ `player.pitch` は既に毎フレームカメラへ反映されている(L120、回転順 'YXZ')。**描画側の変更は不要**で、pitch を更新するユースケースを追加すれば上下見回しが機能する。

## 確認3: src/domain/entities/Player.ts(id=2、貢献度+1)

```
src/domain/entities/Player.ts
1 import { Vec3 } from '../values/Vec3';
2
...省略
8   constructor(
9     public position: Vec3,
10     public velocity: Vec3,
11     public yaw: number,
12     public pitch: number,
13   ) {}
```
→ pitch フィールドは保持済み。**ドメイン変更は不要**。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 2本目以降のタッチを無視(単一ポインタ) | Map管理で stick / look の2モード化。2本目タッチで onStickEnd(即時停止)→ look モード |
| 見回しユースケースなし(#99998で削除) | ApplyLookUseCase を復活(ヨー+ピッチ、±0.9radクランプ)。2本指の合計移動量を平均化(1/指数)して適用 |
