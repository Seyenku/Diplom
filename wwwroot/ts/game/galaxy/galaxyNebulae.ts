/**
 * galaxyNebulae.ts — Генерация и управление туманностями (облака частиц)
 */

import * as THREE from 'three';
import { ClusterType, PlanetDto } from '../types.js';
import { CLUSTER_META } from '../clusterConfig.js';
import { getProfile, getQualityLevel } from '../qualityPresets.js';

export interface GalaxyNebulaeState {
    textureCache: Map<string, THREE.CanvasTexture>;
    meshes: Record<ClusterType, THREE.Group>;
}

export function initNebulaeState(): GalaxyNebulaeState {
    return {
        textureCache: new Map(),
        meshes: {} as Record<ClusterType, THREE.Group>,
    };
}

export function disposeNebulae(state: GalaxyNebulaeState, scene: THREE.Scene): void {
    Object.values(state.meshes).forEach(group => scene.remove(group));
    state.textureCache.forEach(tex => tex.dispose());
    state.textureCache.clear();
    state.meshes = {} as Record<ClusterType, THREE.Group>;
}

export function buildNebulae(
    state: GalaxyNebulaeState,
    scene: THREE.Scene,
    clusterIds: ClusterType[],
    allPlanets: PlanetDto[]
): void {
    const profile = getProfile();
    const PARTICLE_COUNT = profile.nebulaParticles;
    const SPARKS_COUNT = profile.nebulaSparks;

    for (const clusterId of clusterIds) {
        const meta = CLUSTER_META[clusterId];
        if (!meta) continue;

        const group = new THREE.Group();
        group.position.set(meta.position.x, meta.position.y, meta.position.z);
        group.userData = { clusterId, type: 'nebula' };

        const texSize = profile.glowTextureSize;
        const glowTexture = _createGlowTexture(state.textureCache, texSize, meta.colorHex);
        const coreTexture = _createGlowTexture(state.textureCache, texSize * 2, meta.colorHex, 0.3);
        const sparksColor = _getSparksColor(clusterId);

        // 1: Cloud Points
        const cloudGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);
        const sizes = new Float32Array(PARTICLE_COUNT);
        const phases = new Float32Array(PARTICLE_COUNT);

        const baseColor = new THREE.Color(meta.color);
        const subCenters: THREE.Vector3[] = [];
        for (let j = 0; j < 4; j++) {
            subCenters.push(new THREE.Vector3(
                (Math.random() - 0.5) * 40,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 40
            ));
        }

        const clusterPlanets = allPlanets.filter(p => p.clusterId === clusterId);
        let maxOrbitR = 8;
        for (let j = 0; j < clusterPlanets.length; j++) {
            const r = 8 + (j % 4) * 4.8 + Math.floor(j / 4) * 2.2;
            if (r > maxOrbitR) maxOrbitR = r;
        }
        const innerRadius = maxOrbitR + 6;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            let px = 0, py = 0, pz = 0;
            let distSq = 0;
            let attempts = 0;
            const minDistSq = (maxOrbitR + 3) * (maxOrbitR + 3);

            do {
                const node = subCenters[Math.floor(Math.random() * subCenters.length)];
                const r = innerRadius + Math.random() * 37;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);

                px = node.x + r * Math.sin(phi) * Math.cos(theta) * 1.5;
                py = node.y + r * Math.sin(phi) * Math.sin(theta) * 0.25;
                pz = node.z + r * Math.cos(phi) * 1.2;

                distSq = px * px + py * py + pz * pz;
                attempts++;
            } while (distSq < minDistSq && attempts < 5);

            positions[i * 3]     = px;
            positions[i * 3 + 1] = py;
            positions[i * 3 + 2] = pz;

            const brightness = 0.6 + Math.random() * 0.4;
            colors[i * 3]     = baseColor.r * brightness;
            colors[i * 3 + 1] = baseColor.g * brightness;
            colors[i * 3 + 2] = baseColor.b * brightness;

            sizes[i] = 1.5 + Math.random() * 3;
            phases[i] = Math.random() * Math.PI * 2;
        }

        cloudGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        cloudGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        cloudGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        cloudGeo.userData = { phases };

        const cloudMat = new THREE.PointsMaterial({
            size: 2.5,
            map: glowTexture,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });
        const cloud = new THREE.Points(cloudGeo, cloudMat);
        cloud.userData = { type: 'nebula-cloud' };
        group.add(cloud);

        // 2: Sparks
        const sparksGeo = new THREE.BufferGeometry();
        const sparksPos = new Float32Array(SPARKS_COUNT * 3);
        for (let i = 0; i < SPARKS_COUNT; i++) {
            const node = subCenters[Math.floor(Math.random() * subCenters.length)];
            const r = innerRadius + Math.random() * 25;
            const theta = Math.random() * Math.PI * 2;
            
            sparksPos[i * 3]     = node.x + r * Math.cos(theta) * 1.5;
            sparksPos[i * 3 + 1] = node.y + (Math.random() - 0.5) * 5;
            sparksPos[i * 3 + 2] = node.z + r * Math.sin(theta) * 1.2;
        }
        sparksGeo.setAttribute('position', new THREE.BufferAttribute(sparksPos, 3));

        const sparksMat = new THREE.PointsMaterial({
            size: 2,
            map: _createGlowTexture(state.textureCache, 64, sparksColor),
            color: new THREE.Color(sparksColor),
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });
        const sparks = new THREE.Points(sparksGeo, sparksMat);
        sparks.userData = { type: 'sparks' };
        group.add(sparks);

        // 3: Core (Quality-dependent: Low = Layered Elliptical Disks, Medium/High = 3D Volumetric Oblate Sphere with Fresnel shader)
        const quality = getQualityLevel();

        if (quality === 'low') {
            // Variant 2: Concentric Elliptical horizontal disks lying flat on XZ plane
            const coreGroup = new THREE.Group();
            coreGroup.userData = { type: 'core-discs', currentScale: 1.0, currentOp: 0.4 };
            
            const planeGeo = new THREE.PlaneGeometry(1, 1);
            const ellipseWidth = 80;
            const ellipseHeight = 35;
            
            const layersConfig = [
                { scaleX: ellipseWidth,       scaleY: ellipseHeight,       opacity: 0.45, speed: 0.002 },
                { scaleX: ellipseWidth * 0.8, scaleY: ellipseHeight * 0.8, opacity: 0.30, speed: -0.003 },
                { scaleX: ellipseWidth * 0.5, scaleY: ellipseHeight * 0.5, opacity: 0.20, speed: 0.005 }
            ];

            layersConfig.forEach((cfg) => {
                const planeMat = new THREE.MeshBasicMaterial({
                    map: coreTexture,
                    color: new THREE.Color(meta.color),
                    transparent: true,
                    opacity: cfg.opacity,
                    blending: THREE.NormalBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                
                const planeMesh = new THREE.Mesh(planeGeo, planeMat);
                planeMesh.rotation.x = -Math.PI / 2;
                planeMesh.scale.set(cfg.scaleX, cfg.scaleY, 1);
                planeMesh.userData = { rotSpeed: cfg.speed, baseOpacity: cfg.opacity };
                
                coreGroup.add(planeMesh);
            });
            
            group.add(coreGroup);
        } else {
            // Variant 1: 3D oblate sphere (spheroid) using a custom THREE.ShaderMaterial
            const coreGeo = new THREE.SphereGeometry(1, 48, 48); // Smoother geometry
            const coreMat = new THREE.ShaderMaterial({
                uniforms: {
                    glowColor: { value: new THREE.Color(meta.color) },
                    opacity: { value: 0.4 },
                    power: { value: 3.0 }, // Steeper exponential decay
                    objPosition: { value: new THREE.Vector3(meta.position.x, meta.position.y, meta.position.z) },
                    objScale: { value: new THREE.Vector3(60, 20, 60) }
                },
                vertexShader: `
                    varying vec3 vWorldPosition;
                    void main() {
                        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                        vWorldPosition = worldPosition.xyz;
                        gl_Position = projectionMatrix * viewMatrix * worldPosition;
                    }
                `,
                fragmentShader: `
                    uniform vec3 glowColor;
                    uniform float opacity;
                    uniform float power;
                    uniform vec3 objPosition;
                    uniform vec3 objScale;
                    
                    varying vec3 vWorldPosition;
                    
                    void main() {
                        // Calculate local space camera and fragment positions based on scale and position
                        vec3 localCamPos = (cameraPosition - objPosition) / objScale;
                        vec3 localFragPos = (vWorldPosition - objPosition) / objScale;
                        
                        vec3 localRayDir = normalize(localFragPos - localCamPos);
                        
                        // Shortest distance from local origin (0,0,0) to the ray
                        // This perfectly finds the visual center of the scaled 3D oblate spheroid
                        float d = length(cross(-localCamPos, localRayDir));
                        
                        // d is 0 at the exact center, 1 at the edge of the unit sphere
                        float facingRatio = clamp(1.0 - d, 0.0, 1.0);
                        
                        // Exponential radial decay
                        float intensity = pow(facingRatio, power);
                        
                        // Smooth edges to 0 to prevent harsh clipping
                        float edgeFade = smoothstep(0.0, 0.15, facingRatio);
                        
                        // Singularity at the center (white color peak)
                        float singularity = pow(facingRatio, 15.0); 
                        
                        vec3 finalColor = mix(glowColor, vec3(1.0), singularity);
                        float finalAlpha = intensity * opacity * edgeFade;
                        
                        gl_FragColor = vec4(finalColor, finalAlpha);
                    }
                `,
                transparent: true,
                blending: THREE.NormalBlending, // Normal blending prevents overlapping nebulae from turning completely white
                depthWrite: false,
                side: THREE.FrontSide // FrontSide only for correct volume rendering
            });

            const coreMesh = new THREE.Mesh(coreGeo, coreMat);
            // Spheroid (oblate sphere): Massive, slightly flattened from poles. 
            // Static and centered. 
            coreMesh.scale.set(60, 20, 60);
            
            // No rotation, static orientation
            coreMesh.rotation.set(0, 0, 0);
            
            coreMesh.userData = { 
                type: 'core-volumetric', 
                currentScaleMult: 1.0, 
                currentOp: 0.4
            };
            group.add(coreMesh);
        }

        // 4: Light (Quality-dependent: High = 3 PointLights, Low/Medium = 1 PointLight)
        if (quality === 'high') {
            const lightCenter = new THREE.PointLight(meta.color, 0.75, 120);
            lightCenter.position.set(0, 0, 0);
            group.add(lightCenter);

            // Spread lights along X/Z plane slightly to softly illuminate surrounding clouds
            const offset = 20;
            const lightLeft = new THREE.PointLight(meta.color, 0.45, 80);
            lightLeft.position.set(-offset, 0, 0);
            group.add(lightLeft);

            const lightRight = new THREE.PointLight(meta.color, 0.45, 80);
            lightRight.position.set(offset, 0, 0);
            group.add(lightRight);
        } else {
            const light = new THREE.PointLight(meta.color, 1.2, 120);
            light.position.set(0, 0, 0);
            group.add(light);
        }

        // 5: Hitbox
        const hitGeo = new THREE.SphereGeometry(30, 16, 12);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.userData = { clusterId, type: 'nebula-hitbox' };
        group.add(hitMesh);

        scene.add(group);
        state.meshes[clusterId] = group;
    }
}

