/**
 * screenCharCreation.ts — Модуль экрана создания персонажа
 */

import { dispatch, transition, Screen } from '../stateManager.js';
import { CrystalType, GameStore } from '../types.js';

let _selectedAvatar: string | null = null;

window._charCreation = {
    selectAvatar(btn: HTMLElement) {
        // Снимаем выделение с предыдущего
        document.querySelectorAll('.avatar-btn').forEach(b => {
            (b as HTMLElement).style.borderColor = 'var(--color-border)';
            (b as HTMLElement).style.boxShadow   = 'none';
        });
        // Выделяем выбранный
        btn.style.borderColor = 'var(--color-primary)';
        btn.style.boxShadow   = '0 0 12px rgba(79,195,247,0.4)';
        _selectedAvatar = btn.dataset.avatar!;
    },

    submit() {
        const nameInput = document.getElementById('navigator-name') as HTMLInputElement;
        const nameError = document.getElementById('name-error');
        const avatarError = document.getElementById('avatar-error');

        let valid = true;

        // Валидация имени
        const name = nameInput?.value?.trim() ?? '';
        if (name.length < 2) {
            if (nameError) nameError.textContent = 'Имя должно содержать не менее 2 символов.';
            valid = false;
        }

        // Валидация аватара
        if (!_selectedAvatar) {
            if (avatarError) avatarError.textContent = 'Выбери аватар.';
            valid = false;
        }

        if (!valid) return;

        // Сохраняем игрока в store
        dispatch('SET_PLAYER', {
            name,
            avatarId: _selectedAvatar!,
            crystals: { it: 0, bio: 0, math: 0, eco: 0, design: 0, med: 0, neuro: 0, physics: 0 } as Record<CrystalType, number>,
            discoveredPlanets: [],
            appliedUpgrades:   [],
            shipStats: { speedBonus: 0, shieldBonus: 0, scanRange: 1, capacity: 50 },
            stats: { scans: 0, miniGamesPlayed: 0, totalCrystalsEarned: 0 },
            badges: [],
        });

        transition(Screen.ONBOARDING);
    }
};

export async function init(_store: Readonly<GameStore>): Promise<void> {
    _selectedAvatar = null;
}

export function destroy(): void {}
