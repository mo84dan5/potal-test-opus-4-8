import { GameSession } from './domain/entities/GameSession';
import { Interactable } from './domain/entities/Interactable';
import { Npc } from './domain/entities/Npc';
import { Player } from './domain/entities/Player';
import { Portal } from './domain/entities/Portal';
import { World } from './domain/entities/World';
import { Vec3 } from './domain/values/Vec3';
import { CollisionService } from './domain/services/CollisionService';
import { InteractionService } from './domain/services/InteractionService';
import { MovementService } from './domain/services/MovementService';
import { NpcWanderService } from './domain/services/NpcWanderService';
import { PortalTraversalService } from './domain/services/PortalTraversalService';
import { Collider } from './domain/values/Collider';
import { HeightField, HillyTerrain } from './domain/values/Terrain';
import {
  BUBBLE_RANGE,
  DIALOGUE_BREAK_RANGE,
  HOUSE,
  HOUSE_TABLE_BUBBLE,
  HOUSE_TV_DIALOGUE,
  HOUSE_WALL_COLLIDER_RADIUS,
  houseWallColliderSpots,
  INTERACT_FRONT_DOT,
  INTERACT_RANGE,
  PORTAL_BUBBLE_ANCHOR_Y,
  PORTAL_HALF_WIDTH,
  PORTAL_HEIGHT,
  PORTAL_PILLAR_RADIUS,
  WORLD_DEFS,
  WorldDef,
  WorldObjectSpec,
} from './config/worldContent';
import { ApplyDashUseCase } from './application/usecases/ApplyDashUseCase';
import { ApplyLookUseCase } from './application/usecases/ApplyLookUseCase';
import { ApplyStickUseCase } from './application/usecases/ApplyStickUseCase';
import { NearbyBubbleUseCase } from './application/usecases/NearbyBubbleUseCase';
import { StopMovementUseCase } from './application/usecases/StopMovementUseCase';
import { TapInteractUseCase } from './application/usecases/TapInteractUseCase';
import { TickUseCase } from './application/usecases/TickUseCase';
import { VirtualStickInputAdapter } from './adapters/input/VirtualStickInputAdapter';
import { ThreeRendererAdapter } from './adapters/rendering/ThreeRendererAdapter';

// --- ドメインの組み立て(WORLD_DEFS からの汎用構築) ---
const worldName = (worldId: string): string =>
  WORLD_DEFS.find((d) => d.id === worldId)?.name ?? worldId;

const toInteractables = (
  specs: WorldObjectSpec[],
  worldId: string,
  terrain: HeightField,
): Interactable[] =>
  specs.map(
    (s, i) =>
      new Interactable(
        `${worldId}-${s.kind}-${i}`,
        s.name,
        new Vec3(s.x, s.anchorY + terrain.heightAt(s.x, s.z), s.z),
        s.bubble ?? null,
        s.dialogue ?? [],
      ),
  );

const portalInteractable = (portal: Portal): Interactable =>
  new Interactable(
    `interact-${portal.id}`,
    'ポータル',
    portal.position.withY(PORTAL_BUBBLE_ANCHOR_Y),
    `ポータルだ。「${worldName(portal.targetWorldId)}」へつながっている`,
    [],
  );

// 衝突体: オブジェクト + ポータル枠の左右柱(面は通過可能なまま)
const toColliders = (specs: WorldObjectSpec[]): Collider[] =>
  specs.map((s) => ({ position: new Vec3(s.x, 0, s.z), radius: s.collisionRadius }));

const portalPillarColliders = (portal: Portal): Collider[] => {
  const t = portal.tangent;
  const offset = portal.halfWidth + 0.11; // 柱の中心(枠太さ0.22の半分だけ外側)
  return [
    { position: portal.position.add(t.scale(offset)), radius: PORTAL_PILLAR_RADIUS },
    { position: portal.position.add(t.scale(-offset)), radius: PORTAL_PILLAR_RADIUS },
  ];
};

const NPC_ANCHOR_Y = 2.0;
const FLAT_PORTAL_RADIUS = 5; // ポータル周辺の平坦化半径 [m]
const FLAT_SPAWN_RADIUS = 4; // スポーン(原点)の平坦化半径 [m]

// 地形: ワールドごとの振幅+ポータル・スポーン周辺の平坦化
const FLAT_HOUSE_RADIUS = 7; // 家の周辺の平坦化半径 [m]

const buildTerrain = (def: WorldDef): HeightField =>
  new HillyTerrain(def.terrainAmplitude, [
    ...def.portals.map((p) => ({ x: p.x, z: p.z, radius: FLAT_PORTAL_RADIUS })),
    { x: 0, z: 0, radius: FLAT_SPAWN_RADIUS },
    ...(def.house ? [{ x: def.house.x, z: def.house.z, radius: FLAT_HOUSE_RADIUS }] : []),
  ]);

// 家: テレビ・テーブルのインタラクタブルと、壁・家具のコライダー
const houseInteractables = (def: WorldDef): Interactable[] => {
  if (!def.house) return [];
  const { x: hx, z: hz } = def.house;
  return [
    new Interactable(
      `${def.id}-house-tv`,
      'テレビ',
      new Vec3(hx + HOUSE.tv.x, HOUSE.tv.anchorY, hz + HOUSE.tv.z),
      null,
      HOUSE_TV_DIALOGUE,
    ),
    new Interactable(
      `${def.id}-house-table`,
      'テーブル',
      new Vec3(hx + HOUSE.table.x, HOUSE.table.anchorY, hz + HOUSE.table.z),
      HOUSE_TABLE_BUBBLE,
      [],
    ),
  ];
};

