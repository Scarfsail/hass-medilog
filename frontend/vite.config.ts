import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
    const isProduction = mode === 'production';
    return {
        build: {
            lib: {
                entry: "./cards/medilog-card.ts",
                formats: ["es"],
                fileName: () => "medilog-card.js",
            },
            rollupOptions: {
                output: {
                    inlineDynamicImports: true
                },
                external: []
            },
            emptyOutDir: false,
            outDir: "../custom_components/medilog/frontend_compiled",
            assetsDir: "compiled",
            sourcemap: !isProduction, // Enable source maps in development mode
            minify: isProduction // Minify only in production mode
        },
        plugins: [],
        define: {
            "process.env.NODE_ENV": JSON.stringify(isProduction ? "production" : "development"),
        }
    }
});
