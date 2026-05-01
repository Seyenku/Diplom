/**
 * flightVfx.ts — Визуальные эффекты экрана полёта
 *
 * Управляет speed lines, engine trail, shield sphere, parallax dust,
 * hit flash, camera shake и damage overlay.
 */

import * as THREE from 'three';
import { QualityProfile } from '../qualityPresets.js';
import { renderer as globalRenderer } from '../threeScene.js';

export interface DustLayer {
    points: THREE.Points;
    speedMult: number;
}

export interface FlightVfxState {
    speedLinesMesh: THREE.LineSegments | null;
    speedLinesGeo: THREE.BufferGeometry | null;
    engineTrailPoints: THREE.Points | null;
    engineTrailPositions: Float32Array | null;
    engineTrailAlphas: Float32Array | null;
    shieldMesh: THREE.Mesh | null;
    dustLayers: DustLayer[];
    targetFOV: number;
    cameraShakeIntensity: number;
}

const BASE_OBJ_SPEED = 25;
const ENGINE_TRAIL_COUNT = 60;

// Волновые множители скорости из экрана (TODO: передавать через аргументы)
const WAVE_SPEED_MULT = [1.0, 1.35, 1.8]; 

export function initVfx(
    scene: THREE.Scene, 
    shipModel: THREE.Group | null, 
    profile: QualityProfile
): FlightVfxState {
    const state: FlightVfxState = {
        speedLinesMesh: null,
        speedLinesGeo: null,
        engineTrailPoints: null,
        engineTrailPositions: null,
        engineTrailAlphas: null,
        shieldMesh: null,
        dustLayers: [],
        targetFOV: 60,
        cameraShakeIntensity: 0,
    };

    if (profile.flightSpeedLines) {
        _initSpeedLines(state, profile.flightSpeedLinesCount, scene);
    }
    if (profile.flightEngineTrail) {
        _initEngineTrail(state, scene);
    }
    if (profile.flightShieldSphere && shipModel) {
        _initShieldSphere(state, shipModel);
    }

    scene.children.forEach(child => {
        const tag = child.userData?.flightDust;
        if (tag) {
            state.dustLayers.push({
                points: child as THREE.Points,
                speedMult: tag === 'near' ? 8 : 3,
            });
        }
    });

    return state;
}

export function updateVfx(
    state: FlightVfxState,
    dt: number,
    rawDt: number,
    boosting: boolean,
    hitStunRemaining: number,
    shield: number,
    maxShield: number,
    elapsed: number,
    currentWave: number,
    shipModel: THREE.Group | null,
    profile: QualityProfile,
    isPlaying: boolean
): void {
    // Dynamic FOV
    const cam = (window as any).__threeCamera as THREE.PerspectiveCamera | undefined;
    if (profile.flightDynamicFOV && cam) {
        state.targetFOV = boosting ? 72 : (hitStunRemaining > 0 ? 52 : 60);
        const delta = (state.targetFOV - cam.fov) * Math.min(1, rawDt * 4);
        if (Math.abs(delta) > 0.01) {
            cam.fov += delta;
            cam.updateProjectionMatrix();
        }
    }

    // Camera shake decay
    if (state.cameraShakeIntensity > 0) {
        state.cameraShakeIntensity *= Math.max(0, 1 - 6 * rawDt);
        if (state.cameraShakeIntensity < 0.01) state.cameraShakeIntensity = 0;
        _applyCameraShake(state.cameraShakeIntensity);
    }

    if (state.speedLinesMesh && state.speedLinesGeo) {
        _updateSpeedLines(state, dt, boosting, currentWave);
    }
    if (state.engineTrailPoints && state.engineTrailPositions && state.engineTrailAlphas) {
        _updateEngineTrail(state, dt, boosting, shipModel);
    }
    if (state.shieldMesh && state.shieldMesh.material) {
        const mat = state.shieldMesh.material as THREE.ShaderMaterial;
        mat.uniforms.shieldPct.value = shield / maxShield;
        mat.uniforms.time.value = elapsed;
    }

    _updateParallaxDust(state, dt, boosting, currentWave);

    if (profile.flightDamageOverlay) {
        _updateDamageOverlay(shield, maxShield, isPlaying);
    }
}

export function triggerHitFeedback(
    state: FlightVfxState,
    hitPos: THREE.Vector3,
    elapsed: number
): void {
    state.cameraShakeIntensity = 0.6;
    _triggerHitFlash();
    _triggerShieldRipple(state, hitPos, elapsed);
}

