/**
 * geoSplitCutscene3d.ts — Мини-сцена раскола астероида (~3 сек)
 *
 * Таймлайн:
 *   0–1 сек   — луч бурения растёт снизу к астероиду
 *   1–1.5 сек — контакт: вспышка, астероид начинает светиться
 *   1.5–3 сек — две половины расходятся, частицы, планета в фоне
 */

import * as THREE from 'three';
import { spawnParticleBurst } from '../systems/particleEffects.js';
import { disposeSceneGraph } from '../threeUtils.js';
import { playSfx } from '../audioManager.js';

const DURATION = 3.2;

export interface GeoSplitCutsceneApi {
    play(): Promise<void>;
    dispose(): void;
}

export function createGeoSplitCutscene(canvas: HTMLCanvasElement): GeoSplitCutsceneApi {

    let _renderer:  THREE.WebGLRenderer | null = null;
    let _scene:     THREE.Scene | null = null;
    let _camera:    THREE.PerspectiveCamera | null = null;
    let _animId:    number | null = null;
    let _startTime  = 0;

    let _asteroid:  THREE.Mesh | null = null;
    let _halfL:     THREE.Mesh | null = null;
    let _halfR:     THREE.Mesh | null = null;
    let _beam:      THREE.Mesh | null = null;
    let _beamGlow:  THREE.PointLight | null = null;

    let _impacted = false;
    let _resolve: (() => void) | null = null;

    async function _init(): Promise<void> {
        const parent = canvas.parentElement ?? document.body;
        const w = parent.clientWidth  || 800;
        const h = parent.clientHeight || 450;

        _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _renderer.setClearColor(0x020710, 1);
        _renderer.setSize(w, h, false);

        _scene = new THREE.Scene();
        _camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
        _camera.position.set(0, 2.5, 11);
        _camera.lookAt(0, 0, 0);

        // Освещение
        _scene.add(new THREE.AmbientLight(0x1a2a14, 0.6));
        const key = new THREE.DirectionalLight(0xe0d8c0, 1.4);
        key.position.set(4, 6, 5);
        _scene.add(key);

        // Зелёный свет от лазера — нарастает при ударе
        _beamGlow = new THREE.PointLight(0x7aff50, 0, 15);
        _beamGlow.position.set(0, -1, 0);
        _scene.add(_beamGlow);

        // Планета на фоне (слегка сбоку)
        _scene.add(_makePlanet());

        // Звёздный фон
        _scene.add(_makeStars());

        // Астероид (цельный, виден сначала)
        const astMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.95, metalness: 0.05 });
        _asteroid = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 2), astMat);
        _asteroid.rotation.set(0.4, 0.2, 0.1);
        _scene!.add(_asteroid);

        // Две половины (скрыты до момента раскола)
        const matL = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.92 });
        const matR = new THREE.MeshStandardMaterial({ color: 0x5e4f36, roughness: 0.95 });

        _halfL = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 2), matL);
        _halfL.scale.set(1.05, 0.95, 1.0);
        _halfL.rotation.set(0.4, 0.2, 0.1);
        _halfL.visible = false;
        _scene!.add(_halfL);

        _halfR = new THREE.Mesh(new THREE.IcosahedronGeometry(1.85, 2), matR);
        _halfR.scale.set(0.95, 1.05, 1.0);
        _halfR.rotation.set(0.45, -0.1, 0.15);
        _halfR.visible = false;
        _scene!.add(_halfR);

        // Луч бурения — тонкий цилиндр снизу
        _beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 7, 8),
            new THREE.MeshBasicMaterial({
                color: 0x7aff50, transparent: true, opacity: 0,
                blending: THREE.AdditiveBlending, depthWrite: false,
            }),
        );
        _beam.position.set(0, -5.5, 0); // центр цилиндра; вырастает снизу вверх
        _scene!.add(_beam);
    }

    function _makePlanet(): THREE.Group {
        const g = new THREE.Group();
        const color = new THREE.Color(0x7a9e50);
        g.add(new THREE.Mesh(
            new THREE.SphereGeometry(8, 32, 24),
            new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.6 }),
        ));
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(8.8, 24, 16),
            new THREE.MeshBasicMaterial({ color: 0xa8c878, transparent: true, opacity: 0.14, side: THREE.BackSide }),
        );
        g.add(glow);
        g.position.set(8, -3, -25);
        return g;
    }

    function _makeStars(): THREE.Points {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(600 * 3);
        for (let i = 0; i < 600; i++) {
            pos[i*3]   = (Math.random()-0.5)*120;
            pos[i*3+1] = (Math.random()-0.5)*70;
            pos[i*3+2] = -Math.random()*80 - 5;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdbeafe, size: 0.12, transparent: true, opacity: 0.6 }));
    }

    function _loop(now: number): void {
        if (!_renderer || !_scene || !_camera) return;
        const t = (now - _startTime) / 1000;

        // Phase 1 (0–1s): луч поднимается
        if (t < 1.0) {
            const p = t / 1.0;
            if (_beam) {
                // Двигаем центр цилиндра вверх, чтобы верхний конец касался астероида
                _beam.position.y = -5.5 + p * 4.3; // -5.5 → -1.2
                (_beam.material as THREE.MeshBasicMaterial).opacity = p * 0.9;
            }
            if (_beamGlow) _beamGlow.intensity = p * 1.5;
        }

        // Phase 2 (1–1.5s): удар
        if (!_impacted && t >= 1.0) {
            _impacted = true;
            playSfx('asteroid_hit');

            // Вспышка DOM
            const flash = document.getElementById('geo-split-flash');
            if (flash) {
                flash.style.opacity = '1';
                setTimeout(() => { if (flash) flash.style.opacity = '0'; }, 90);
            }

            // Частицы раскола
            const center = new THREE.Vector3(0, 0, 0);
            spawnParticleBurst(_scene!, center, 0x8b6914, 22, 14, 1.8, 0.08);
            spawnParticleBurst(_scene!, center, 0x7a9e50, 14, 10, 1.4, 0.06);
            spawnParticleBurst(_scene!, center, 0xe8d5a0, 10, 12, 1.0, 0.04);

            // Скрываем цельный астероид, показываем половины
            if (_asteroid) _asteroid.visible = false;
            if (_halfL) _halfL.visible = true;
            if (_halfR) _halfR.visible = true;
            if (_beam) (_beam.material as THREE.MeshBasicMaterial).opacity = 1.0;
            if (_beamGlow) _beamGlow.intensity = 4.0;
        }

        // Phase 3 (1.5–3.2s): половины расходятся
        if (t >= 1.5) {
            const p = Math.min(1, (t - 1.5) / 1.7);
            const ease = 1 - Math.pow(1 - p, 2);

            if (_halfL) {
                _halfL.position.set(-ease * 4.2, ease * 1.8, -ease * 0.8);
                _halfL.rotation.y += 0.018;
                _halfL.rotation.z += 0.01;
            }
            if (_halfR) {
                _halfR.position.set(ease * 4.0, -ease * 1.4, ease * 0.6);
                _halfR.rotation.y -= 0.014;
                _halfR.rotation.x += 0.008;
            }
            // Луч и свет гаснут
            if (_beam) (_beam.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p * 1.5);
            if (_beamGlow) _beamGlow.intensity = Math.max(0, 4 - p * 4);
        }

        // Slow rotation до удара
        if (t < 1.0 && _asteroid) {
            _asteroid.rotation.y += 0.008;
        }

        // Камера медленно приближается
        if (t < 1.0) {
            _camera.position.z = 11 - t * 0.5;
        } else if (t > 1.5) {
            const p = Math.min(1, (t - 1.5) / 1.7);
            _camera.position.z = 10.5 + p * 4;
            _camera.position.y = 2.5 + p * 1.5;
        }
        _camera.lookAt(0, 0, 0);
        _camera.updateProjectionMatrix();

        _renderer.render(_scene, _camera);

        if (t < DURATION) {
            _animId = requestAnimationFrame(_loop);
        } else {
            _resolve?.();
        }
    }

    return {
        async play(): Promise<void> {
            await _init();
            return new Promise<void>((resolve) => {
                _resolve = resolve;
                _startTime = performance.now();
                _animId = requestAnimationFrame(_loop);
            });
        },
        dispose(): void {
            if (_animId !== null) { cancelAnimationFrame(_animId); _animId = null; }
            if (_scene) { disposeSceneGraph(_scene); _scene = null; }
            if (_renderer) { _renderer.forceContextLoss(); _renderer.dispose(); _renderer = null; }
            _asteroid = null; _halfL = null; _halfR = null; _beam = null; _beamGlow = null;
        },
    };
}