export function updateNebulae(
    state: GalaxyNebulaeState,
    time: number,
    cameraState: string,
    focusedCluster: ClusterType | null
): void {
    for (const group of Object.values(state.meshes)) {
        group.rotation.y += 0.001;
        
        const clusterId = group.userData.clusterId as ClusterType;
        const isFocused = cameraState === 'focused' && focusedCluster === clusterId;
        const isOverview = cameraState === 'overview';
        const targetOpacityMultiplier = (isOverview || isFocused) ? 1.0 : 0.05;

        for (const child of group.children) {
            const ud = child.userData as Record<string, unknown>;
            if (ud.type === 'core-volumetric') {
                const targetScaleMult = isFocused ? 0.25 : 1.0;
                // Higher opacity for visibility, the shader naturally decays it
                const targetOp = isFocused ? 1.0 : 0.6;
                
                ud.currentScaleMult = (ud.currentScaleMult as number ?? 1.0) + (targetScaleMult - (ud.currentScaleMult as number ?? 1.0)) * 0.05;
                ud.currentOp = (ud.currentOp as number) + (targetOp - (ud.currentOp as number)) * 0.05;

                // Muted, organic breathing/pulsing effect
                const pulseSpeed = isFocused ? 1.5 : 0.8;
                const pulseAmp = isFocused ? 0.08 : 0.05;
                const pulse = 1 + Math.sin(time * pulseSpeed) * pulseAmp;

                const mult = (ud.currentScaleMult as number) * pulse;
                
                // Base dimensions for the oblate spheroid (flattened sphere)
                const baseX = 60;
                const baseY = 20;
                const baseZ = 60;
                (child as THREE.Mesh).scale.set(baseX * mult, baseY * mult, baseZ * mult);
                
                // Static orientation, no rotation
                
                const mat = (child as THREE.Mesh).material as THREE.ShaderMaterial;
                mat.uniforms.objScale.value.set(baseX * mult, baseY * mult, baseZ * mult);
                
                // Subtle opacity breath
                const finalOp = (ud.currentOp as number) + Math.sin(time * 1.5) * (isFocused ? 0.1 : 0.05);
                const finalTargetOp = finalOp * targetOpacityMultiplier;
                mat.uniforms.opacity.value += (finalTargetOp - mat.uniforms.opacity.value) * 0.05;
                mat.opacity = mat.uniforms.opacity.value; // Sync base material opacity parameter
            } else if (ud.type === 'core-discs') {
                const targetScale = isFocused ? 0.25 : 1.0;
                const targetOp = isFocused ? 0.8 : 0.4;
                
                ud.currentScale = (ud.currentScale as number) + (targetScale - (ud.currentScale as number)) * 0.05;
                ud.currentOp = (ud.currentOp as number) + (targetOp - (ud.currentOp as number)) * 0.05;

                const pulseSpeed = isFocused ? 3.0 : 1.5;
                const pulseAmp = isFocused ? 0.15 : 0.08;
                const pulse = 1 + Math.sin(time * pulseSpeed) * pulseAmp;

                const s = (ud.currentScale as number) * pulse;
                (child as THREE.Group).scale.set(s, s, 1.0);
                
                const finalOpRatio = (ud.currentOp as number) / 0.4;
                child.children.forEach(layer => {
                    const mesh = layer as THREE.Mesh;
                    const layerUd = mesh.userData;
                    mesh.rotation.z += layerUd.rotSpeed;
                    
                    const mat = mesh.material as THREE.MeshBasicMaterial;
                    const finalOp = (layerUd.baseOpacity as number) * finalOpRatio;
                    mat.opacity += ((finalOp * targetOpacityMultiplier) - mat.opacity) * 0.05;
                });
            } else if (ud.type === 'nebula-cloud') {
                const mat = ((child as THREE.Points).material as THREE.PointsMaterial);
                const baseOp = 0.45 + Math.sin(time * 0.6) * 0.05;
                mat.opacity += ((baseOp * targetOpacityMultiplier) - mat.opacity) * 0.05;
            } else if (ud.type === 'sparks') {
                (child as THREE.Points).rotation.y += 0.003;
                const mat = ((child as THREE.Points).material as THREE.PointsMaterial);
                const baseOp = 0.6;
                mat.opacity += ((baseOp * targetOpacityMultiplier) - mat.opacity) * 0.05;
            }
        }
    }
}

export function buildMapStars(scene: THREE.Scene): THREE.Points {
    const profile = getProfile();
    const geo = new THREE.BufferGeometry();
    const n = profile.mapStarsCount;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 600;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffffff, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.7
    });
    const stars = new THREE.Points(geo, mat);
    scene.add(stars);
    return stars;
}

// Helpers
function _createGlowTexture(cache: Map<string, THREE.CanvasTexture>, size: number, color: string, softness: number = 0.5): THREE.CanvasTexture {
    const key = `glow_${size}_${color}_${softness}`;
    if (cache.has(key)) return cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(softness, color + '80');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    const texture = new THREE.CanvasTexture(canvas);
    cache.set(key, texture);
    return texture;
}

function _getSparksColor(clusterId: ClusterType): string {
    switch (clusterId) {
        case 'programming': return '#a78bfa';
        case 'medicine':    return '#fca5a5';
        case 'geology':     return '#6ee7b7';
    }
}
