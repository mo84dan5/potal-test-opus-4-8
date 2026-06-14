import { GameSession } from './domain/entities/GameSession';
import { EventProp } from './domain/entities/EventProp';
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
import { EventService } from './domain/services/EventService';
import { SaveService } from './domain/services/SaveService';
import { systemClock } from './domain/values/Clock';
import { Base64JsonSnapshotCodec } from './adapters/persistence/Base64JsonSnapshotCodec';
import { PngSaveImageCodec } from './adapters/persistence/PngSaveImageCodec';
import { BattleService } from './domain/services/BattleService';
import { BattleSession } from './domain/entities/BattleSession';
import { ChoicePrompt } from './domain/values/Choice';
import { BattleOverlayAdapter } from './adapters/ui/BattleOverlayAdapter';
import { BattleArenaAdapter } from './adapters/ui/BattleArenaAdapter';
import { ChoiceOverlayAdapter } from './adapters/ui/ChoiceOverlayAdapter';
import { Collider } from './domain/values/Collider';
import { CliffField, HeightField, HillyTerrain, TwoFloorField } from './domain/values/Terrain';
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
  PORTAL_HOUSE,
  PORTAL_HOUSE_WALL_COLLIDER_RADIUS,
  PORTAL_PILLAR_RADIUS,
  portalHouseWallColliderSpots,
  CLIFF,
  EVENTS,
  BATTLES,
  ROOM_WALL_COLLIDER_RADIUS,
  roomWallColliderSpots,
  TWO_FLOOR,
  TWO_FLOOR_STAIR_BLOCKER_RADIUS,
  TWO_FLOOR_STAIR_BLOCKER_YMAX,
  twoFloorStairBlockerSpots,
  WORLD_DEFS,
  WorldDef,
  WorldObjectSpec,
} from './config/worldContent';
import { ApplyDashUseCase } from './application/usecases/ApplyDashUseCase';
import { ApplyLookUseCase } from './application/usecases/ApplyLookUseCase';
import { ApplyStickUseCase } from './application/usecases/ApplyStickUseCase';
import { StartGlideUseCase } from './application/usecases/StartGlideUseCase';
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

const DOOR_BUBBLE_ANCHOR_Y = 2.6;
const portalInteractable = (portal: Portal): Interactable => {
  if (portal.isDoor) {
    // 扉: タップで入室(doorPortalId を持たせる)。会話コメントは持たない
    return new Interactable(
      `interact-${portal.id}`,
      '扉',
      portal.position.withY(DOOR_BUBBLE_ANCHOR_Y),
      `タップで「${worldName(portal.targetWorldId)}」に入る`,
      [],
      portal.id,
    );
  }
  return new Interactable(
    `interact-${portal.id}`,
    'ポータル',
    portal.position.withY(PORTAL_BUBBLE_ANCHOR_Y),
    `ポータルだ。「${worldName(portal.targetWorldId)}」へつながっている`,
    [],
  );
};

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

// 扉(isDoor)の開口を塞ぐコライダー列。歩いて通り抜けられないようにする(入室はタップのみ)
const DOOR_BLOCKER_RADIUS = 0.5;
const doorBlockerColliders = (portal: Portal): Collider[] => {
  if (!portal.isDoor) return [];
  const colliders: Collider[] = [];
  const half = portal.halfWidth + 0.6; // 開口より少し広く、両脇の壁コライダーと重ねる
  for (let o = -half; o <= half + 1e-6; o += 0.5) {
    colliders.push({
      position: portal.position.add(portal.tangent.scale(o)),
      radius: DOOR_BLOCKER_RADIUS,
    });
  }
  return colliders;
};

const NPC_ANCHOR_Y = 2.0;
const FLAT_PORTAL_RADIUS = 5; // ポータル周辺の平坦化半径 [m]
const FLAT_SPAWN_RADIUS = 4; // スポーン(原点)の平坦化半径 [m]

