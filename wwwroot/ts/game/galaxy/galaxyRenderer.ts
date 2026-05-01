/**
 * galaxyRenderer.ts — Управление WebGLRenderer, сценой, камерой и EffectComposer
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { getProfile } from '../qualityPresets.js';

export interface GalaxyRendererState {
    renderer: THREE.WebGLRenderer;
    composer: EffectComposer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    resizeObs: ResizeObserver;
}

export function initRenderer(wrap: HTMLElement): GalaxyRendererState {
    const w = wrap.clientWidth || 600;
    const h = wrap.clientHeight || 400;
    const profile = getProfile();

    const renderer = new THREE.WebGLRenderer({ antialias: profile.antialias, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(profile.pixelRatio);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x050a1a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;border-radius:var(--radius-sm);';
    wrap.insertBefore(renderer.domElement, wrap.firstChild);

    const scene = new THREE.Scene();
    window.__threeScene = scene;

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000);
    camera.position.set(0, 30, 120);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x334155, 0.5));
    const dirL = new THREE.DirectionalLight(0xffffff, 0.6);
    dirL.position.set(20, 40, 30);
    scene.add(dirL);

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.5, 0.4, 0.92);
    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    const resizeObs = new ResizeObserver(() => {
        const nw = wrap.clientWidth;
        const nh = wrap.clientHeight;
        if (nw > 0 && nh > 0) {
            camera.aspect = nw / nh;
            camera.updateProjectionMatrix();
            renderer.setSize(nw, nh, false);
            composer.setSize(nw, nh);
        }
    });
    resizeObs.observe(wrap);

    return { renderer, composer, scene, camera, resizeObs };
}

export function disposeRenderer(state: GalaxyRendererState): void {
    state.resizeObs.disconnect();
    
    // Dispose post-processing passes
    state.composer.passes.forEach(pass => {
        if ((pass as any).dispose) (pass as any).dispose();
    });
    
    state.renderer.dispose();
    const canvas = state.renderer.domElement;
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
}