const houseColliders = (def: WorldDef): Collider[] => {
  if (!def.house) return [];
  const { x: hx, z: hz } = def.house;
  return [
    ...houseWallColliderSpots(hx, hz).map((s) => ({
      position: new Vec3(s.x, 0, s.z),
      radius: HOUSE_WALL_COLLIDER_RADIUS,
    })),
    { position: new Vec3(hx + HOUSE.tv.x, 0, hz + HOUSE.tv.z), radius: 0.6 },
    { position: new Vec3(hx + HOUSE.table.x, 0, hz + HOUSE.table.z), radius: 0.85 },
  ];
};

const buildWorld = (def: WorldDef): World => {
  const terrain = buildTerrain(def);
  const portals = def.portals.map(
    (p) =>
      new Portal(
        p.id,
        new Vec3(p.x, 0, p.z),
        p.yaw,
        PORTAL_HALF_WIDTH,
        PORTAL_HEIGHT,
        p.targetWorldId,
        p.targetPortalId,
      ),
  );
  const npcs = def.npcs.map((spec, i) => {
    const npc = new Npc(
      `${def.id}-npc-${i}`,
      spec.name,
      new Vec3(spec.x, 0, spec.z),
      NPC_ANCHOR_Y,
      spec.bubble,
      spec.dialogue,
      new Vec3(spec.x, 0, spec.z),
      spec.wanderRadius,
      def.id.charCodeAt(0) * 7919 + i * 104729, // ワールド・個体ごとに異なる決定的シード
    );
    if (spec.wanderRadius <= 0) {
      // 静止NPCは指定の向き、なければ広場の中心(原点)を向いて立つ
      npc.yaw = spec.yaw ?? Math.atan2(spec.x, spec.z);
    }
    npc.moveTo(spec.x, spec.z, terrain.heightAt(spec.x, spec.z)); // 初期位置を地形へスナップ
    return npc;
  });
  return new World(
    def.id,
    def.name,
    portals,
    [
      ...toInteractables(def.objects, def.id, terrain),
      ...houseInteractables(def),
      ...portals.map(portalInteractable),
      ...npcs,
    ],
    [
      ...toColliders(def.objects),
      ...houseColliders(def),
      ...portals.flatMap(portalPillarColliders),
      ...npcs.map((n) => n.collider),
    ],
    npcs,
    terrain,
  );
};

const player = new Player(new Vec3(0, 0, 4), Vec3.ZERO, 0, 0);
const session = new GameSession(WORLD_DEFS.map(buildWorld), 'day', player);

// --- サービス・ユースケース ---
const movement = new MovementService();
const traversal = new PortalTraversalService();
const interaction = new InteractionService();
const applyStick = new ApplyStickUseCase(session);
const applyDash = new ApplyDashUseCase(session, movement);
const applyLook = new ApplyLookUseCase(session);
const stopMovement = new StopMovementUseCase(session, movement);
const tapInteract = new TapInteractUseCase(
  session,
  interaction,
  INTERACT_RANGE,
  INTERACT_FRONT_DOT,
);
const nearbyBubble = new NearbyBubbleUseCase(session, interaction, BUBBLE_RANGE);
const tick = new TickUseCase(
  session,
  movement,
  traversal,
  new CollisionService(),
  new NpcWanderService(),
  DIALOGUE_BREAK_RANGE,
);

// --- アダプタ(描画・入力) ---
const container = document.getElementById('app');
const worldNameEl = document.getElementById('world-name');
const hintEl = document.getElementById('hint');
const bubbleEl = document.getElementById('bubble');
const dialogEl = document.getElementById('dialog');
const dialogTextEl = document.getElementById('dialog-text');
if (!container || !worldNameEl || !hintEl || !bubbleEl || !dialogEl || !dialogTextEl) {
  throw new Error('required DOM elements are missing');
}

const renderer = new ThreeRendererAdapter(container, session);
const stickInput = new VirtualStickInputAdapter(renderer.canvas, {
  onStickEnd: () => stopMovement.execute(),
  onDash: (dx, dy) => applyDash.execute({ dx, dy }),
  onLook: (dx, dy) => applyLook.execute(dx, dy),
  onTap: () => tapInteract.execute(),
});

// --- 吹き出し・メッセージウィンドウのUI更新 ---
function updateInteractionUi(): void {
  if (session.dialogue) {
    dialogTextEl!.textContent = session.dialogue.currentLine;
    dialogEl!.classList.add('visible');
  } else {
    dialogEl!.classList.remove('visible');
  }

  const target = nearbyBubble.execute();
  if (target) {
    const point = renderer.projectToScreen(target.position);
    if (point.visible) {
      bubbleEl!.textContent = target.bubbleText;
      bubbleEl!.style.left = `${point.x}px`;
      bubbleEl!.style.top = `${point.y}px`;
      bubbleEl!.classList.add('visible');
      return;
    }
  }
  bubbleEl!.classList.remove('visible');
}

setTimeout(() => hintEl.classList.add('hidden'), 5000);

// --- ゲームループ ---
let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30); // タブ復帰時の暴走防止
  lastTime = now;

  applyStick.execute(stickInput.getStick());
  const result = tick.execute(dt);
  if (result.traversed) {
    worldNameEl!.textContent = session.currentWorld.name;
  }

  updateInteractionUi();
  renderer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