// 地形: ワールドごとの振幅+ポータル・スポーン周辺の平坦化
const FLAT_HOUSE_RADIUS = 7; // 家の周辺の平坦化半径 [m]
// 家のフットプリント(半対角)を完全に覆う平坦域。床が地面の起伏で突き抜けないようにする。
// 半対角 = hypot(width/2, depth/2) に少し余白を足す。
const FLAT_HOUSE_PLATEAU_RADIUS =
  Math.hypot(HOUSE.width / 2, HOUSE.depth / 2) + 0.6;
// 室内ワールド型の家(小屋)のフットプリントを覆う平坦域
const FLAT_PORTAL_HOUSE_PLATEAU_RADIUS =
  Math.hypot(PORTAL_HOUSE.width / 2, PORTAL_HOUSE.depth / 2) + 0.6;

const buildTerrain = (def: WorldDef): HeightField => {
  // 2階建ての家(室内): 階段+ロフトの高さ場
  if (def.floorKind === 'two-floor') return new TwoFloorField(TWO_FLOOR);
  const hilly = new HillyTerrain(def.terrainAmplitude, [
    ...def.portals.map((p) => ({ x: p.x, z: p.z, radius: FLAT_PORTAL_RADIUS })),
    { x: 0, z: 0, radius: FLAT_SPAWN_RADIUS },
    ...(def.house
      ? [{
          x: def.house.x,
          z: def.house.z,
          radius: FLAT_HOUSE_RADIUS,
          flatRadius: FLAT_HOUSE_PLATEAU_RADIUS,
        }]
      : []),
    ...(def.portalHouses ?? []).map((ph) => ({
      x: ph.x,
      z: ph.z,
      radius: FLAT_HOUSE_RADIUS,
      flatRadius: FLAT_PORTAL_HOUSE_PLATEAU_RADIUS,
    })),
  ]);
  // よじ登れる崖(メサ)を地形に重ねる
  if (!def.cliff) return hilly;
  return new CliffField(hilly, [{ x: def.cliff.x, z: def.cliff.z, ...CLIFF }]);
};

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

// 室内ワールド型の家(外観小屋)の壁コライダー(+Z面のドア開口=ポータルは通過可能)。複数棟対応
const portalHouseColliders = (def: WorldDef): Collider[] =>
  (def.portalHouses ?? []).flatMap((ph) =>
    portalHouseWallColliderSpots(ph.x, ph.z).map((s) => ({
      position: new Vec3(s.x, 0, s.z),
      radius: PORTAL_HOUSE_WALL_COLLIDER_RADIUS,
    })),
  );

// 2階建ての家(室内)の階段ブロッカー: 階段の裏(下)への1階からの侵入を防ぐ。
// 高さ制限(yMax<floorHeight)付きなので、ロフト(2階)の歩行には影響しない。
const twoFloorStairBlockers = (def: WorldDef): Collider[] => {
  if (def.floorKind !== 'two-floor') return [];
  return twoFloorStairBlockerSpots().map((s) => ({
    position: new Vec3(s.x, 0, s.z),
    radius: TWO_FLOOR_STAIR_BLOCKER_RADIUS,
    yMin: 0,
    yMax: TWO_FLOOR_STAIR_BLOCKER_YMAX,
  }));
};

