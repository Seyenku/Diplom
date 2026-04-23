/**
 * sfxSynth.ts — Программный синтез звуковых эффектов (SFX) и фоновой музыки.
 * 
 * Генерация аудио на лету через Web Audio API,
 * избавляет от необходимости скачивать сотни мелких .mp3 файлов.
 */

import { SfxName, MusicName } from './types.js';

type SfxGenerator = (ctx: AudioContext, destination: AudioNode) => void;

const SFX_GENERATORS: Record<SfxName, SfxGenerator> = {
    // ── UI ──────────────────────────────────────────────────────────────
    ui_click(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    },
    ui_hover(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    },
    ui_error(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    },
    ui_success(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.1); // C#
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2); // E
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    },
    screen_transition(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    },

    // ── Геймплей (Полёт / Мини-игра) ────────────────────────────────────
    crystal_collect(ctx, dest) {
        const t = ctx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C E G C
        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.2, t + i * 0.04 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.04 + 0.2);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(t + i * 0.04);
            osc.stop(t + i * 0.04 + 0.2);
        });
    },
    asteroid_hit(ctx, dest) {
        // Белый шум
        const bufferSize = ctx.sampleRate * 0.3; // 300ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(800, ctx.currentTime);
        noiseFilter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
        
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(dest);
        noise.start();

        // Низкий удар
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);
        oscGain.gain.setValueAtTime(0.6, ctx.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(oscGain);
        oscGain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    },
    shield_warning(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 220;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    },
    minigame_dodge(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    },
    minigame_land(ctx, dest) {
        const freqs = [261.63, 329.63, 392.00, 523.25]; // C major
        const t = ctx.currentTime;
        freqs.forEach((f) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.2, t + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(t);
            osc.stop(t + 0.8);
        });
    },
    minigame_crash(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(20, ctx.currentTime + 0.6);
        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
    },

    // ── События ─────────────────────────────────────────────────────────
    countdown_tick(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    },
    countdown_go(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 1200;
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    },
    flight_end_success(ctx, dest) {
        SFX_GENERATORS.ui_success(ctx, dest); // Переиспользуем
    },
    flight_end_fail(ctx, dest) {
        SFX_GENERATORS.ui_error(ctx, dest);
    },
    planet_unlock(ctx, dest) {
        const t = ctx.currentTime;
        const freqs = [440, 554.37, 659.25, 880];
        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f * 0.5, t + i * 0.1);
            osc.frequency.exponentialRampToValueAtTime(f, t + i * 0.1 + 0.1);
            gain.gain.setValueAtTime(0, t + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.2, t + i * 0.1 + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.6);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(t + i * 0.1);
            osc.stop(t + i * 0.1 + 0.6);
        });
    },
    upgrade_buy(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    },
    achievement(ctx, dest) {
        const t = ctx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C E G C
        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0, t + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.3, t + i * 0.1 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.4);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(t + i * 0.1);
            osc.stop(t + i * 0.1 + 0.4);
        });
    },
    scan_pulse(ctx, dest) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    }
};

/**
 * Рендерит генератор SFX в AudioBuffer, чтобы можно было проигрывать его
 * многократно без затрат на процессорное время генерации.
 */
export async function renderSfxToBuffer(ctx: AudioContext, name: SfxName): Promise<AudioBuffer> {
    const generator = SFX_GENERATORS[name];
    if (!generator) throw new Error(`Unknown SFX: ${name}`);

    // Создаём OfflineAudioContext для рендеринга (1 секунда максимум для SFX)
    const offlineCtx = new OfflineAudioContext(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    generator(offlineCtx as unknown as AudioContext, offlineCtx.destination);
    
    return await offlineCtx.startRendering();
}

