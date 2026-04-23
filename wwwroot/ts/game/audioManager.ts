import { SfxName, MusicName } from './types.js';
import { renderSfxToBuffer } from './sfxSynth.js';
import { getStore } from './stateManager.js';

let _ctx: AudioContext | null = null;
let _sfxGain: GainNode | null = null;
let _musicGain: GainNode | null = null;

const _sfxBufferCache = new Map<SfxName, AudioBuffer>();

// Music streaming nodes
let _audioEl: HTMLAudioElement | null = null;
let _musicSource: MediaElementAudioSourceNode | null = null;
let _musicLpFilter: BiquadFilterNode | null = null;
let _musicHpFilter: BiquadFilterNode | null = null;
let _tremoloGain: GainNode | null = null;
let _tremoloLfo: OscillatorNode | null = null;
let _tremoloLfoGain: GainNode | null = null;

let _currentMusicName: MusicName = 'none';

let _initialized = false;
let _isMutedByBrowser = true;

/**
 * Инициализирует аудио-контекст.
 * Вызывается из main.ts на первый клик по документу.
 */
export async function initAudio(): Promise<void> {
    if (_initialized) return;

    try {
        _ctx = new AudioContext();
        
        _sfxGain = _ctx.createGain();
        _musicGain = _ctx.createGain();
        
        _sfxGain.connect(_ctx.destination);
        _musicGain.connect(_ctx.destination);

        // Music Streaming Setup
        _audioEl = new Audio('/audio/ambient-space-texture.mp3');
        _audioEl.loop = true;
        _audioEl.crossOrigin = 'anonymous';

        _musicSource = _ctx.createMediaElementSource(_audioEl);
        _musicLpFilter = _ctx.createBiquadFilter();
        _musicLpFilter.type = 'lowpass';
        _musicLpFilter.frequency.value = 20000;
        
        _musicHpFilter = _ctx.createBiquadFilter();
        _musicHpFilter.type = 'highpass';
        _musicHpFilter.frequency.value = 20;

        _tremoloGain = _ctx.createGain();
        
        _tremoloLfo = _ctx.createOscillator();
        _tremoloLfoGain = _ctx.createGain();
        _tremoloLfo.type = 'sine';
        _tremoloLfo.frequency.value = 4; // 4 Hz тремоло
        _tremoloLfoGain.gain.value = 0; // Изначально выключено
        
        _tremoloLfo.start();
        _tremoloLfo.connect(_tremoloLfoGain);
        _tremoloLfoGain.connect(_tremoloGain.gain);

        // Роутинг музыки: Source -> HP -> LP -> Tremolo -> MusicGain
        _musicSource.connect(_musicHpFilter);
        _musicHpFilter.connect(_musicLpFilter);
        _musicLpFilter.connect(_tremoloGain);
        _tremoloGain.connect(_musicGain);

        // Восстанавливаем громкость
        const settings = getStore().settings;
        _sfxGain.gain.value = settings?.soundVolume ?? 0.7;
        _musicGain.gain.value = settings?.musicVolume ?? 0.5;

        _initialized = true;
        _isMutedByBrowser = false;
        
        if (_ctx.state === 'suspended') {
            await _ctx.resume();
        }

        console.log('[Audio] Initialized streaming engine');
        
        // Предзагрузка SFX
        await preloadSfx('ui_click', 'ui_hover', 'ui_success', 'ui_error', 'screen_transition');

    } catch (e) {
        console.warn('[Audio] Failed to initialize AudioContext', e);
    }
}

export function setSfxVolume(vol: number): void {
    if (_sfxGain && _ctx) {
        _sfxGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), _ctx.currentTime);
    }
}

export function setMusicVolume(vol: number): void {
    if (_musicGain && _ctx) {
        _musicGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), _ctx.currentTime);
    }
}

/**
 * Проигрывает звуковой эффект по имени
 */
