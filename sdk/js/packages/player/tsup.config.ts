import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "react/index": "src/react/index.tsx",
    "server/index": "src/server/index.ts",
  },

  format: ["esm", "cjs"],

  dts: true,

  splitting: false,

  sourcemap: false,

  clean: true,

  minify: true,

  treeshake: true,

  bundle: true,

  outDir: "dist",

  external: ["react", "react-dom", "@vidstack/react", "vidstack"],
});