// 室内ワールド(部屋)の壁コライダー。玄関の戻りポータル位置に開口を空ける
const PORTAL_DOOR_GAP_WIDTH = PORTAL_HALF_WIDTH * 2 + 0.6;
const roomColliders = (def: WorldDef): Collider[] => {
  if (!def.room) return [];
  const doorX = def.portals[0]?.x ?? 0; // 玄関(戻り)ポータルのX
  return roomWallColliderSpots(def.room, doorX, PORTAL_DOOR_GAP_WIDTH).map((s) => ({
    position: new Vec3(s.x, 0, s.z),
    radius: ROOM_WALL_COLLIDER_RADIUS,
  }));
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
        p.kind === 'door',
      ),
  );
  const npcs = def.npcs.map((spec, i) => {
    // battleId を持つNPCは、会話の最後に「戦う?(はい/いいえ)」の選択肢を提示する
    const choiceOnEnd: ChoicePrompt | null = spec.battleId
      ? {
          question: '戦う?',
          options: [
            { label: 'はい', value: `battle:${spec.battleId}` },
            { label: 'いいえ', value: 'no' },
          ],
        }
      : null;
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
      spec.eventId ? EVENTS[spec.eventId] : null,
      choiceOnEnd,
    );
    if (spec.wanderRadius <= 0) {
      // 静止NPCは指定の向き、なければ広場の中心(原点)を向いて立つ
      npc.yaw = spec.yaw ?? Math.atan2(spec.x, spec.z);
    }
    npc.homeYaw = npc.yaw; // イベント帰宅後に元の向きへ戻すため記録
    npc.moveTo(spec.x, spec.z, terrain.heightAt(spec.x, spec.z)); // 初期位置を地形へスナップ
    return npc;
  });
  const props = (def.props ?? []).map(
    (p) => new EventProp(p.id, new Vec3(p.x, 0, p.z), p.collisionRadius, p.size),
  );
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
      ...portalHouseColliders(def),
      ...roomColliders(def),
      ...twoFloorStairBlockers(def),
      ...portals.flatMap(portalPillarColliders),
      ...portals.flatMap(doorBlockerColliders),
      ...npcs.map((n) => n.collider),
    ],
    npcs,
    terrain,
    props,
  );
};

const player = new Player(new Vec3(0, 0, 4), Vec3.ZERO, 0, 0);
const session = new GameSession(WORLD_DEFS.map(buildWorld), 'day', player);

