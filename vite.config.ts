import { defineConfig, Plugin } from 'vite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Replaces __BUILD_ID__ in dist/sw.js with a fresh id so every build gets its own service-worker cache. */
function swBuildId(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sw-build-id',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    closeBundle() {
      const f = join(outDir, 'sw.js');
      if (!existsSync(f)) return;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      writeFileSync(f, readFileSync(f, 'utf8').replace(/__BUILD_ID__/g, id));
    },
  };
}

export default defineConfig({ base: './', plugins: [swBuildId()], build: { target: 'es2020', assetsInlineLimit: 0, assetsDir: 'js' } });
