# review0_vertical_movement — 事実確認

親Issue: [階段で登れる2階のある家.md](./階段で登れる2階のある家.md)

## 確認1: プレイヤーの y は毎フレーム高さ場へスナップされる(=高さ場が床)

src/domain/services/MovementService.ts
```
58   tick(player: Player, dt: number, terrain: HeightField = FLAT_TERRAIN): void {
59     if (dt <= 0) return;
60     let pos = player.position.add(player.velocity.scale(dt));
...
68     // 足元を地形の高さへスナップ(地形に沿って移動する)
69     player.position = pos.withY(terrain.heightAt(pos.x, pos.z));
```
→ 床の高さは `terrain.heightAt(x,z)` で完全に決まる。**高さ場に階段・2階の高さを書けば、プレイヤーはそれに沿って昇降する**。視点も `eyePosition = position.y + EYE_HEIGHT` で連動する。

## 確認2: 衝突は XZ 円柱のみ(y を無視)→ 手すりで段差の縁を塞ぐ必要

src/domain/services/CollisionService.ts
```
21   const dx = player.position.x - c.position.x;
22   const dz = player.position.z - c.position.z;
23   const dist = Math.hypot(dx, dz);
24   const minDist = c.radius + this.playerRadius;
25   if (dist >= minDist) continue;
```
→ コライダーは XZ のみ。高さ場が段差(例: ロフト前縁で h:3→0)になっている所をそのまま歩くと、
y が一気に下がる(瞬間降下)。**段差の縁に手すりコライダーを置いて越えられないようにする**(階段の所だけ開ける)。

## 確認3: 室内ワールド/扉入室の仕組みが既にある(再利用する)

src/adapters/rendering/ThreeRendererAdapter.ts
```
211   const def = WORLD_DEFS.find((d) => d.id === world.id);
212   if (def?.interior && def.room) {
213     this.buildRoom(scene, def.room);
214   } else {
215     this.buildEnvironment(scene, world.id, world.terrain);
216   }
...
219   if (def?.portalHouse) this.buildPortalHouse(scene, def.portalHouse, world.terrain);
```
src/main.ts
```
143     ...(def.portalHouse
144       ? [{ x: def.portalHouse.x, z: def.portalHouse.z, radius: FLAT_HOUSE_RADIUS, ...}]
145       : []),
```
→ `interior`+`room` で室内、`portalHouse` で扉付き小屋。**`portalHouse` は現状1棟のみ**。昼に2棟目(2階建て)を
置くため `portalHouses`(配列)へ拡張する。室内は `floorKind: 'two-floor'` で `TwoFloorField` を割り当てる。

## 確認4: NPC も高さ場に追従する(2階に立たせられる)

src/main.ts(buildWorld)
```
175     npc.moveTo(spec.x, spec.z, terrain.heightAt(spec.x, spec.z)); // 初期位置を地形へスナップ
```
→ NPC も heightAt で足元高さが決まるため、ロフト(h=H)の座標に静止NPCを置けば2階に立つ。

## 結論(設計確定)

| 要素 | 実装 |
| --- | --- |
| 昇降 | `TwoFloorField`(一階h=0 / 階段ランプ / ロフトh=H)を室内ワールドの terrain に割当 |
| 落下防止 | ロフト前縁・階段開放側に手すりコライダー(階段の所だけ開口) |
| 入室 | 昼に2階建ての小屋(扉)を追加 → 室内ワールド `two-floor-house` |
| 描画 | `buildTwoFloorInterior`(高い部屋+階段+ロフト床+手すり+家具+2階のNPC) |