// --- サービス・ユースケース ---
const movement = new MovementService();
const traversal = new PortalTraversalService();
const interaction = new InteractionService();
const applyStick = new ApplyStickUseCase(session);
const startGlide = new StartGlideUseCase(session);
const eventService = new EventService(movement);
const APP_NAME = 'Portal Walk';
const saveService = new SaveService(APP_NAME, systemClock);
const snapshotCodec = new Base64JsonSnapshotCodec();
const imageCodec = new PngSaveImageCodec();
const battleService = new BattleService();
const applyDash = new ApplyDashUseCase(session, movement);
const applyLook = new ApplyLookUseCase(session);
const stopMovement = new StopMovementUseCase(session, movement);
const tapInteract = new TapInteractUseCase(
  session,
  interaction,
  INTERACT_RANGE,
  INTERACT_FRONT_DOT,
  traversal,
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
const glideEl = document.getElementById('glide');
const climbEl = document.getElementById('climb');
const viewBtn = document.getElementById('view-btn');
const saveBtn = document.getElementById('save-btn');
const savePanel = document.getElementById('save-panel');
const saveCodeEl = document.getElementById('save-code') as HTMLTextAreaElement | null;
const saveCopyBtn = document.getElementById('save-copy');
const saveLoadBtn = document.getElementById('save-load');
const saveCloseBtn = document.getElementById('save-close');
const saveStatusEl = document.getElementById('save-status');
const saveImageBtn = document.getElementById('save-image');
const saveImageLoadBtn = document.getElementById('save-image-load');
const saveImagePreviewEl = document.getElementById('save-image-preview') as HTMLImageElement | null;
const saveImageFileEl = document.getElementById('save-image-file') as HTMLInputElement | null;
const choiceOverlayEl = document.getElementById('choice-overlay');
const battleOverlayEl = document.getElementById('battle-overlay');
if (
  !container || !worldNameEl || !hintEl || !bubbleEl || !dialogEl || !dialogTextEl ||
  !glideEl || !climbEl || !viewBtn || !saveBtn || !savePanel || !saveCodeEl ||
  !saveCopyBtn || !saveLoadBtn || !saveCloseBtn || !saveStatusEl ||
  !saveImageBtn || !saveImageLoadBtn || !saveImagePreviewEl || !saveImageFileEl ||
  !choiceOverlayEl || !battleOverlayEl
) {
  throw new Error('required DOM elements are missing');
}

const renderer = new ThreeRendererAdapter(container, session);

// 視点モード切替(1人称/3人称)ボタン
viewBtn.addEventListener('click', () => {
  const mode = renderer.toggleCameraMode();
  viewBtn.textContent = mode === 'third' ? '🧍 3人称' : '👤 1人称';
});

// --- セーブ/ロード(文字列コードのコピー&ペースト)---
let savePanelOpen = false;
const closeSavePanel = (): void => {
  savePanelOpen = false;
  savePanel.classList.remove('visible');
  saveImagePreviewEl.classList.remove('visible');
  saveImagePreviewEl.removeAttribute('src');
};
// 文字列をクリップボードへコピー(可視テキストエリアは空のまま=貼り付け用に保つ)
const copyToClipboard = (text: string): Promise<boolean> => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }
  try {
    const tmp = document.createElement('textarea');
    tmp.value = text;
    tmp.style.position = 'fixed';
    tmp.style.opacity = '0';
    document.body.appendChild(tmp);
    tmp.select();
    const ok = document.execCommand('copy');
    tmp.remove();
    return Promise.resolve(ok);
  } catch {
    return Promise.resolve(false);
  }
};
saveBtn.addEventListener('click', () => {
  if (session.activeEvent) return; // イベント中は不可
  stopMovement.execute(); // パネル中は移動を止める
  saveCodeEl.value = ''; // 空のまま表示(貼り付け=ロード用)。コピーは「コピー」ボタンで
  saveStatusEl.textContent = '';
  saveImagePreviewEl.classList.remove('visible');
  saveImagePreviewEl.removeAttribute('src');
  savePanelOpen = true;
  savePanel.classList.add('visible');
});
saveCopyBtn.addEventListener('click', () => {
  const code = snapshotCodec.encode(saveService.capture(session));
  copyToClipboard(code).then((ok) => {
    saveStatusEl.textContent = ok ? 'コードをコピーしました。' : 'コピーに失敗しました。';
  });
});
saveLoadBtn.addEventListener('click', () => {
  try {
    const snapshot = snapshotCodec.decode(saveCodeEl.value);
    saveService.restore(session, snapshot);
    worldNameEl.textContent = session.currentWorld.name;
    saveStatusEl.textContent = 'ロードしました。';
    closeSavePanel();
  } catch (e) {
    saveStatusEl.textContent = e instanceof Error ? e.message : 'ロードに失敗しました。';
  }
});
// 画像で保存: 現在のスナップショットを画像化してプレビュー表示(長押し/保存で写真へ)
saveImageBtn.addEventListener('click', () => {
  const snapshot = saveService.capture(session);
  const code = snapshotCodec.encode(snapshot);
  const dataUrl = imageCodec.encode(code, { appName: snapshot.appName, savedAt: snapshot.savedAt });
  saveImagePreviewEl.src = dataUrl;
  saveImagePreviewEl.classList.add('visible');
  saveStatusEl.textContent = '画像を長押しして「写真に追加」で保存できます。';
});
// 画像から読込: ファイル選択を促す
saveImageLoadBtn.addEventListener('click', () => {
  saveImageFileEl.value = ''; // 同じファイルを連続で選んでも change が発火するように
  saveImageFileEl.click();
});
saveImageFileEl.addEventListener('change', () => {
  const file = saveImageFileEl.files?.[0];
  if (!file) return;
  imageCodec
    .decode(file)
    .then((code) => {
      const snapshot = snapshotCodec.decode(code);
      saveService.restore(session, snapshot);
      worldNameEl.textContent = session.currentWorld.name;
      saveStatusEl.textContent = '画像からロードしました。';
      closeSavePanel();
    })
    .catch((e: unknown) => {
      saveStatusEl.textContent = e instanceof Error ? e.message : '画像からロードできませんでした。';
    });
});
saveCloseBtn.addEventListener('click', closeSavePanel);

