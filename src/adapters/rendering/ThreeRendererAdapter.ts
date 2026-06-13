import * as THREE from 'three';
import { GameSession } from '../../domain/entities/GameSession';
import { Player } from '../../domain/entities/Player';
import { Portal } from '../../domain/entities/Portal';
import { World } from '../../domain/entities/World';
import { HeightField } from '../../domain/values/Terrain';
import { Vec3 } from '../../domain/values/Vec3';
import { HOUSE, HouseSpec, WORLD_DEFS, WorldObjectSpec } from '../../config/worldContent';

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

    window.addEventListener('resize', this.onResize);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
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

  render(): void {
    const world = this.session.currentWorld;
    const view = this.viewOf(world.id);
    this.syncCamera(this.session.player);
    this.syncNpcs();

    // 現在ワールドの各ポータルについて、接続先ワールドをレンダーターゲットへ描画する
    world.portals.forEach((portal, index) => {
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

  private syncCamera(player: Player): void {
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
    this.buildEnvironment(scene, world.id, world.terrain);
    if (def) this.buildObjects(scene, def.objects, world.terrain);
    if (def?.house) this.buildHouse(scene, def.house, world.terrain);

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
