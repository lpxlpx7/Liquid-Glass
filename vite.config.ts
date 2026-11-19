import { defineConfig } from 'vite';

// Relative asset paths: the build works at a domain root (custom domain)
// and under a sub-path such as https://<user>.github.io/Liquid-Glass/.
export default defineConfig({
  base: './',
});
