import * as THREE from 'three';
import { GameSession } from '../../domain/entities/GameSession';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { HeightField } from '../../domain/values/Terrain';
import { Vec3 } from '../../domain/values/Vec3';
import { computeThirdPersonCamera, occludedCameraDistance, smoothTowards } from './cameraView';

/** 3人称カメラのブーム距離スムージングの強さ [1/s] */
const CAMERA_SMOOTH_RATE = 12;
import {
  CLIFF,
  HOUSE,
  HouseSpec,
  PORTAL_HOUSE,
  PortalHouseSpec,
  RoomSpec,
  TWO_FLOOR,
  WORLD_DEFS,
  WorldObjectSpec,
} from '../../config/worldContent';

export interface ScreenPoint {
  x: number;
  y: number;
  /** カメラの前方かつ画面近傍に投影されたか */
  visible: boolean;
}

interface WorldView {
  scene: THREE.Scene;
  /** ポータルID → 「向こう側」を映す面メッシュ */
  portalSurfaces: Map<string, THREE.Mesh>;
  /** ポータルID → 面マテリアル(テクスチャは毎フレーム割当) */
  portalMaterials: Map<string, THREE.ShaderMaterial>;
  /** NPC ID → メッシュ(毎フレーム位置・向きを反映) */
  npcMeshes: Map<string, THREE.Group>;
}

const PORTAL_VERTEX_SHADER = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 仮想カメラはメインカメラと同じ射影行列を使うため、
// スクリーン空間UVでレンダーターゲットを引くと正しい視差になる
const PORTAL_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D portalTexture;
  uniform vec2 resolution;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    gl_FragColor = texture2D(portalTexture, uv);
  }
