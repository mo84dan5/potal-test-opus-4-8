import * as THREE from 'three';

/**
 * 手書き風(スケッチ/水彩)ポストエフェクトのシェーダ定義(データのみ)。
 * three の EffectComposer / ShaderPass にそのまま渡す(全画面クアッドやRT管理は ShaderPass 側=実績ある実装に委ねる)。
 * 効果: 輝度Sobelのインク輪郭線、紙の色み+粒状ノイズ、約8fpsの手書きゆれ(boil)、軽い色の平坦化。
 * 利用をやめれば ShaderPass を外すだけで従来描画に戻る=安全に忘れられる。
 */
export const SketchShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 texel = 1.0 / resolution;

      // 手書きの微小ゆれ。時間を ~8fps に量子化し、mod でラップして sin の引数が巨大化しないようにする
      float ft = mod(floor(time * 8.0), 64.0);
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
      vec3 quant = floor(col * 5.0 + 0.5) / 5.0;
      vec3 washed = mix(col, quant, 0.5);

      // 紙の色みと粒状感
      vec3 paper = vec3(0.97, 0.95, 0.89);
      float grain = (hash(floor(vUv * resolution / 2.0)) - 0.5) * 0.05;
      vec3 base = washed * paper + grain;

      // インクの輪郭で陰影付け
      vec3 inkColor = vec3(0.12, 0.10, 0.14);
      vec3 outColor = mix(base, inkColor, ink);

      gl_FragColor = vec4(clamp(outColor, 0.0, 1.0), 1.0);
    }
  `,
};
