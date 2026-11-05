import { defineConfig } from 'vite';

// Served by Apache at /editor/, beside the EMR (same origin)
export default defineConfig({
    base: '/editor/',
    build: {
        // Browsers with CSS nesting, which CKEditor 5's stylesheet uses
        target: ['chrome112', 'edge112', 'firefox117', 'safari16.5'],
        outDir: 'dist',
        emptyOutDir: true
    }
});
