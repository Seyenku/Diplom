/**
 * shipController.ts — Единая физика движения корабля
 *
 * Используется в screenFlight и screenMiniGame.
 * Принимает конфиг и управление, обновляет позицию/вращение корабля.
 */

import * as THREE from 'three';
import { getMovementVector, getPointerPosition } from '../inputManager.js';

// ── Конфигурация ────────────────────────────────

export interface ShipControllerConfig {
    maxSpeed: number;
    accel: number;
    drag: number;          // 0–1, чем ниже — тем больше трение
    boundsX: number;       // половина ширины игрового поля
    boundsY: number;       // половина высоты игрового поля
    rollFactor: number;    // интенсивность крена (обычно 0.4)
    pitchFactor: number;   // интенсивность тангажа (обычно 0.2)
    lerpSpeed: number;     // скорость интерполяции вращения (обычно 6)
}

// ── Пресеты ─────────────────────────────────────

export const FLIGHT_SHIP_CONFIG: ShipControllerConfig = {
    maxSpeed: 12,
    accel: 40,
    drag: 0.92,
    boundsX: 8,      // FIELD_W / 2
    boundsY: 5,      // FIELD_H / 2
    rollFactor: 0.4,
    pitchFactor: 0.2,
    lerpSpeed: 6,
};

export const MINIGAME_SHIP_CONFIG: ShipControllerConfig = {
    maxSpeed: 12,
    accel: 35,
    drag: 0.90,
    boundsX: 7,
    boundsY: 4,
    rollFactor: 0.4,
    pitchFactor: 0.2,
    lerpSpeed: 6,
};

// ── Обновление физики ───────────────────────────

/**
 * Обновляет позицию и вращение корабля на основе ввода.
 *
 * @param ship      - Group корабля
 * @param velocity  - текущая скорость (мутируется)
 * @param dt        - delta time в секундах
 * @param config    - конфигурация физики
 * @param boostMult - множитель ускорения (1.0 = нет буста)
 * @param speedBonusMult - бонус к скорости из апгрейдов (1.0 = нет бонуса)
 */
export function updateShipPhysics(
    ship: THREE.Group,
    velocity: THREE.Vector2,
    dt: number,
    config: ShipControllerConfig,
    boostMult = 1.0,
    speedBonusMult = 1.0,
): void {
    const maxSpeed = config.maxSpeed * boostMult * speedBonusMult;
    const accel = config.accel * boostMult;

    const move = getMovementVector();
    const pointer = getPointerPosition();

    // Pointer (мышь/тач) имеет приоритет над клавиатурой
    if (pointer) {
        const targetX = pointer.x * config.boundsX;
        const targetY = pointer.y * config.boundsY;

        const dx = targetX - ship.position.x;
        const dy = targetY - ship.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.1) {
            const dirX = dx / dist;
            const dirY = dy / dist;
            const thrust = Math.min(dist * 8, accel);
            velocity.x += dirX * thrust * dt;
            velocity.y += dirY * thrust * dt;
        }
    } else if (move.lengthSq() > 0) {
        velocity.x += move.x * accel * dt;
        velocity.y += move.y * accel * dt;
    }

    // Drag (экспоненциальное затухание)
    const dragFactor = Math.pow(config.drag, dt * 60);
    velocity.x *= dragFactor;
    velocity.y *= dragFactor;

    // Clamp speed
    if (velocity.lengthSq() > maxSpeed * maxSpeed) {
        velocity.normalize().multiplyScalar(maxSpeed);
    }

    // Apply velocity
    ship.position.x += velocity.x * dt;
    ship.position.y += velocity.y * dt;

    // Clamp position
    ship.position.x = Math.max(-config.boundsX, Math.min(config.boundsX, ship.position.x));
    ship.position.y = Math.max(-config.boundsY, Math.min(config.boundsY, ship.position.y));

    // Roll & pitch (visual tilt)
    const rollIntensity = velocity.x / maxSpeed;
    const pitchIntensity = velocity.y / maxSpeed;

    const targetRoll = -rollIntensity * config.rollFactor;
    const targetPitch = pitchIntensity * config.pitchFactor;

    ship.rotation.z += (targetRoll - ship.rotation.z) * (dt * config.lerpSpeed);
    ship.rotation.x += (targetPitch - ship.rotation.x) * (dt * config.lerpSpeed);
}
