# review1 y=0前提箇所の確認

対象issue: `.bayes/issue/99982/地形起伏と地形追従移動.md`

## 確認1: src/domain/services/MovementService.ts(id=0、貢献度+1)

```
src/domain/services/MovementService.ts
1 import { Player } from '../entities/Player';
...省略
44   tick(player: Player, dt: number): void {
45     if (dt <= 0) return;
46     let pos = player.position.add(player.velocity.scale(dt)).withY(0);
47
48     const r = Math.hypot(pos.x, pos.z);
49     if (r > this.config.boundsRadius) {
50       const k = this.config.boundsRadius / r;
51       pos = new Vec3(pos.x * k, 0, pos.z * k);
```
→ L46/L51 で常に y=0 に固定。**HeightField を受け取り、最終位置の y を `heightAt(x,z)` にする**ことで地形追従にできる(視点高は Player.eyePosition が position.y+1.6 のため自動で追従)。

## 確認2: src/domain/entities/Npc.ts(id=2、貢献度+1)

```
src/domain/entities/Npc.ts
44   /** 足元座標(y=0) */
45   get feet(): Vec3 {
46     return this.position.withY(0);
47   }
48
49   /** 足元座標を更新する(吹き出しアンカーとコライダーも追従) */
50   moveTo(x: number, z: number): void {
51     this.position = new Vec3(x, this.anchorY, z);
52     this.collider.position = new Vec3(x, 0, z);
53   }
```
→ feet が y=0 固定、吹き出しアンカーも地面0前提。**groundY フィールドを導入**し、feet=(x, groundY, z)、アンカー=(x, groundY+anchorY, z) とする。

## 確認3: src/adapters/rendering/ThreeRendererAdapter.ts(id=3、貢献度+1)

```
src/adapters/rendering/ThreeRendererAdapter.ts
148       for (const npc of world.npcs) {
149         const mesh = view.npcMeshes.get(npc.id);
150         if (!mesh) continue;
151         const feet = npc.feet;
152         mesh.position.set(feet.x, 0, feet.z);
```
→ NPCメッシュの y=0 固定(L152)。地面は平面(addGround の CircleGeometry)、木・石なども y=0 基準。**地面の頂点変位+各メッシュの y に terrain 高さを加算**する。

## 確認4: src/domain/services/CollisionService.ts(id=1、貢献度+1)

```
src/domain/services/CollisionService.ts
30         const push = minDist - dist;
31         player.position = new Vec3(
32           player.position.x + nx * push,
33           0,
34           player.position.z + nz * push,
35         );
```
→ 押し出しで y=0 を再設定(L33)。**現在の y を保持**し、最終スナップは TickUseCase が行う。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 全レイヤで地面 y=0 前提 | HeightField(波の重ね合わせ+ポータル/スポーン平坦化)をドメインに導入し、移動・NPC・描画が同じ高さ場を参照 |
| ポータル面は y=0 平面前提 | ポータル周辺(半径5m)とスポーン(半径4m)を滑らかに高さ0へ平坦化して整合を維持 |
