/**
 * build.mjs — Бандлинг клиентского кода через esbuild.
 *
 * Запускается из npm run build (после tsc --noEmit для type-check).
 * Параллельно вызывается из csproj <Target Name="CompileTypeScript" />.
 *
 * Что делает:
 *  - Бандлит main.ts в один main.js (+ source map в Dev).
 *  - splitting: true → dynamic import'ы (редкие экраны) уходят в отдельные чанки.
 *  - Three.js включается в бандл (нет CDN-зависимости).
 *  - Output: wwwroot/js/game/dist/ (отдельная папка, легко чистить).
 */

import { build, context } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === 'production'
            || process.argv.includes('--prod')
            || process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const OUT_DIR = resolve(__dirname, 'wwwroot/js/game/dist');
const ENTRY = resolve(__dirname, 'wwwroot/ts/game/main.ts');

const config = {
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    outdir: OUT_DIR,
    entryNames: 'main',
    chunkNames: 'chunks/[name]-[hash]',
    splitting: true,           // dynamic import → отдельные chunks
    minify: isProd,
    sourcemap: !isProd ? 'linked' : false,
    treeShaking: true,
    legalComments: 'none',
    metafile: true,
    logLevel: 'info',
    // resolve .js suffixes in TS imports (см. tsconfig moduleResolution: bundler)
    resolveExtensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx'],
};

async function cleanOutDir() {
    if (existsSync(OUT_DIR)) {
        await rm(OUT_DIR, { recursive: true, force: true });
    }
    await mkdir(OUT_DIR, { recursive: true });
}

async function once() {
    await cleanOutDir();
    const t0 = Date.now();
    const result = await build(config);
    const t = Date.now() - t0;

    if (result.metafile) {
        const total = Object.values(result.metafile.outputs).reduce((s, o) => s + o.bytes, 0);
        const totalKb = (total / 1024).toFixed(1);
        console.log(`[esbuild] bundled in ${t}ms — total ${totalKb} KB (${isProd ? 'prod-min' : 'dev'})`);
    }
}

async function watch() {
    await cleanOutDir();
    const ctx = await context(config);
    await ctx.watch();
    console.log('[esbuild] watching for changes...');
}

if (isWatch) {
    watch().catch(err => { console.error(err); process.exit(1); });
} else {
    once().catch(err => { console.error(err); process.exit(1); });
}
