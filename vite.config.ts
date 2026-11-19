import { defineConfig } from 'vite';

// GitHub Pages serves the site from /Liquid-Glass/; local dev stays at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' && process.env.GITHUB_PAGES ? '/Liquid-Glass/' : '/',
}));
