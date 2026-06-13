# review0_world_portal_architecture — 事実確認

親Issue: [室内ワールド型の家と各シーンへの家配置.md](./室内ワールド型の家と各シーンへの家配置.md)

## 確認1: ポータルはID対でワールドを接続し、面を横切ると写像で切替

src/domain/services/PortalTraversalService.ts
```
14   hasCrossed(portal: Portal, p0: Vec3, p1: Vec3): boolean {
15     const d0 = portal.signedDistance(p0);
16     const d1 = portal.signedDistance(p1);
17     if (d0 === d1 || d0 * d1 > 0) return false;
18     const t = d0 / (d0 - d1); // 交差パラメータ [0,1]
19     const hit = p0.add(p1.sub(p0).scale(t));
20     return Math.abs(portal.tangentOffset(hit)) <= portal.halfWidth;
21   }
...
33   traverse(player: Player, from: Portal, to: Portal): void {
34     player.position = this.mapPoint(player.position, from, to);
35     player.velocity = this.mapVector(player.velocity, from, to);
```
→ ポータル面の横断で接続先ポータル系へ座標・速度・視点を写像。**「家のドア=ポータル」にすれば別ワールド(室内)へ飛べる**ことを確認。

## 確認2: ワールドは worldId ごとにシーン構築。環境は switch で4種のみ

src/adapters/rendering/ThreeRendererAdapter.ts
```
200   private buildWorld(world: World, size: THREE.Vector2): WorldView {
201     const scene = new THREE.Scene();
202     const def = WORLD_DEFS.find((d) => d.id === world.id);
203     this.buildEnvironment(scene, world.id, world.terrain);
204     if (def) this.buildObjects(scene, def.objects, world.terrain);
205     if (def?.house) this.buildHouse(scene, def.house, world.terrain);
...
238   private buildEnvironment(scene, worldId, terrain): void {
239     switch (worldId) {
240       case 'day': { ... this.addGround(scene, 'grass', terrain); break; }
```
→ 環境は `day/night/snow/ruins` のみ対応。**室内ワールドには新たな分岐(囲まれた部屋の描画)が必要**。`house` は `def.house` があれば汎用で描画される。

## 確認3: 家は def.house があれば描画・コライダー・地形平坦化がすべて汎用で効く

src/main.ts
```
100       ...(def.house
101         ? [{ x: def.house.x, z: def.house.z, radius: FLAT_HOUSE_RADIUS, flatRadius: FLAT_HOUSE_PLATEAU_RADIUS }]
102         : []),
...
111   const houseInteractables = (def: WorldDef): Interactable[] => {
112     if (!def.house) return [];
...
132   const houseColliders = (def: WorldDef): Collider[] => {
133     if (!def.house) return [];
```
→ **夜・雪・遺跡の WorldDef に `house` を足すだけで、家・テレビ・テーブル・壁コライダー・地形平坦化が自動付与**される。FN-009 をそのまま再利用可能。

## 確認4: ドア開口=壁コライダーの隙間。ポータル面はコライダー無しで通過可能

src/config/worldContent.ts
```
88   export function houseWallColliderSpots(hx, hz): Array<{x,z}> {
...
96       if (Math.abs(x) > HOUSE.doorWidth / 2 + 0.2) {
97         spots.push({ x: hx + x, z: hz + d }); // 前面(ドア開口を除く)
98       }
```
src/main.ts
```
76   const portalPillarColliders = (portal: Portal): Collider[] => { ...枠の左右柱のみ... }
```
→ 壁コライダーはドア中心を避けて配置。**室内ワールドの玄関壁にも同様にポータル位置の隙間を設ければ、ポータル面に到達して戻れる**ことを確認。室内の戻りポータルは壁手前に置き、玄関壁コライダーに開口を作る。

## 結論(修正の提案ではなく設計確定)

| 要件 | 実装方針 |
| --- | --- |
| 中に入ると別シーン | 小屋のドアをポータル化し、新室内ワールド `grand-hall` へ接続。室内に戻りポータル |
| 室内描画 | `interior` フラグで `buildRoom`(床・壁・天井・暖色光・広い部屋)へ分岐 |
| 他シーンの家 | 夜・雪・遺跡の WorldDef に `house` を追加(既存の汎用処理を再利用) |
| 通行 | 小屋ドア・室内玄関の壁コライダーにポータル位置の開口を設ける |
