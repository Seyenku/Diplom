/**
 * particleEffects.ts — Общая система частиц для визуального фидбека
 *
 * Архитектура: один THREE.Points на сцену, фиксированный кольцевой пул точек.
 * Все burst'ы пишут в общий буфер; один update-tick двигает все живые частицы.
 * Это убирает raf-per-particle и аллокацию geo/material на каждый burst.
 */

import * as THREE from 'three';

const POOL_SIZE = 256;            // потолок одновременных частиц
const ATTR_STRIDE = 3;            // x, y, z
// Точка, в которую прячем мёртвые слоты пула. THREE.PointsMaterial использует
// uniform size, поэтому per-vertex size=0 не делает частицу невидимой — она
// продолжит рисоваться материалом на месте смерти. Уносим её за far-plane
// камеры (2000) на много порядков — клип-пространство отбрасывает.
const VOID_FAR = 1e6;

interface PoolEntry {
    points: THREE.Points;
    geo: THREE.BufferGeometry;
    posAttr: THREE.BufferAttribute;
    colorAttr: THREE.BufferAttribute;
    sizeAttr: THREE.BufferAttribute;
    mat: THREE.PointsMaterial;
    positions: Float32Array;
    velocities: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
    lives: Float32Array;     // оставшееся время жизни в сек, ≤0 = слот свободен
    maxLives: Float32Array;  // полное время жизни (для scale fade)
    next: number;            // указатель кольца для записи следующей частицы
    sceneRef: THREE.Scene;
    lastTickMs: number;
    rafId: number | null;
    active: number;          // счётчик живых частиц (для skipping update'а пустого пула)
}

const _pools = new WeakMap<THREE.Scene, PoolEntry>();

function _getPool(scene: THREE.Scene): PoolEntry {
    let pool = _pools.get(scene);
    if (pool) return pool;

    const positions = new Float32Array(POOL_SIZE * ATTR_STRIDE);
    // Все слоты изначально «спрятаны» — иначе при первом setDrawRange они
    // нарисуются в (0,0,0) = у носа корабля.
    for (let i = 0; i < positions.length; i++) positions[i] = VOID_FAR;
    const velocities = new Float32Array(POOL_SIZE * ATTR_STRIDE);
    const colors = new Float32Array(POOL_SIZE * ATTR_STRIDE);
    const sizes = new Float32Array(POOL_SIZE);
    const lives = new Float32Array(POOL_SIZE);
    const maxLives = new Float32Array(POOL_SIZE);

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, ATTR_STRIDE);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const colorAttr = new THREE.BufferAttribute(colors, ATTR_STRIDE);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    const sizeAttr = new THREE.BufferAttribute(sizes, 1);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', colorAttr);
    geo.setAttribute('size', sizeAttr);
    geo.setDrawRange(0, 0);

    const mat = new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; // частицы спавнятся вокруг камеры — пусть всегда рисуются
    points.userData = { _particlePool: true };
    scene.add(points);

    pool = {
        points, geo, posAttr, colorAttr, sizeAttr, mat,
        positions, velocities, colors, sizes, lives, maxLives,
        next: 0,
        sceneRef: scene,
        lastTickMs: performance.now(),
        rafId: null,
        active: 0,
    };
    _pools.set(scene, pool);
    return pool;
}

function _ensureTickRunning(pool: PoolEntry): void {
    if (pool.rafId !== null) return;
    pool.lastTickMs = performance.now();
    const tick = (now: number): void => {
        const dt = Math.min((now - pool.lastTickMs) / 1000, 0.1);
        pool.lastTickMs = now;
        _updatePool(pool, dt);
        if (pool.active > 0) {
            pool.rafId = requestAnimationFrame(tick);
        } else {
            pool.rafId = null;
        }
    };
    pool.rafId = requestAnimationFrame(tick);
}