export function disposeVfx(state: FlightVfxState, scene: THREE.Scene): void {
    if (globalRenderer) globalRenderer.domElement.style.transform = '';
    
    if (state.speedLinesMesh) {
        scene.remove(state.speedLinesMesh);
        state.speedLinesGeo?.dispose();
        if (state.speedLinesMesh.material) (state.speedLinesMesh.material as THREE.Material).dispose();
    }
    if (state.engineTrailPoints) {
        scene.remove(state.engineTrailPoints);
        state.engineTrailPoints.geometry?.dispose();
        if (state.engineTrailPoints.material) (state.engineTrailPoints.material as THREE.Material).dispose();
    }
    if (state.shieldMesh) {
        state.shieldMesh.geometry?.dispose();
        if (state.shieldMesh.material) (state.shieldMesh.material as THREE.Material).dispose();
    }

    const dmgEl = document.getElementById('flight-damage-overlay');
    if (dmgEl) dmgEl.classList.remove('critical');
}

// ── Internal Helpers ──────────────────────────

function _initSpeedLines(state: FlightVfxState, count: number, scene: THREE.Scene): void {
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 4 + Math.random() * 12;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const z = -(Math.random() * 200 + 20);
        positions[i * 6]     = x;
        positions[i * 6 + 1] = y;
        positions[i * 6 + 2] = z;
        positions[i * 6 + 3] = x;
        positions[i * 6 + 4] = y;
        positions[i * 6 + 5] = z - 0.5;
    }
    state.speedLinesGeo = new THREE.BufferGeometry();
    state.speedLinesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
        color: 0x8899cc, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    state.speedLinesMesh = new THREE.LineSegments(state.speedLinesGeo, mat);
    scene.add(state.speedLinesMesh);
}

function _updateSpeedLines(state: FlightVfxState, dt: number, boosting: boolean, currentWave: number): void {
    const geo = state.speedLinesGeo!;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    
    // Fallback to array bounds if wave is larger than mult list
    const mult = WAVE_SPEED_MULT[currentWave] ?? WAVE_SPEED_MULT[WAVE_SPEED_MULT.length - 1];
    const speed = (boosting ? 80 : 30) * mult * dt;
    const lineLen = boosting ? 3.0 : 0.8;

    if (state.speedLinesMesh) {
        const mat = state.speedLinesMesh.material as THREE.LineBasicMaterial;
        const targetOp = boosting ? 0.5 : 0.2;
        mat.opacity += (targetOp - mat.opacity) * 0.1;
    }

    const count = arr.length / 6;
    for (let i = 0; i < count; i++) {
        const idx = i * 6;
        arr[idx + 2] += speed;
        arr[idx + 5] += speed;
        arr[idx + 5] = arr[idx + 2] - lineLen;

        if (arr[idx + 2] > 15) {
            const angle = Math.random() * Math.PI * 2;
            const r = 4 + Math.random() * 12;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            const z = -(100 + Math.random() * 150);
            arr[idx]     = x;
            arr[idx + 1] = y;
            arr[idx + 2] = z;
            arr[idx + 3] = x;
            arr[idx + 4] = y;
            arr[idx + 5] = z - lineLen;
        }
    }
    pos.needsUpdate = true;
}