// --- 戦闘 / 選択肢オーバーレイ ---
// 戦闘終了で activeBattle を解除し、元の世界へ戻す(進行状況・フラグは不変)
const battleArena = new BattleArenaAdapter();
const battleOverlay = new BattleOverlayAdapter(battleOverlayEl, battleService, battleArena, () => {
  session.activeBattle = null;
});
// 「はい/いいえ」の選択。'battle:<id>' なら戦闘開始、それ以外は閉じるだけ(振る舞いはここで解釈)
const choiceOverlay = new ChoiceOverlayAdapter(choiceOverlayEl, (value) => {
  session.choice = null;
  choiceOverlay.close();
  if (value.startsWith('battle:')) {
    const def = BATTLES[value.slice('battle:'.length)];
    if (def) {
      session.activeBattle = new BattleSession(def);
      battleOverlay.open(session.activeBattle);
    }
  }
});

// イベント中・セーブパネル/選択肢/戦闘表示中は見回し(onLook)以外の操作をロックする
const inputLocked = (): boolean =>
  session.activeEvent !== null ||
  savePanelOpen ||
  session.choice !== null ||
  session.activeBattle !== null;
const stickInput = new VirtualStickInputAdapter(renderer.canvas, {
  onStickEnd: () => {
    if (inputLocked()) return;
    stopMovement.execute();
  },
  onDash: (dx, dy) => {
    if (inputLocked()) return;
    applyDash.execute({ dx, dy });
  },
  onLook: (dx, dy) => applyLook.execute(dx, dy), // 見回しは常に可
  onTap: () => {
    if (inputLocked()) return;
    // 落下中(滞空中)のタップは滑空開始に使い、会話/扉は発火させない
    if (startGlide.execute()) return;
    // 扉タップで入室したら世界名表示を更新する
    if (tapInteract.execute()) {
      worldNameEl.textContent = session.currentWorld.name;
    }
    // 会話の最後で選択肢が提示されたらオーバーレイを開く(移動は止める)
    if (session.choice) {
      stopMovement.execute();
      choiceOverlay.open(session.choice);
    }
  },
  // 2本目の指の接地: 落下中なら滑空開始(移動スティックを押したまま起動できる)
  onSecondaryTouch: () => {
    if (inputLocked()) return;
    startGlide.execute();
  },
});

// --- 吹き出し・メッセージウィンドウのUI更新 ---
function updateInteractionUi(): void {
  // 選択肢・戦闘中はワールドのUI(会話/吹き出し)を隠す(オーバーレイが前面)
  if (session.choice || session.activeBattle) {
    dialogEl!.classList.remove('visible', 'event');
    bubbleEl!.classList.remove('visible');
    return;
  }
  if (session.eventMessage) {
    // イベント中のメッセージ(タップ送りではないので「タップで進む」表示は隠す)
    dialogTextEl!.textContent = session.eventMessage;
    dialogEl!.classList.add('visible', 'event');
  } else if (session.dialogue) {
    dialogTextEl!.textContent = session.dialogue.currentLine;
    dialogEl!.classList.add('visible');
    dialogEl!.classList.remove('event');
  } else {
    dialogEl!.classList.remove('visible', 'event');
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

  // 戦闘中・選択肢表示中は世界を凍結する(オーバーレイが操作を受け持つ)
  if (!session.activeBattle && !session.choice) {
    if (session.activeEvent) {
      // イベント進行(walkTo は desiredVelocity を設定、moveProp はプロップを動かす)
      eventService.tick(session, dt);
    } else if (!savePanelOpen) {
      applyStick.execute(stickInput.getStick());
    }
    const result = tick.execute(dt);
    if (result.traversed) {
      worldNameEl!.textContent = session.currentWorld.name;
    }
  }

  glideEl!.classList.toggle('visible', session.player.gliding);
  climbEl!.classList.toggle('visible', session.player.climbing);
  // イベント中・選択肢/戦闘中はセーブ不可
  saveBtn!.style.display =
    session.activeEvent || session.choice || session.activeBattle ? 'none' : '';
  updateInteractionUi();
  renderer.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
