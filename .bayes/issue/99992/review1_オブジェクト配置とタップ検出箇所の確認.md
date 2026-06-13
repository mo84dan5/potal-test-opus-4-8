# review1 オブジェクト配置とタップ検出箇所の確認

対象issue: `.bayes/issue/99992/オブジェクトインタラクション機能の追加.md`

## 確認1: src/adapters/rendering/ThreeRendererAdapter.ts(id=0、貢献度+1)

```
src/adapters/rendering/ThreeRendererAdapter.ts
1 import * as THREE from 'three';
2 import { GameSession } from '../../domain/entities/GameSession';
...省略
163     const treeSpots: Array<[number, number]> = [
164       [-8, -2], [9, -4], [-12, 8], [13, 9], [-5, 14], [6, 16], [-15, -8], [16, -10],
165     ];
166     for (const [x, z] of treeSpots) {
...省略
178     const rockSpots: Array<[number, number, number]> = [
179       [4, 6, 0.7], [-6, 5, 0.5], [10, 2, 0.9], [-3, -12, 0.6],
180     ];
...省略
229     const crystalSpots: Array<[number, number, number, number]> = [
230       [-7, -3, 1.6, 0x66ffee], [8, -5, 2.2, 0xff66dd], [-11, 7, 1.8, 0x66aaff],
231       [12, 10, 1.4, 0xaaff66], [-4, 13, 2.0, 0x66ffee], [5, 17, 1.7, 0x66ffee],
232     ];
```
→ オブジェクト座標はレンダラ内にハードコード。インタラクション判定(ドメイン)と同じ座標を使う必要があるため、**`src/config/worldContent.ts` に配置・文言を集約**し、レンダラとコンポジションルートの双方が参照する形に変更する。
(※L231 の実ファイルでは5番目=0xff9966、6番目=0x66ffee。色は worldContent へ移す)

## 確認2: src/adapters/input/VirtualStickInputAdapter.ts(id=1、貢献度+1)

```
src/adapters/input/VirtualStickInputAdapter.ts
1 export interface StickState {
2   /** 正規化済みスティック値(右が正、|(x,y)| ≤ 1) */
...省略
132   private readonly onUp = (e: PointerEvent): void => {
133     if (!this.pointers.has(e.pointerId)) return;
134     this.pointers.delete(e.pointerId);
135
136     if (this.mode === 'stick' && e.pointerId === this.stickPointerId) {
137       // 停止 → ダッシュの順で通知し、はじいた場合はダッシュの勢いだけが残る
138       this.endStick();
```
→ 解放時はダッシュ判定のみ。**タップ(<300ms かつ <10px)の検出を stick / look 両モードの解放に追加**する(ダッシュは>40pxのため衝突しない)。look モードはポインタごとの開始位置を保持していないため、開始位置・時刻の記録を追加する。

## 確認3: src/domain/entities/World.ts(id=2、貢献度+1)

```
src/domain/entities/World.ts
1 import { Portal } from './Portal';
2
3 /** ワールド。ポータルを1つ持つ(拡張時は複数化する) */
4 export class World {
5   constructor(
6     public readonly id: string,
7     public readonly name: string,
8     public readonly portal: Portal,
9   ) {}
10 }
```
→ interactables を**デフォルト引数 `[]` で追加**すれば既存テスト・呼び出しに後方互換で拡張できる。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| オブジェクト座標がレンダラ内ハードコード(ドメインから参照不可) | worldContent.ts に配置+文言を集約し、描画と判定の座標を一元化 |
| タップ概念なし | onTap コールバックを追加(短時間・微小移動の解放で発火) |
| World にインタラクト対象なし | interactables: Interactable[] = [] を追加 |
