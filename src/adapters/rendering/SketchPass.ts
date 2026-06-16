import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 手書き風(スケッチ/水彩)ポストエフェクト:
// Sobel エッジでインクの輪郭、紙の色み+粒状ノイズ、約8fpsの手書きゆれ(boil)、軽い色の平坦化。
const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 resolution;
  uniform float time;
  varying vec2 vUv;

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 texel = 1.0 / resolution;

    // 手書きの微小ゆれ。時間を ~8fps に量子化して「線が揺れる」アニメ風に
    float ft = floor(time * 8.0);
    vec2 wob = vec2(
      sin(vUv.y * 60.0 + ft * 1.7),
      cos(vUv.x * 60.0 + ft * 1.3)
    ) * texel * 1.6;
    vec2 uv = vUv + wob;

    vec3 col = texture2D(tDiffuse, uv).rgb;

    // Sobel エッジ(輝度)
    float tl = luma(texture2D(tDiffuse, uv + texel * vec2(-1.0, -1.0)).rgb);
    float tt = luma(texture2D(tDiffuse, uv + texel * vec2( 0.0, -1.0)).rgb);
    float tr = luma(texture2D(tDiffuse, uv + texel * vec2( 1.0, -1.0)).rgb);
    float ll = luma(texture2D(tDiffuse, uv + texel * vec2(-1.0,  0.0)).rgb);
    float rr = luma(texture2D(tDiffuse, uv + texel * vec2( 1.0,  0.0)).rgb);
    float bl = luma(texture2D(tDiffuse, uv + texel * vec2(-1.0,  1.0)).rgb);
    float bb = luma(texture2D(tDiffuse, uv + texel * vec2( 0.0,  1.0)).rgb);
    float br = luma(texture2D(tDiffuse, uv + texel * vec2( 1.0,  1.0)).rgb);
    float gx = -tl - 2.0 * ll - bl + tr + 2.0 * rr + br;
    float gy = -tl - 2.0 * tt - tr + bl + 2.0 * bb + br;
    float edge = sqrt(gx * gx + gy * gy);
    float ink = smoothstep(0.5, 1.3, edge);

    // 軽い色の平坦化(水彩のにじみ風)
    vec3 flat = floor(col * 5.0 + 0.5) / 5.0;
    vec3 washed = mix(col, flat, 0.5);

    // 紙の色みと粒状感
    vec3 paper = vec3(0.97, 0.95, 0.89);
    float grain = (hash(floor(vUv * resolution / 2.0)) - 0.5) * 0.05;
    vec3 base = washed * paper + grain;

    // インクの輪郭で陰影付け
    vec3 inkColor = vec3(0.12, 0.10, 0.14);
    vec3 outColor = mix(base, inkColor, ink);

    gl_FragColor = vec4(clamp(outColor, 0.0, 1.0), 1.0);
  }
`;

/**
 * 手書き風スケッチのフルスクリーン・ポストパス(描画専用・SRP)。
 * 専用のシーン+全画面クアッド+ShaderMaterial を内包し、入力テクスチャを受け取って画面へ描く。
 * three.js 依存をここに閉じ込め、レンダラ側は「sceneRT に描く → これに渡す」だけでよい。
 * 利用をやめれば従来描画(sceneRT を直接出す)に戻せる=安全に忘れられる。
 */
export class SketchPass {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;

  constructor(width: number, height: number) {
    // クアッドは z=0、カメラは z=1 から -Z を見る(前面を確実に向く・近接面クリップを避ける)
    this.camera.position.z = 1;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        time: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false; // 全画面なので視錐台カリングで消えないように
    this.scene.add(this.quad);
  }

  setSize(width: number, height: number): void {
    (this.material.uniforms.resolution.value as THREE.Vector2).set(width, height);
  }

  /** 入力テクスチャを手書き風に変換してキャンバス(既定フレームバッファ)へ描く */
  render(renderer: THREE.WebGLRenderer, input: THREE.Texture, time: number): void {
    this.material.uniforms.tDiffuse.value = input;
    this.material.uniforms.time.value = time;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
