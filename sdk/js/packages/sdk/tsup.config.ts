import { defineConfig } from "tsup"


export default defineConfig({
    entry: ["src/index.ts", "src/server.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    minify: true,
    treeshake: true,
    bundle: true,
    outDir: "dist",
});
