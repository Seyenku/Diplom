/**
 * postProcessing.ts — Обёртка над EffectComposer для post-processing
 *
 * Предоставляет фабрику для создания EffectComposer с bloom + vignette,
 * и утилиту для безопасной очистки.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ── Vignette Shader ─────────────────────────────

export const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        darkness: { value: 0.6 },
        offset:   { value: 1.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float darkness;
        uniform float offset;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            vec2 center = vUv - vec2(0.5);
            float dist = length(center);
            float vig = smoothstep(offset, offset - 0.45, dist * (darkness + offset));
            color.rgb *= vig;
            gl_FragColor = color;
        }
    `,
};

// ── Bloom config ────────────────────────────────

export interface BloomConfig {
    strength: number;   // default 0.35
    radius: number;     // default 0.2
    threshold: number;  // default 0.85
}

const DEFAULT_BLOOM: BloomConfig = { strength: 0.35, radius: 0.2, threshold: 0.85 };

// ── Factory ─────────────────────────────────────

/**
 * Создаёт EffectComposer с RenderPass + Bloom + (опционально) Vignette + OutputPass.
 *
 * Bloom resolution автоматически снижается до 1/4 от canvas для производительности.
 */
export function createComposer(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: {
        bloom?: BloomConfig | boolean;
        vignette?: boolean;
    } = {},
): EffectComposer {
    const canvas = renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Bloom pass
    const bloomCfg = options.bloom === true ? DEFAULT_BLOOM
        : options.bloom === false || options.bloom === undefined ? null
        : options.bloom;

    if (bloomCfg) {
        composer.addPass(new UnrealBloomPass(
            new THREE.Vector2(Math.ceil(w / 4), Math.ceil(h / 4)),
            bloomCfg.strength,
            bloomCfg.radius,
            bloomCfg.threshold,
        ));
    }

    // Vignette pass
    if (options.vignette) {
        composer.addPass(new ShaderPass(VignetteShader));
    }

    // Output pass (sRGB correction)
    composer.addPass(new OutputPass());

    return composer;
}

// ── Dispose ─────────────────────────────────────

/** Безопасно освобождает EffectComposer и все его пассы */
export function disposeComposer(composer: EffectComposer | null): void {
    if (!composer) return;
    composer.passes.forEach(p => {
        if ((p as any).dispose) (p as any).dispose();
    });
}
