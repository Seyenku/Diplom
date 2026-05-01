/**
 * flightCollisions.ts — Обработка столкновений для экрана полёта
 */

import * as THREE from 'three';
import { playSfx } from '../audioManager.js';
import { spawnHitParticles, spawnCollectParticles, spawnFloatingText } from '../systems/particleEffects.js';
import { triggerHitFeedback, FlightVfxState } from './flightVfx.js';

export const IFRAMES_DURATION = 1.5;
export const HIT_STUN_DURATION = 0.4;

export interface CollisionParams {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    shipModel: THREE.Group;
    vfxState: FlightVfxState;
    elapsed: number;
    
    asteroids: THREE.Object3D[];
    crystals: THREE.Object3D[];
    bonuses: THREE.Object3D[];
    
    capacity: number;
    combo: number;
    iFramesRemaining: number;
    crystalColorHex: number;
}

export interface CollisionResult {
    crystalsEarned: number;
    damageTaken: number;
    healAmount: number;
    hitAsteroid: boolean;
}

/**
 * Проверяет столкновения корабля с объектами.
 * Удаляет собранные/уничтоженные объекты из переданных массивов.
 */
export function checkCollisions(params: CollisionParams): CollisionResult {
    const res: CollisionResult = {
        crystalsEarned: 0,
        damageTaken: 0,
        healAmount: 0,
        hitAsteroid: false,
    };

    const sp = params.shipModel.position;
    const crystalThresholdSq = (1.2 + 0.6) ** 2;
    const asteroidThresholdSq = (1.2 + 0.8) ** 2;
    const bonusThresholdSq = (1.2 + 0.8) ** 2;

    const container = document.getElementById('screen-flight');

    // Кристаллы
    for (let i = params.crystals.length - 1; i >= 0; i--) {
        const c = params.crystals[i];
        if (sp.distanceToSquared(c.position) < crystalThresholdSq) {
            const earned = Math.max(1, Math.floor(params.capacity)) * params.combo;
            res.crystalsEarned += earned;
            
            if (container) {
                spawnFloatingText(container, c.position, params.camera, `+${earned}`, params.crystalColorHex);
            }
            playSfx('crystal_collect');
            spawnCollectParticles(params.scene, c.position, params.crystalColorHex);
            
            params.scene.remove(c);
            params.crystals.splice(i, 1);
        }
    }

    // Бонусы
    for (let i = params.bonuses.length - 1; i >= 0; i--) {
        const b = params.bonuses[i];
        if (sp.distanceToSquared(b.position) < bonusThresholdSq) {
            const bType = (b as any).userData._bonusType as string;
            
            if (bType === 'mega') {
                const earned = 5 * params.combo;
                res.crystalsEarned += earned;
                if (container) spawnFloatingText(container, b.position, params.camera, `+${earned} ★`, 0xfbbf24);
                spawnCollectParticles(params.scene, b.position, 0xfbbf24);
                playSfx('crystal_collect');
            } else if (bType === 'repair') {
                res.healAmount += 0.25; // 25% of max health
                if (container) spawnFloatingText(container, b.position, params.camera, '+25% 🛡', 0x4ade80);
                spawnCollectParticles(params.scene, b.position, 0x4ade80);
                playSfx('crystal_collect');
            }

            params.scene.remove(b);
            params.bonuses.splice(i, 1);
        }
    }

    // Астероиды
    for (let i = params.asteroids.length - 1; i >= 0; i--) {
        const a = params.asteroids[i] as THREE.Object3D & { userData: { _hit?: boolean } };
        if (sp.distanceToSquared(a.position) < asteroidThresholdSq && !a.userData._hit) {
            if (params.iFramesRemaining > 0) continue; // Skip if invulnerable

            a.userData._hit = true;
            res.damageTaken += 20;
            res.hitAsteroid = true;

            playSfx('asteroid_hit');
            triggerHitFeedback(params.vfxState, a.position, params.elapsed);
            spawnHitParticles(params.scene, a.position);
        }
    }

    return res;
}
