# review1 現行入力実装の確認(仕様書更新前の事実確認)

対象issue: `.bayes/issue/99998/操作方式をバーチャルパッド型に変更.md`

## 確認1: src/adapters/input/TouchInputAdapter.ts(関連コードPath id=0、貢献度+1)

```
src/adapters/input/TouchInputAdapter.ts
1 export interface GestureCallbacks {
2   /** フリック確定時(指を離した瞬間)。dx/dy はスワイプ全体の移動量 [px] */
...省略
14
15 /**
16  * Pointer Events からフリック/ドラッグを判定する入力アダプタ。
17  * マウスでも同一ロジックで動作する。
18  */
```
→ 現行はフリック/ドラッグの2種ジェスチャ判定。仮想パッド(原点吸い付き+連続ベクトル提供+ノブUI)とは構造が異なるため、**置換(削除→新規 VirtualStickInputAdapter)が妥当**。

## 確認2: src/application/usecases/ApplyFlickUseCase.ts(id=1、貢献度+1)

```
src/application/usecases/ApplyFlickUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
2 import { MovementService } from '../../domain/services/MovementService';
...省略
24     const player = this.session.player;
25     // 上スワイプ(dy<0)= 前進、右スワイプ(dx>0)= 右移動
26     const direction = player.right
27       .scale(input.dx)
28       .add(player.forward.scale(-input.dy));
29     this.movement.applyImpulse(player, direction, magnitude * this.gain);
30   }
31 }
```
→ 「スクリーンベクトル→視点基準の方向→インパルス」の変換はダッシュにそのまま流用できる。**ApplyDashUseCase として置換**する。

## 確認3: src/application/usecases/ApplyLookUseCase.ts(id=2、貢献度+1)

```
src/application/usecases/ApplyLookUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
2
...省略
14   execute(dx: number, dy: number): void {
15     const player = this.session.player;
16     player.yaw -= dx * this.sensitivity;
17     player.pitch = Math.max(
18       -PITCH_LIMIT,
19       Math.min(PITCH_LIMIT, player.pitch - dy * this.sensitivity),
20     );
21   }
22 }
```
→ 見回しジェスチャは廃止し自動旋回(ApplyStickUseCase内)へ統合するため**削除が妥当**。pitch は今後操作されず 0 固定になる(Player.pitch フィールド自体はカメラ写像のため残す)。

## 確認4: src/main.ts(id=6、貢献度+1)

```
src/main.ts
1 import { GameSession } from './domain/entities/GameSession';
2 import { Player } from './domain/entities/Player';
...省略
48   onFlick: (dx, dy) => applyFlick.execute({ dx, dy }),
49   onLook: (dx, dy) => applyLook.execute(dx, dy),
50 });
51
52 setTimeout(() => hintEl.classList.add('hidden'), 5000);
53
```
→ コールバック駆動の配線。仮想パッドは「毎フレームのスティック状態読み取り」が必要なため、ゲームループ内で `ApplyStickUseCase` を呼ぶ形に変更する。

## 確認5: index.html(id=7、貢献度+1)

```
index.html
...省略
89     <div id="hint">フリックで移動 / ドラッグで見回す</div>
```
→ ヒント文言の更新とパッドUI(ベース円・ノブ)のCSS追加が必要。

## 修正の提案
仕様書(.bayes/spec/)の現行記載は実装と一致しており誤記はない。本issueは「誤りの修正」ではなく「操作方式の変更」のため、FN-002 を新仕様書へ差し替える(タイトル名は記載しない)。

| 現状 | 提案 |
| --- | --- |
| FN-002_フリック移動.md(フリック=インパルス/ドラッグ=視点回転) | FN-002_仮想パッド移動.md(吸い付き仮想パッド/自動旋回/フリックダッシュ)に置換 |