function _initEngineTrail(state: FlightVfxState, scene: THREE.Scene): void {
    state.engineTrailPositions = new Float32Array(ENGINE_TRAIL_COUNT * 3);
    state.engineTrailAlphas = new Float32Array(ENGINE_TRAIL_COUNT);
    for (let i = 0; i < ENGINE_TRAIL_COUNT; i++) {
        state.engineTrailPositions[i * 3] = 0;
        state.engineTrailPositions[i * 3 + 1] = 0;
        state.engineTrailPositions[i * 3 + 2] = 0;
        state.engineTrailAlphas[i] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(state.engineTrailPositions, 3));
    const mat = new THREE.PointsMaterial({
        color: 0x4fc3f7, size: 0.3, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    state.engineTrailPoints = new THREE.Points(geo, mat);
    scene.add(state.engineTrailPoints);
}

function _updateEngineTrail(state: FlightVfxState, dt: number, boosting: boolean, shipModel: THREE.Group | null): void {
    if (!shipModel) return;
    const pos = state.engineTrailPositions!;
    const alphas = state.engineTrailAlphas!;
    const trailSpeed = (boosting ? 15 : 8) * dt;

    for (let i = ENGINE_TRAIL_COUNT - 1; i > 0; i--) {
        pos[i * 3]     = pos[(i - 1) * 3]     + (Math.random() - 0.5) * 0.1;
        pos[i * 3 + 1] = pos[(i - 1) * 3 + 1] + (Math.random() - 0.5) * 0.1;
        pos[i * 3 + 2] = pos[(i - 1) * 3 + 2] + trailSpeed;
        alphas[i] = alphas[i - 1] * 0.94;
    }
    pos[0] = shipModel.position.x + (Math.random() - 0.5) * 0.2;
    pos[1] = shipModel.position.y - 0.15 + (Math.random() - 0.5) * 0.1;
    pos[2] = shipModel.position.z + 0.8;
    alphas[0] = boosting ? 1.0 : 0.6;

    const mat = state.engineTrailPoints!.material as THREE.PointsMaterial;
    mat.size = boosting ? 0.45 : 0.3;
    mat.color.setHex(boosting ? 0x818cf8 : 0x4fc3f7);
    (state.engineTrailPoints!.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
}

function _initShieldSphere(state: FlightVfxState, shipModel: THREE.Group): void {
    const geo = new THREE.SphereGeometry(1.6, 24, 18);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            shieldPct: { value: 1.0 },
            time:      { value: 0.0 },
            hitTime:   { value: -10.0 },
            hitPoint:  { value: new THREE.Vector3(0, 0, 1) },
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float shieldPct;
            uniform float time;
            uniform float hitTime;
            uniform vec3 hitPoint;
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            void main() {
                float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.5);
                vec3 color = mix(vec3(1.0, 0.3, 0.3), vec3(0.3, 0.7, 1.0), shieldPct);
                float hitAge = time - hitTime;
                if (hitAge < 1.0 && hitAge > 0.0) {
                    float dist = distance(normalize(vWorldPos), normalize(hitPoint));
                    float ripple = sin(dist * 30.0 - hitAge * 15.0) * exp(-hitAge * 4.0);
                    fresnel += max(0.0, ripple) * 0.6;
                }
                float alpha = fresnel * 0.12 * shieldPct;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending,
    });
    state.shieldMesh = new THREE.Mesh(geo, mat);
    shipModel.add(state.shieldMesh);
}

function _triggerShieldRipple(state: FlightVfxState, hitPos: THREE.Vector3, elapsed: number): void {
    if (!state.shieldMesh || !state.shieldMesh.material) return;
    const mat = state.shieldMesh.material as THREE.ShaderMaterial;
    mat.uniforms.hitTime.value = elapsed;
    mat.uniforms.hitPoint.value.copy(hitPos);
}

function _updateParallaxDust(state: FlightVfxState, dt: number, boosting: boolean, currentWave: number): void {
    const boostMult = boosting ? 1.5 : 1.0;
    const waveMult = WAVE_SPEED_MULT[currentWave] ?? WAVE_SPEED_MULT[WAVE_SPEED_MULT.length - 1];
    
    for (let l = 0; l < state.dustLayers.length; l++) {
        const layer = state.dustLayers[l];
        const speed = BASE_OBJ_SPEED * layer.speedMult * waveMult * dt * boostMult;
        const pos = layer.points.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const count = arr.length / 3;
        for (let i = 0; i < count; i++) {
            arr[i * 3 + 2] += speed;
            if (arr[i * 3 + 2] > 15) {
                arr[i * 3]     = (Math.random() - 0.5) * 40;
                arr[i * 3 + 1] = (Math.random() - 0.5) * 25;
                arr[i * 3 + 2] = -(200 + Math.random() * 400);
            }
        }
        pos.needsUpdate = true;
    }
}

function _updateDamageOverlay(shield: number, maxShield: number, isPlaying: boolean): void {
    const el = document.getElementById('flight-damage-overlay');
    if (!el) return;
    const pct = shield / maxShield;
    if (pct < 0.3 && isPlaying) {
        el.classList.add('critical');
    } else {
        el.classList.remove('critical');
    }
}

function _triggerHitFlash(): void {
    const el = document.getElementById('flight-hit-flash');
    if (!el) return;
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 400);
}

function _applyCameraShake(intensity: number): void {
    if (!globalRenderer) return;
    const canvas = globalRenderer.domElement;
    canvas.style.transform = intensity > 0.01
        ? `translate(${(Math.random() - 0.5) * intensity * 12}px, ${(Math.random() - 0.5) * intensity * 12}px)`
        : '';
}