`;

/** ドメインの状態を three.js で描画するプレゼンテーションアダプタ */
export class ThreeRendererAdapter {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly virtualCamera: THREE.PerspectiveCamera;
  /** 現在ワールドのポータルに毎フレーム割り当てるレンダーターゲットのプール */
  private readonly renderTargetPool: THREE.WebGLRenderTarget[] = [];
  private readonly views = new Map<string, WorldView>();
  /** 視点モード('first'=1人称 / 'third'=3人称) */
  private cameraMode: 'first' | 'third' = 'first';
  /** 3人称時に表示するプレイヤーのアバター(現在ワールドのシーンへ毎フレーム配置) */
  private readonly avatar: THREE.Group;
  /** 3人称カメラの遮蔽回避用レイキャスタ */
  private readonly cameraRay = new THREE.Raycaster();
  /** 3人称カメラのブーム距離(スムージング用)。null は未初期化(=次フレーム即スナップ) */
  private smoothedCamDist: number | null = null;

  constructor(
    container: HTMLElement,
    private readonly session: GameSession,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.05,
      300,
    );
    this.camera.rotation.order = 'YXZ';
    this.virtualCamera = this.camera.clone();

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const maxPortals = Math.max(
      ...this.session.allWorlds.map((w) => w.portals.length),
    );
    for (let i = 0; i < maxPortals; i++) {
      this.renderTargetPool.push(new THREE.WebGLRenderTarget(size.x, size.y));
    }

    for (const world of this.session.allWorlds) {
      this.views.set(world.id, this.buildWorld(world, size));
    }

    this.avatar = buildNpcMesh(0x4a8ad0); // プレイヤーのアバター(青)
    this.avatar.visible = false;

    window.addEventListener('resize', this.onResize);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** 1人称/3人称を切り替え、切替後のモードを返す */
  toggleCameraMode(): 'first' | 'third' {
    this.cameraMode = this.cameraMode === 'first' ? 'third' : 'first';
    return this.cameraMode;
  }

  /** ワールド座標をスクリーン座標 [px] へ投影する(吹き出しの位置決め用) */
  projectToScreen(p: Vec3): ScreenPoint {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * window.innerWidth,
      y: ((1 - v.y) / 2) * window.innerHeight,
      visible: v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1,
    };
  }

  render(dt = 1 / 60): void {
    const world = this.session.currentWorld;
    const view = this.viewOf(world.id);
    this.syncCamera(this.session.player, view.scene, dt);
    this.syncNpcs();
    this.syncAvatar(view.scene);

    // 現在ワールドの各ポータルについて、接続先ワールドをレンダーターゲットへ描画する
    world.portals.forEach((portal, index) => {
      if (portal.isDoor) return; // 扉は透過しない(接続先を描かない)
      const rt = this.renderTargetPool[index];
      const targetWorld = this.session.getWorld(portal.targetWorldId);
      const targetPortal = targetWorld.getPortal(portal.targetPortalId);
      const targetView = this.viewOf(targetWorld.id);

      // 仮想カメラ姿勢 = M(出口) × FlipY180 × M(入口)⁻¹ × メインカメラ姿勢
      const m = this.portalMatrix(targetPortal)
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
        .multiply(this.portalMatrix(portal).invert())
        .multiply(this.camera.matrixWorld);
      m.decompose(
        this.virtualCamera.position,
        this.virtualCamera.quaternion,
        this.virtualCamera.scale,
      );
      this.virtualCamera.projectionMatrix.copy(this.camera.projectionMatrix);
      this.virtualCamera.projectionMatrixInverse.copy(
        this.camera.projectionMatrixInverse,
      );

      // 接続先シーンの全ポータル面を隠して再帰描画・フィードバックを防ぐ
      this.setPortalSurfacesVisible(targetView, false);
      this.renderer.setRenderTarget(rt);
      this.renderer.render(targetView.scene, this.virtualCamera);
      this.setPortalSurfacesVisible(targetView, true);

      const material = view.portalMaterials.get(portal.id);
      if (material) material.uniforms.portalTexture.value = rt.texture;
    });

    this.renderer.setRenderTarget(null);
    this.renderer.render(view.scene, this.camera);
  }

  /** 3人称時のみ、現在ワールドのシーンにアバターを配置する(位置=足元・向き=yaw) */
  private syncAvatar(scene: THREE.Scene): void {
    if (this.cameraMode !== 'third') {
      this.avatar.visible = false;
      return;
    }
    if (this.avatar.parent !== scene) scene.add(this.avatar); // 現在シーンへ(再ペアレント)
    const p = this.session.player.position;
    this.avatar.position.set(p.x, p.y, p.z);
    this.avatar.rotation.y = this.session.player.yaw;
    this.avatar.visible = true;
  }

  /** 全ワールドのNPCメッシュへドメインの位置・向きを反映(ポータル越しの姿も動く) */
  private syncNpcs(): void {
    for (const world of this.session.allWorlds) {
      const view = this.views.get(world.id);
      if (!view) continue;
      for (const npc of world.npcs) {
        const mesh = view.npcMeshes.get(npc.id);
        if (!mesh) continue;
        const feet = npc.feet;
        mesh.position.set(feet.x, feet.y, feet.z);
        mesh.rotation.y = npc.yaw;
      }
    }
  }

  private setPortalSurfacesVisible(view: WorldView, visible: boolean): void {
    for (const surface of view.portalSurfaces.values()) {
      surface.visible = visible;
    }
  }

  private viewOf(worldId: string): WorldView {
    const view = this.views.get(worldId);
    if (!view) throw new Error(`view not built for world: ${worldId}`);
    return view;
  }

  private syncCamera(player: Player, scene: THREE.Scene, dt: number): void {
    if (this.cameraMode === 'third') {
      const cam = computeThirdPersonCamera(player.position, player.yaw, player.pitch, 4, 1.4);
      const target = new THREE.Vector3(cam.target.x, cam.target.y, cam.target.z);
      const desired = new THREE.Vector3(cam.position.x, cam.position.y, cam.position.z);
      // 注視点→希望位置へレイを飛ばし、遮蔽物があれば手前へ寄せる
      const toCam = desired.clone().sub(target);
      const desiredDist = toCam.length();
      const dir = toCam.clone().normalize();
      this.cameraRay.set(target, dir);
      this.cameraRay.far = desiredDist;
      // アバター(主人公自身)はレイ対象から除外する
      const targets = scene.children.filter((c) => c !== this.avatar);
      const hits = this.cameraRay.intersectObjects(targets, true);
      const dist = occludedCameraDistance(desiredDist, hits.length ? hits[0].distance : null);
      // ブーム距離をスムージング(遮蔽の出入りをなめらかに)。初回は即スナップ
      this.smoothedCamDist =
        this.smoothedCamDist === null
          ? dist
          : smoothTowards(this.smoothedCamDist, dist, CAMERA_SMOOTH_RATE, dt);
      const pos = target.clone().addScaledVector(dir, this.smoothedCamDist);
      this.camera.position.copy(pos);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      return;
    }
    // 1人称は頭に固定(補間しない)。次に3人称へ入る時は即スナップ
    this.smoothedCamDist = null;
    const eye = player.eyePosition;
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.set(player.pitch, player.yaw, 0);
    this.camera.updateMatrixWorld();
  }

  private portalMatrix(portal: Portal): THREE.Matrix4 {
    return new THREE.Matrix4()
      .makeRotationY(portal.yaw)
      .setPosition(portal.position.x, portal.position.y, portal.position.z);
  }

  private readonly onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    for (const rt of this.renderTargetPool) rt.setSize(size.x, size.y);
    for (const view of this.views.values()) {
      for (const material of view.portalMaterials.values()) {
        (material.uniforms.resolution.value as THREE.Vector2).copy(size);
      }
    }
  };

  // --- 以下、ワールドのシーン構築(プレゼンテーション都合の見た目定義) ---

  private buildWorld(world: World, size: THREE.Vector2): WorldView {
    const scene = new THREE.Scene();
    const def = WORLD_DEFS.find((d) => d.id === world.id);
    if (def?.interior && def.floorKind === 'two-floor') {
      this.buildTwoFloorInterior(scene);
    } else if (def?.interior && def.room) {
      this.buildRoom(scene, def.room);
    } else {
      this.buildEnvironment(scene, world.id, world.terrain);
    }
    if (def) this.buildObjects(scene, def.objects, world.terrain);
    if (def?.house) this.buildHouse(scene, def.house, world.terrain);
    for (const ph of def?.portalHouses ?? []) {
      this.buildPortalHouse(scene, ph, world.terrain);
    }
    if (def?.cliff) this.buildCliff(scene, def.cliff);

    const npcMeshes = new Map<string, THREE.Group>();
    world.npcs.forEach((npc, i) => {
      const mesh = buildNpcMesh(def?.npcs[i]?.color ?? 0xe06a3c);
      const feet = npc.feet;
      mesh.position.set(feet.x, feet.y, feet.z);
      mesh.rotation.y = npc.yaw;
      scene.add(mesh);
      npcMeshes.set(npc.id, mesh);
    });

    const portalSurfaces = new Map<string, THREE.Mesh>();
    const portalMaterials = new Map<string, THREE.ShaderMaterial>();
    for (const portal of world.portals) {
      const frameColor =
        def?.portals.find((p) => p.id === portal.id)?.frameColor ?? 0xffffff;
      if (portal.isDoor) {
        // 扉は閉じた扉として描画する(透過面・RT描画なし)
        this.buildDoorMesh(scene, portal, frameColor);
        continue;
      }
      const material = new THREE.ShaderMaterial({
        uniforms: {
          portalTexture: { value: null },
          resolution: { value: size.clone() },
        },
        vertexShader: PORTAL_VERTEX_SHADER,
        fragmentShader: PORTAL_FRAGMENT_SHADER,
        side: THREE.DoubleSide,
      });
      const surface = this.buildPortalMeshes(scene, portal, frameColor, material);
      portalSurfaces.set(portal.id, surface);
      portalMaterials.set(portal.id, material);
    }
    return { scene, portalSurfaces, portalMaterials, npcMeshes };
  }

  private buildEnvironment(
    scene: THREE.Scene,
    worldId: string,
    terrain: HeightField,
  ): void {
    switch (worldId) {
      case 'day': {
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 30, 90);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.1));
        const sun = new THREE.DirectionalLight(0xfff4d6, 1.4);
        sun.position.set(10, 20, 8);
        scene.add(sun);
        this.addGround(scene, 'grass', terrain);
        break;
      }
      case 'night': {
        scene.background = new THREE.Color(0x0b1026);
        scene.fog = new THREE.Fog(0x0b1026, 30, 90);
        scene.add(new THREE.HemisphereLight(0x8899ff, 0x221144, 0.5));
        const moonLight = new THREE.DirectionalLight(0xaabbff, 0.7);
        moonLight.position.set(-8, 18, -6);
        scene.add(moonLight);
        this.addGround(scene, 'dirt', terrain);

        const moon = new THREE.Mesh(
          new THREE.SphereGeometry(2.4, 24, 24),
          new THREE.MeshBasicMaterial({ color: 0xf3f1d8 }),
        );
        moon.position.set(-20, 26, -34);
        scene.add(moon);
        scene.add(this.buildStars());
        break;
      }
      case 'snow': {
        scene.background = new THREE.Color(0xdce9f5);
        scene.fog = new THREE.Fog(0xdce9f5, 25, 80);
        scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe0ee, 1.0));
        const winterSun = new THREE.DirectionalLight(0xeef6ff, 0.9);
        winterSun.position.set(6, 16, 10);
        scene.add(winterSun);
        this.addGround(scene, 'snow', terrain);
        break;
      }
      case 'ruins': {
        scene.background = new THREE.Color(0xffb37a);
        scene.fog = new THREE.Fog(0xffb37a, 28, 85);
        scene.add(new THREE.HemisphereLight(0xffd9b0, 0x6b4a33, 0.9));
        const dusk = new THREE.DirectionalLight(0xffa45e, 1.1);
        dusk.position.set(-12, 8, -10);
        scene.add(dusk);
        this.addGround(scene, 'stone', terrain);

        const sun = new THREE.Mesh(
          new THREE.SphereGeometry(3, 24, 24),
          new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
        );
        sun.position.set(-30, 8, -38);
        scene.add(sun);
        break;
      }
    }
  }

  /** 室内ワールド: 床・天井・四方の壁・暖色光で囲まれた広い部屋を描く(屋外環境なし) */
  private buildRoom(scene: THREE.Scene, room: RoomSpec): void {
    scene.background = new THREE.Color(0x241d2e);
    scene.add(new THREE.HemisphereLight(0xfff0d8, 0x2a2030, 0.85));
    const lamp = new THREE.PointLight(0xffe6b8, 1.3, 0, 0); // distance=0 → 減衰なし
    lamp.position.set(0, room.height - 0.6, 0);
    scene.add(lamp);

    const w = room.width / 2;
    const d = room.depth / 2;
    const h = room.height;
    const t = 0.3; // 壁の厚さ

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width, room.depth),
      new THREE.MeshLambertMaterial({ color: 0x6b5a45 }),
    );
    floor.rotateX(-Math.PI / 2);
    scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width, room.depth),
      new THREE.MeshLambertMaterial({ color: 0x342c44, side: THREE.DoubleSide }),
    );
    ceiling.rotateX(Math.PI / 2);
    ceiling.position.y = h;
    scene.add(ceiling);

    const wallMat = new THREE.MeshLambertMaterial({
      color: 0xcdbfa6,
      side: THREE.DoubleSide,
    });
    const wall = (sx: number, sz: number, x: number, z: number): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), wallMat);
      m.position.set(x, h / 2, z);
      scene.add(m);
    };
    wall(room.width, t, 0, -d); // 玄関壁(-Z)
    wall(room.width, t, 0, d); // 奥壁(+Z)
    wall(t, room.depth, -w, 0); // 左壁
    wall(t, room.depth, w, 0); // 右壁
  }

  /**
   * 2階建ての家(室内)。1階+右側の階段+奥のロフト(2階)+手すり+家具を描く。
   * 高さ場(TwoFloorField)と座標を共有するので、見た目と歩ける高さが一致する。
   */
  private buildTwoFloorInterior(scene: THREE.Scene): void {
    const c = TWO_FLOOR;
    const w = c.width / 2;
    const d = c.depth / 2;
    const H = c.height;
    const FH = c.floorHeight;
    const t = 0.3; // 壁厚

    scene.background = new THREE.Color(0x20242e);
    scene.add(new THREE.HemisphereLight(0xfff0d8, 0x2a2630, 0.8));
    const lamp1 = new THREE.PointLight(0xffe6b8, 1.0, 0, 0);
    lamp1.position.set(0, FH - 0.4, -2);
    const lamp2 = new THREE.PointLight(0xffe6b8, 1.0, 0, 0);
    lamp2.position.set(0, H - 0.5, 3);
    scene.add(lamp1, lamp2);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0xd8cbb0, side: THREE.DoubleSide });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x6b5a45 });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6240 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x5a3f28 });
    const box = (
      sx: number, sy: number, sz: number,
      x: number, y: number, z: number,
      mat: THREE.Material,
    ): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      scene.add(m);
    };

    // 1階の床・天井・四方の壁
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.depth), floorMat);
    floor.rotateX(-Math.PI / 2);
    scene.add(floor);
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(c.width, c.depth),
      new THREE.MeshLambertMaterial({ color: 0x342f3c, side: THREE.DoubleSide }),
    );
    ceil.rotateX(Math.PI / 2);
    ceil.position.y = H;
    scene.add(ceil);
    box(c.width, H, t, 0, H / 2, -d, wallMat); // 玄関壁
    box(c.width, H, t, 0, H / 2, d, wallMat); // 奥壁
    box(t, H, c.depth, -w, H / 2, 0, wallMat); // 左壁
    box(t, H, c.depth, w, H / 2, 0, wallMat); // 右壁

    // ロフト(2階)の床スラブ: z ∈ [loftFrontZ, d]、上面が FH
    const loftDepth = d - c.loftFrontZ;
    box(c.width, 0.2, loftDepth, 0, FH - 0.1, (c.loftFrontZ + d) / 2, floorMat);

    // 階段: 右レーン(x ∈ [stairXMin, w])を z 方向に 0→FH へ昇る段
    const steps = 12;
    const run = c.stairZTop - c.stairZBottom;
    const stepDepth = run / steps;
    const stairCx = (c.stairXMin + w) / 2;
    const stairW = w - c.stairXMin;
    for (let i = 0; i < steps; i++) {
      const topY = ((i + 1) / steps) * FH;
      box(
        stairW, topY, stepDepth,
        stairCx, topY / 2, c.stairZBottom + (i + 0.5) * stepDepth,
        woodMat,
      );
    }

    // 手すり: 階段の開放側(x=stairXMin)のみ。各 z で階段面の高さに合わせた支柱。
    // ロフト前縁には手すりを置かない(1階からロフト下へ入れるようにする=開放型メザニン)。
    for (let z = c.stairZBottom; z <= c.loftFrontZ - 1e-6; z += 0.8) {
      const sh = ((z - c.stairZBottom) / run) * FH; // その位置の階段面の高さ
      box(0.08, 0.9, 0.08, c.stairXMin, sh + 0.45, z, trimMat);
    }

    // 1階の家具: テーブル(玄関側)
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.07, 18), woodMat);
    tableTop.position.set(-3.5, 0.74, -3.5);
    const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 8), woodMat);
    tableLeg.position.set(-3.5, 0.37, -3.5);
    scene.add(tableTop, tableLeg);

    // 2階の家具: ベッド(ロフト上)
    box(1.8, 0.4, 2.4, 3.0, FH + 0.2, 4.5, woodMat); // マットレス台
    box(1.8, 0.5, 0.2, 3.0, FH + 0.55, 5.6, trimMat); // ヘッドボード
    box(1.6, 0.16, 2.0, 3.0, FH + 0.46, 4.4, new THREE.MeshLambertMaterial({ color: 0xcfd8e6 })); // 布団
  }

  /**
   * 室内ワールド型の家の外観小屋。ドア(+Z 面の中央)はポータル面が嵌まるよう全高で開口する。
   * 物理的な内部は持たず、ドアのポータルを横切ると室内ワールドへ飛ぶ。
   */
  private buildPortalHouse(
    scene: THREE.Scene,
    spec: PortalHouseSpec,
    terrain: HeightField,
  ): void {
    const group = new THREE.Group();
    group.position.set(spec.x, terrain.heightAt(spec.x, spec.z), spec.z);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8d8b0 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xb08968 });
    const w = PORTAL_HOUSE.width / 2;
    const d = PORTAL_HOUSE.depth / 2;
    const h = PORTAL_HOUSE.wallHeight;
    const dw = PORTAL_HOUSE.doorWidth / 2;
    const t = 0.18;
    const box = (
      sx: number, sy: number, sz: number,
      x: number, y: number, z: number,
      mat: THREE.Material = wallMat,
    ): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      group.add(m);
    };

    // 床・背面壁・側面壁
    box(PORTAL_HOUSE.width, 0.12, PORTAL_HOUSE.depth, 0, 0.06, 0, floorMat);
    box(PORTAL_HOUSE.width, h, t, 0, h / 2, -d);
    box(t, h, PORTAL_HOUSE.depth, -w, h / 2, 0);
    box(t, h, PORTAL_HOUSE.depth, w, h / 2, 0);

    // 前面壁(中央は全高のドア開口=ポータル)。左右の壁柱のみ
    box(w - dw, h, t, -(dw + (w - dw) / 2), h / 2, d);
    box(w - dw, h, t, dw + (w - dw) / 2, h / 2, d);
    // ドア枠
    box(0.12, h, t + 0.06, -dw, h / 2, d, trimMat);
    box(0.12, h, t + 0.06, dw, h / 2, d, trimMat);
    box(PORTAL_HOUSE.doorWidth + 0.24, 0.12, t + 0.06, 0, h, d, trimMat);

    // 屋根(四角錐)
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.hypot(w, d) + 0.5, 1.8, 4),
      new THREE.MeshLambertMaterial({ color: 0x6a8caf }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + 0.9;
    group.add(roof);

    scene.add(group);
  }

  /**
   * よじ登れる崖(メサ)。高さ場(CliffField)に合わせた四角錐フラスタムの岩塊を描く。
   * 頂上は CLIFF.halfWidth の正方形、底面は +slopeRun だけ広い(急斜面)。
   */
  private buildCliff(scene: THREE.Scene, cliff: { x: number; z: number }): void {
    const SQRT2 = Math.SQRT2;
    const topR = CLIFF.halfWidth * SQRT2; // 4角柱の頂点までの半径(正方形の対角)
    const botR = (CLIFF.halfWidth + CLIFF.slopeRun) * SQRT2;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(topR, botR, CLIFF.height, 4, 1),
      new THREE.MeshLambertMaterial({ color: 0x8d7f6a, flatShading: true }),
    );
    mesh.rotation.y = Math.PI / 4; // 面を XZ 軸に揃える
    mesh.position.set(cliff.x, CLIFF.height / 2, cliff.z);
    scene.add(mesh);
  }

  private addGround(
    scene: THREE.Scene,
    pattern: GroundPattern,
    terrain: HeightField,
  ): void {
    const texture = createGroundTexture(pattern);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());

    // 地形の高さ場に沿って頂点を変位させた起伏のある地面
    const geometry = new THREE.PlaneGeometry(80, 80, 64, 64);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, terrain.heightAt(positions.getX(i), positions.getZ(i)));
    }
    geometry.computeVertexNormals();

    const ground = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ map: texture }),
    );
    scene.add(ground);
  }

  private buildStars(): THREE.Points {
    // 星空(座標は決め打ちの擬似乱数で生成)
    const starPositions: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = i * 2.39996; // 黄金角でばらけさせる
      const r = 60 + (i % 37);
      const y = 12 + ((i * 7919) % 70);
      starPositions.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    return new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.4 }),
    );
  }

  private buildObjects(
    scene: THREE.Scene,
    specs: WorldObjectSpec[],
    terrain: HeightField,
  ): void {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x9b9b8f });
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0xbfe3ff,
      emissive: 0x88c9ff,
      emissiveIntensity: 0.25,
      roughness: 0.2,
    });
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xd8c49a });

    for (const spec of specs) {
      const groundY = terrain.heightAt(spec.x, spec.z);
      switch (spec.kind) {
        case 'tree': {
          const tree = new THREE.Group();
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.35, 2.2, 8),
            trunkMat,
          );
          trunk.position.y = 1.1;
          const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 10), leafMat);
          leaves.position.y = 3.6;
          tree.add(trunk, leaves);
          tree.position.set(spec.x, groundY, spec.z);
          scene.add(tree);
          break;
        }
        case 'rock': {
          const s = spec.size ?? 0.6;
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s), rockMat);
          rock.position.set(spec.x, groundY + s * 0.6, spec.z);
          scene.add(rock);
          break;
        }
        case 'crystal': {
          const h = spec.size ?? 1.6;
          const color = spec.color ?? 0x66ffee;
          const crystal = new THREE.Mesh(
            new THREE.ConeGeometry(0.5, h, 6),
            new THREE.MeshStandardMaterial({
              color,
              emissive: color,
              emissiveIntensity: 0.8,
              roughness: 0.3,
            }),
          );
          crystal.position.set(spec.x, groundY + h / 2, spec.z);
          scene.add(crystal);
          break;
        }
        case 'ice': {
          const h = spec.size ?? 2.2;
          const ice = new THREE.Mesh(new THREE.ConeGeometry(0.55, h, 7), iceMat);
          ice.position.set(spec.x, groundY + h / 2, spec.z);
          scene.add(ice);
          break;
        }
        case 'pillar': {
          const h = spec.size ?? 3;
          const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.62, h, 10),
            pillarMat,
          );
          pillar.position.set(spec.x, groundY + h / 2, spec.z);
          scene.add(pillar);
          break;
        }
      }
    }
  }

  /** 家(床・壁・窓・屋根)と家具(テレビ・テーブル)を構築する。ドアは +Z 向きの開口 */
  private buildHouse(
    scene: THREE.Scene,
    house: HouseSpec,
    terrain: HeightField,
  ): void {
    const group = new THREE.Group();
    group.position.set(house.x, terrain.heightAt(house.x, house.z), house.z);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0xefe3c8 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xb08968 });
    const w = HOUSE.width / 2;
    const d = HOUSE.depth / 2;
    const h = HOUSE.wallHeight;
    const t = 0.15; // 壁の厚さ
    const box = (
      sx: number, sy: number, sz: number,
      x: number, y: number, z: number,
      mat: THREE.Material = wallMat,
    ): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      group.add(m);
    };

    // 床と背面壁
    box(HOUSE.width, 0.12, HOUSE.depth, 0, 0.06, 0, floorMat);
    box(HOUSE.width, h, t, 0, h / 2, -d);

    // 側面壁(中央に窓開口: 幅1.2 × 高さ1.0、腰高1.0)
    for (const sx of [-w, w]) {
      box(t, 1.0, HOUSE.depth, sx, 0.5, 0); // 腰壁
      box(t, h - 2.0, HOUSE.depth, sx, (2.0 + h) / 2, 0); // 窓上
      box(t, 1.0, d - 0.6, sx, 1.5, (0.6 + d) / 2); // 窓の前後
      box(t, 1.0, d - 0.6, sx, 1.5, -(0.6 + d) / 2);
      // 窓ガラス(半透明)と木枠
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.0),
        new THREE.MeshBasicMaterial({
          color: 0xbfe8ff,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
        }),
      );
      glass.rotation.y = Math.PI / 2;
      glass.position.set(sx, 1.5, 0);
      group.add(glass);
      box(t + 0.06, 0.08, 1.32, sx, 1.0, 0, trimMat);
      box(t + 0.06, 0.08, 1.32, sx, 2.0, 0, trimMat);
      box(t + 0.06, 1.04, 0.08, sx, 1.5, -0.62, trimMat);
      box(t + 0.06, 1.04, 0.08, sx, 1.5, 0.62, trimMat);
      box(t + 0.06, 0.08, 0.08, sx, 1.5, 0, trimMat); // 中桟
    }

    // 前面壁(中央にドア開口: 幅1.4 × 高さ2.2)+ドア枠
    const dw = HOUSE.doorWidth / 2;
    box(w - dw, h, t, -(dw + (w - dw) / 2), h / 2, d);
    box(w - dw, h, t, dw + (w - dw) / 2, h / 2, d);
    box(HOUSE.doorWidth, h - 2.2, t, 0, (2.2 + h) / 2, d); // まぐさ
    box(0.1, 2.2, t + 0.06, -dw, 1.1, d, trimMat);
    box(0.1, 2.2, t + 0.06, dw, 1.1, d, trimMat);
    box(HOUSE.doorWidth + 0.2, 0.1, t + 0.06, 0, 2.25, d, trimMat);

    // 屋根(四角錐)
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.hypot(w, d) + 0.5, 1.7, 4),
      new THREE.MeshLambertMaterial({ color: 0x9b4a3c }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + 0.85;
    group.add(roof);

    // テーブル(円卓)
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6240 });
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.07, 20), woodMat);
    tableTop.position.set(HOUSE.table.x, 0.74, HOUSE.table.z);
    const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 10), woodMat);
    tableLeg.position.set(HOUSE.table.x, 0.36, HOUSE.table.z);
    const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.06, 14), woodMat);
    tableBase.position.set(HOUSE.table.x, 0.03 + 0.12, HOUSE.table.z);
    group.add(tableTop, tableLeg, tableBase);

    // テレビ(部屋側 +Z を向く。画面はカラーバーが光る)
    const tvDark = new THREE.MeshLambertMaterial({ color: 0x2b2b32 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.4), woodMat);
    stand.position.set(HOUSE.tv.x, 0.345, HOUSE.tv.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.1), tvDark);
    body.position.set(HOUSE.tv.x, 0.95, HOUSE.tv.z);
    const screenTexture = createTvScreenTexture();
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.08, 0.58),
      new THREE.MeshBasicMaterial({ map: screenTexture }),
    );
    screen.position.set(HOUSE.tv.x, 0.95, HOUSE.tv.z + 0.06);
    group.add(stand, body, screen);

    scene.add(group);
  }

  /** ポータルの門枠と「向こう側」を映す面を配置し、面メッシュを返す */
  private buildPortalMeshes(
    scene: THREE.Scene,
    portal: Portal,
    frameColor: number,
    material: THREE.ShaderMaterial,
  ): THREE.Mesh {
    const group = new THREE.Group();
    group.position.set(portal.position.x, 0, portal.position.z);
    group.rotation.y = portal.yaw;

    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      emissive: frameColor,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    const w = portal.halfWidth * 2;
    const h = portal.height;
    const t = 0.22; // 枠の太さ
    const left = new THREE.Mesh(new THREE.BoxGeometry(t, h + t, t), frameMat);
    left.position.set(-portal.halfWidth - t / 2, (h + t) / 2, 0);
    const right = left.clone();
    right.position.x = portal.halfWidth + t / 2;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, t), frameMat);
    lintel.position.set(0, h + t / 2, 0);
    group.add(left, right, lintel);

    const surface = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    surface.position.y = h / 2;
    group.add(surface);

    scene.add(group);
    return surface;
  }

  /** 扉(閉じた観音開き+枠+取っ手)を描く。透過しない=向こう側は見えない */
  private buildDoorMesh(
    scene: THREE.Scene,
    portal: Portal,
    frameColor: number,
  ): void {
    const group = new THREE.Group();
    group.position.set(portal.position.x, 0, portal.position.z);
    group.rotation.y = portal.yaw;

    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      emissive: frameColor,
      emissiveIntensity: 0.4,
      roughness: 0.5,
    });
    const w = portal.halfWidth * 2;
    const h = portal.height;
    const t = 0.22; // 枠の太さ
    const left = new THREE.Mesh(new THREE.BoxGeometry(t, h + t, t), frameMat);
    left.position.set(-portal.halfWidth - t / 2, (h + t) / 2, 0);
    const right = left.clone();
    right.position.x = portal.halfWidth + t / 2;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, t), frameMat);
    lintel.position.set(0, h + t / 2, 0);
    group.add(left, right, lintel);

    // 閉じた観音開きの扉板2枚(中央でわずかに合わさる)
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const panelW = portal.halfWidth - 0.06;
    const panel = (x: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(panelW, h - 0.1, 0.1), doorMat);
      m.position.set(x, (h - 0.1) / 2, 0);
      return m;
    };
    group.add(panel(-portal.halfWidth / 2), panel(portal.halfWidth / 2));

    // 取っ手(中央で向き合う金色の球)
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0xeacb6a,
      emissive: 0x6a5520,
      emissiveIntensity: 0.3,
      roughness: 0.3,
    });
    const knob = (x: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), knobMat);
      m.position.set(x, h * 0.45, 0.08);
      return m;
    };
    group.add(knob(-0.18), knob(0.18));

    scene.add(group);
  }
}

/** 案内人NPCの人型メッシュ(胴体+頭+帽子+足) */
function buildNpcMesh(clothColor: number): THREE.Group {
  const group = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: clothColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xf2c89b });

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), cloth);
  legs.position.y = 0.25;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.75, 10), cloth);
  body.position.y = 0.88;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), skin);
  head.position.y = 1.46;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.34, 10), cloth);
  hat.position.y = 1.74;
  // つば(進行方向 -Z 側へ少し出す)
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.18), cloth);
  brim.position.set(0, 1.58, -0.2);

  group.add(legs, body, head, hat, brim);
  return group;
}

/** テレビ画面のカラーバー(Canvas生成) */
function createTvScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const colors = ['#ffffff', '#ffd24d', '#4dffd2', '#4dff5e', '#ff4dd2', '#ff4d4d', '#4d6bff'];
    const barWidth = canvas.width / colors.length;
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(i * barWidth, 0, barWidth + 1, canvas.height * 0.8);
    });
    ctx.fillStyle = '#222';
    ctx.fillRect(0, canvas.height * 0.8, canvas.width, canvas.height * 0.2);
  }
  return new THREE.CanvasTexture(canvas);
}

// --- 地面のプロシージャル模様(外部アセット不要・シード付きで決定的) ---

type GroundPattern = 'grass' | 'dirt' | 'snow' | 'stone';

/** 線形合同法の擬似乱数(リロードしても同じ模様になる) */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function createGroundTexture(pattern: GroundPattern): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const rand = seededRandom(0xc0ffee);

  switch (pattern) {
    case 'grass': {
      ctx.fillStyle = '#5cab5c';
      ctx.fillRect(0, 0, size, size);
      // まだら(明暗のパッチ)
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(60,120,60,0.18)' : 'rgba(140,200,120,0.14)';
        const r = 12 + rand() * 26;
        ctx.beginPath();
        ctx.ellipse(rand() * size, rand() * size, r, r * (0.5 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // 草むらの短いタッチ
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 260; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const len = 3 + rand() * 5;
        const lean = (rand() - 0.5) * 3;
        ctx.strokeStyle = rand() < 0.5 ? 'rgba(40,100,45,0.55)' : 'rgba(120,190,100,0.5)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean, y - len);
        ctx.stroke();
      }
      break;
    }
    case 'dirt': {
      ctx.fillStyle = '#3c2f5c';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(35,25,70,0.35)' : 'rgba(90,70,140,0.18)';
        const r = 14 + rand() * 30;
        ctx.beginPath();
        ctx.ellipse(rand() * size, rand() * size, r, r * (0.4 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // かすかに光る粒
      for (let i = 0; i < 90; i++) {
        const a = 0.25 + rand() * 0.45;
        ctx.fillStyle = rand() < 0.3 ? `rgba(170,150,255,${a})` : `rgba(110,95,180,${a})`;
        const r = 0.6 + rand() * 1.4;
        ctx.beginPath();
        ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'snow': {
      ctx.fillStyle = '#f4f8fc';
      ctx.fillRect(0, 0, size, size);
      // 風紋(なだらかな波線)
      ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const baseY = (i + rand() * 0.6) * (size / 9);
        ctx.strokeStyle = 'rgba(200,220,238,0.7)';
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= size; x += 16) {
          ctx.lineTo(x, baseY + Math.sin((x / size) * Math.PI * 2 + i) * 5 + (rand() - 0.5) * 2);
        }
        ctx.stroke();
      }
      // きらめき
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = rand() < 0.4 ? 'rgba(255,255,255,0.9)' : 'rgba(190,215,245,0.6)';
        const r = 0.6 + rand() * 1.2;
        ctx.beginPath();
        ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stone': {
      ctx.fillStyle = '#c9a36a';
      ctx.fillRect(0, 0, size, size);
      // 石畳(4×4タイルの目地。端の線はタイル境界でリピートが繋がる)
      const tile = size / 4;
      ctx.strokeStyle = 'rgba(140,105,60,0.85)';
      ctx.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        const o = i * tile;
        ctx.beginPath();
        ctx.moveTo(o, 0);
        ctx.lineTo(o, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, o);
        ctx.lineTo(size, o);
        ctx.stroke();
      }
      // タイルごとの色むら
      for (let ty = 0; ty < 4; ty++) {
        for (let tx = 0; tx < 4; tx++) {
          ctx.fillStyle = `rgba(${150 + rand() * 60},${115 + rand() * 45},${60 + rand() * 35},0.25)`;
          ctx.fillRect(tx * tile + 2, ty * tile + 2, tile - 4, tile - 4);
        }
      }
      // ひび
      ctx.strokeStyle = 'rgba(120,90,50,0.6)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        let x = rand() * size;
        let y = rand() * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let step = 0; step < 5; step++) {
          x += (rand() - 0.5) * 30;
          y += (rand() - 0.5) * 30;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
  }

  return new THREE.CanvasTexture(canvas);
}
