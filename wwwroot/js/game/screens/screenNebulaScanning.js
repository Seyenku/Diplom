/**
 * screenNebulaScanning.js — Модуль экрана сканирования туманности
 */

import { dispatch, transition, Screen, getStore } from '../stateManager.js';

const DIR_LABELS = {
    it: 'IT', bio: 'Биотех', math: 'Математика',
    eco: 'Экология', design: 'Дизайн', med: 'Медицина',
    neuro: 'Нейронауки', physics: 'Физика',
};

window._nebulaScan = {
    updateSlider(input) {
        const dir = input.dataset.dir;
        const val = document.getElementById(`val-${dir}`);
        if (val) val.textContent = input.value;
        _updateChance();
    },

    async startScan() {
        const crystalsSpent = _collectSliders();
        if (Object.values(crystalsSpent).every(v => v === 0)) {
            alert('Потрать хотя бы 1 кристалл перед сканированием.');
            return;
        }

        const btn = document.getElementById('btn-scan');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Сканирование…'; }

        try {
            const resp = await fetch('/game?handler=ScanNebula', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body:    JSON.stringify({ nebulaId: 'nebula-1', crystalsSpent }),
            });

            if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
            const result = await resp.json();
            _showResult(result, crystalsSpent);

            if (result.success && result.discoveredPlanetId) {
                dispatch('DISCOVER_PLANET', { planetId: result.discoveredPlanetId });
                dispatch('SPEND_CRYSTALS', { spent: crystalsSpent });
            }
        } catch (e) {
            _showResult({ success: false, message: 'Ошибка сети: ' + e.message }, {});
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔭 Запустить сканер'; }
        }
    }
};

function _collectSliders() {
    const result = {};
    document.querySelectorAll('input[type=range][data-dir]').forEach(inp => {
        const v = parseInt(inp.value, 10);
        if (v > 0) result[inp.dataset.dir] = v;
    });
    return result;
}

function _updateChance() {
    const spent = _collectSliders();
    const total = Object.values(spent).reduce((a, b) => a + b, 0);
    const chanceEl = document.getElementById('scan-chance');
    if (!chanceEl) return;
    if (total === 0) { chanceEl.textContent = '—'; return; }
    // Приблизительная оценка на клиенте
    const approx = Math.min(95, Math.round(total * 3));
    chanceEl.textContent = `~${approx}%`;
}

function _showResult(result, spent) {
    const log = document.getElementById('scan-result-log');
    if (!log) return;
    log.classList.remove('hidden');
    log.innerHTML = result.success
        ? `<p style="color:#4ade80;font-weight:600;">✅ ${result.message}</p>
           <p style="color:var(--color-text-muted);margin-top:0.5rem;">
              Шанс открытия: ${Math.round((result.successChance ?? 0) * 100)}%<br>
              <button class="btn-game btn-primary" style="margin-top:1rem;padding:8px 20px;" onclick="window._spa?.goto('planet-detail')">Смотреть планету →</button>
           </p>`
        : `<p style="color:#f87171;font-weight:600;">❌ ${result.message}</p>
           <p style="color:var(--color-text-muted);margin-top:0.5rem;">Шанс был: ~${Math.round((result.successChance ?? 0) * 100)}%. Попробуй ещё раз с другим набором кристаллов.</p>`;
}

export async function init(_store) {}
export function destroy() { delete window._nebulaScan; }
