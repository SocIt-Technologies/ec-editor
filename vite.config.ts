import { defineConfig } from 'vite';

// Served by Apache at /editor/, beside the EMR (same origin)
export default defineConfig({
    base: '/editor/',
    // The EMR's dev environment (environment.ts editorURL) expects the editor here
    server: {
        port: 5174,
        strictPort: true
    },
    build: {
        // Browsers with CSS nesting, which CKEditor 5's stylesheet uses
        target: ['chrome112', 'edge112', 'firefox117', 'safari16.5'],
        outDir: 'dist',
        emptyOutDir: true
    }
});
