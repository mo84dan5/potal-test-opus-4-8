# review1 家の組込み箇所の確認

対象issue: `.bayes/issue/99981/家と屋内コンテンツの追加.md`

## 確認1: src/config/worldContent.ts(id=0、貢献度+1)

```
src/config/worldContent.ts
41 export interface NpcSpec {
42   /** スポーン位置(足元) */
43   x: number;
44   z: number;
45   name: string;
46   /** 服の色 */
47   color: number;
48   /** 徘徊半径 [m] */
49   wanderRadius: number;
50   bubble: string;
```
→ NPC定義は配列化済み(npcs)。**屋内NPCは day の npcs に追加**できる。静止NPCの向きは main 側で「原点を向く」固定のため、**NpcSpec に任意の yaw を追加**してテレビの方を向かせる。WorldDef に `house?: HouseSpec` を追加する。

## 確認2: src/adapters/rendering/ThreeRendererAdapter.ts(id=2、貢献度+1)

```
src/adapters/rendering/ThreeRendererAdapter.ts
200   private buildWorld(world: World, size: THREE.Vector2): WorldView {
201     const scene = new THREE.Scene();
202     const def = WORLD_DEFS.find((d) => d.id === world.id);
203     this.buildEnvironment(scene, world.id, world.terrain);
204     if (def) this.buildObjects(scene, def.objects, world.terrain);
```
→ シーン構築は def 参照で拡張できる。**L204 の後に `if (def?.house) buildHouse(...)` を追加**し、床・壁(窓開口つき)・屋根・テレビ・テーブルを構築する。

## 確認3: src/domain/services/CollisionService.ts(id=3、貢献度+1)

```
src/domain/services/CollisionService.ts
12 export class CollisionService {
13   constructor(private readonly playerRadius = PLAYER_RADIUS) {}
14
15   resolve(player: Player, colliders: readonly Collider[]): void {
16     // 複数コライダーの押し出しが干渉する角などのため数回反復する
17     for (let iteration = 0; iteration < 3; iteration++) {
```
→ コライダーは円柱のみ。**壁は半径0.4の円を0.55間隔で並べて表現**すれば変更不要(プレイヤー半径0.35に対し隙間0.55−0.8<0で通過不可)。ドア開口部分だけ円を置かない。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 建物・屋内の概念がない | worldContent に HouseSpec+寸法定数+壁コライダー生成の純関数を追加し、main が構築・レンダラが描画 |
| 静止NPCは常に原点を向く | NpcSpec.yaw(任意)で向きを指定可能に(住人はテレビを向く) |