export async function playSfx(name: SfxName): Promise<void> {
    if (!_ctx || !_sfxGain || _isMutedByBrowser) return;

    try {
        let buffer = _sfxBufferCache.get(name);
        if (!buffer) {
            buffer = await renderSfxToBuffer(_ctx, name);
            _sfxBufferCache.set(name, buffer);
        }

        const source = _ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(_sfxGain);
        source.start();
    } catch (e) {
        console.warn(`[Audio] Failed to play SFX: ${name}`, e);
    }
}

/**
 * Предзагружает список SFX
 */
export async function preloadSfx(...names: SfxName[]): Promise<void> {
    if (!_ctx) return;
    for (const name of names) {
        if (!_sfxBufferCache.has(name)) {
            try {
                const buffer = await renderSfxToBuffer(_ctx, name);
                _sfxBufferCache.set(name, buffer);
            } catch (e) {
                 console.warn(`[Audio] Failed to preload SFX: ${name}`, e);
            }
        }
    }
}

/**
 * Меняет атмосферу музыки динамически управляя фильтрами
 */
export async function playMusic(name: MusicName): Promise<void> {
    if (!_ctx || !_audioEl || !_musicLpFilter || !_musicHpFilter || !_tremoloGain || !_tremoloLfoGain || _isMutedByBrowser) return;
    if (_currentMusicName === name) return;

    _currentMusicName = name;

    try {
        if (_audioEl.paused && name !== 'none') {
            await _audioEl.play();
        }

        const t = _ctx.currentTime;
        const transTime = 1.5; // Плавный переход фильтров

        // Фиксируем текущие значения перед рампой (требование Web Audio API)
        _musicHpFilter.frequency.setValueAtTime(_musicHpFilter.frequency.value, t);
        _musicLpFilter.frequency.setValueAtTime(_musicLpFilter.frequency.value, t);
        _tremoloGain.gain.setValueAtTime(_tremoloGain.gain.value, t);
        _tremoloLfoGain.gain.setValueAtTime(_tremoloLfoGain.gain.value, t);

        // По умолчанию выключаем тремоло
        _tremoloGain.gain.linearRampToValueAtTime(1, t + transTime);
        _tremoloLfoGain.gain.linearRampToValueAtTime(0, t + transTime);

        switch (name) {
            case 'ambient_menu':
                _audioEl.playbackRate = 1.0;
                _musicHpFilter.frequency.exponentialRampToValueAtTime(20, t + transTime);
                _musicLpFilter.frequency.exponentialRampToValueAtTime(1200, t + transTime);
                break;
            case 'ambient_map':
                _audioEl.playbackRate = 1.0;
                _musicHpFilter.frequency.exponentialRampToValueAtTime(300, t + transTime);
                _musicLpFilter.frequency.exponentialRampToValueAtTime(20000, t + transTime);
                break;
            case 'ambient_flight':
                _audioEl.playbackRate = 0.85; // Замедляем, опускаем питч
                _musicHpFilter.frequency.exponentialRampToValueAtTime(100, t + transTime);
                _musicLpFilter.frequency.exponentialRampToValueAtTime(800, t + transTime);
                break;
            case 'ambient_minigame':
                _audioEl.playbackRate = 1.0;
                _musicHpFilter.frequency.exponentialRampToValueAtTime(20, t + transTime);
                _musicLpFilter.frequency.exponentialRampToValueAtTime(600, t + transTime);
                
                // Включаем тревожное тремоло
                _tremoloGain.gain.linearRampToValueAtTime(0.6, t + transTime);
                _tremoloLfoGain.gain.linearRampToValueAtTime(0.4, t + transTime);
                break;
            case 'none':
                _audioEl.pause();
                break;
        }
    } catch (e) {
        console.warn(`[Audio] Failed to update music params: ${name}`, e);
    }
}

export function stopMusic(): void {
    if (_audioEl) {
        _audioEl.pause();
        _currentMusicName = 'none';
    }
}