function _updatePool(pool: PoolEntry, dt: number): void {
    let alive = 0;
    let maxIdx = -1;
    for (let i = 0; i < POOL_SIZE; i++) {
        const life = pool.lives[i];
        if (life <= 0) continue;

        const newLife = life - dt;
        const base = i * ATTR_STRIDE;
        if (newLife <= 0) {
            pool.lives[i] = 0;
            pool.sizes[i] = 0;
            // Уносим за far-plane — иначе PointsMaterial.size (uniform)
            // продолжит её рисовать на месте смерти.
            pool.positions[base]     = VOID_FAR;
            pool.positions[base + 1] = VOID_FAR;
            pool.positions[base + 2] = VOID_FAR;
            continue;
        }
        pool.lives[i] = newLife;
        alive++;
        if (i > maxIdx) maxIdx = i;

        // Движение
        pool.positions[base]     += pool.velocities[base]     * dt;
        pool.positions[base + 1] += pool.velocities[base + 1] * dt;
        pool.positions[base + 2] += pool.velocities[base + 2] * dt;
        // Затухание скорости (drag)
        const drag = Math.pow(0.96, dt * 60);
        pool.velocities[base]     *= drag;
        pool.velocities[base + 1] *= drag;
        pool.velocities[base + 2] *= drag;
        // Scale fade по доле прожитого (атрибут не читается стандартным
        // PointsMaterial, оставлен как информационный для возможного перехода
        // на ShaderMaterial).
        const lifeRatio = newLife / pool.maxLives[i];
        pool.sizes[i] = pool.maxLives[i] > 0 ? (0.12 + 0.18 * lifeRatio) : 0;
    }
    pool.active = alive;
    pool.posAttr.needsUpdate = true;
    pool.sizeAttr.needsUpdate = true;
    pool.geo.setDrawRange(0, maxIdx + 1);
}

/**
 * Спавнит burst из частиц, разлетающихся из точки.
 * Использует общий пул сцены — без аллокации geo/material.
 */
export function spawnParticleBurst(
    scene: THREE.Scene,
    position: THREE.Vector3,
    color: number,
    count: number,
    spread: number,
    life: number,
    _particleSize = 0.06, // оставлено для совместимости сигнатуры; размер задаётся пулом
): void {
    const pool = _getPool(scene);
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8)  & 0xff) / 255;
    const b = (color & 0xff) / 255;

    for (let i = 0; i < count; i++) {
        const idx = pool.next;
        pool.next = (pool.next + 1) % POOL_SIZE;

        const base = idx * ATTR_STRIDE;
        pool.positions[base]     = position.x;
        pool.positions[base + 1] = position.y;
        pool.positions[base + 2] = position.z;
        pool.velocities[base]     = (Math.random() - 0.5) * spread;
        pool.velocities[base + 1] = (Math.random() - 0.5) * spread;
        pool.velocities[base + 2] = (Math.random() - 0.5) * spread * 0.6;
        pool.colors[base]     = r;
        pool.colors[base + 1] = g;
        pool.colors[base + 2] = b;
        pool.sizes[idx] = 0.3;
        pool.lives[idx] = life;
        pool.maxLives[idx] = life;
    }
    pool.posAttr.needsUpdate = true;
    pool.colorAttr.needsUpdate = true;
    pool.sizeAttr.needsUpdate = true;
    pool.active += count;
    _ensureTickRunning(pool);
}

/** Hit particles (красные, быстрый разлёт) */
export function spawnHitParticles(scene: THREE.Scene, pos: THREE.Vector3): void {
    spawnParticleBurst(scene, pos, 0xf87171, 8, 8, 0.6);
}

/** Collect particles (цвет настраивается, мягкий разлёт) */
export function spawnCollectParticles(scene: THREE.Scene, pos: THREE.Vector3, color: number): void {
    spawnParticleBurst(scene, pos, color, 6, 5, 0.5, 0.05);
}

/** Очистка пула при разрушении сцены (вызывать из dispose родительского экрана). */
export function disposeParticlePool(scene: THREE.Scene): void {
    const pool = _pools.get(scene);
    if (!pool) return;
    if (pool.rafId !== null) cancelAnimationFrame(pool.rafId);
    scene.remove(pool.points);
    pool.geo.dispose();
    pool.mat.dispose();
    _pools.delete(scene);
}

// ── Floating text (2D DOM overlay) ──────────────

/**
 * Создаёт всплывающий текст, привязанный к 3D-позиции.
 * Элемент создаётся в указанном контейнере и автоматически удаляется.
 */
export function spawnFloatingText(
    container: HTMLElement,
    worldPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    text: string,
    color: number,
): void {
    const el = document.createElement('div');
    el.className = 'flight-floating-text';
    el.textContent = text;
    el.style.color = `#${color.toString(16).padStart(6, '0')}`;

    const projected = worldPos.clone().project(camera);
    const x = (projected.x * 0.5 + 0.5) * container.clientWidth;
    const y = (-projected.y * 0.5 + 0.5) * container.clientHeight;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    container.appendChild(el);

    requestAnimationFrame(() => {
        el.style.transform = 'translate(-50%, -80px)';
        el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 800);
}
