/**
 * particleEffects.ts — Общая система частиц для визуального фидбека
 *
 * Используется в screenFlight (hit/collect particles, floating text).
 * Переиспользуемый модуль, не зависит от конкретного экрана.
 */

import * as THREE from 'three';

// ── Particle burst (сфера → разлёт) ────────────

/**
 * Спавнит burst из маленьких сфер, разлетающихся из точки.
 * Автоматически удаляет частицы из сцены по окончании жизни.
 */
export function spawnParticleBurst(
    scene: THREE.Scene,
    position: THREE.Vector3,
    color: number,
    count: number,
    spread: number,
    life: number,
    particleSize = 0.06,
): void {
    const geo = new THREE.SphereGeometry(particleSize, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color });

    for (let i = 0; i < count; i++) {
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(position);
        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * (spread * 0.6),
        );
        scene.add(p);
        _animateParticle(scene, p, vel, life);
    }

    // Dispose shared geo/mat after all particles finish
    setTimeout(() => { geo.dispose(); mat.dispose(); }, life * 1000 + 100);
}

/** Convenience: hit particles (red, fast spread) */
export function spawnHitParticles(scene: THREE.Scene, pos: THREE.Vector3): void {
    spawnParticleBurst(scene, pos, 0xf87171, 8, 8, 0.6);
}

/** Convenience: collect particles (custom color, softer spread) */
export function spawnCollectParticles(scene: THREE.Scene, pos: THREE.Vector3, color: number): void {
    spawnParticleBurst(scene, pos, color, 6, 5, 0.5, 0.05);
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

// ── Internal ────────────────────────────────────

function _animateParticle(scene: THREE.Scene, mesh: THREE.Mesh, vel: THREE.Vector3, life: number): void {
    const start = performance.now();
    function tick() {
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed >= life) {
            scene.remove(mesh);
            return;
        }
        const dt = 0.016; // ~60fps step
        mesh.position.add(vel.clone().multiplyScalar(dt));
        vel.multiplyScalar(0.96);
        mesh.scale.setScalar(1 - elapsed / life);
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}
