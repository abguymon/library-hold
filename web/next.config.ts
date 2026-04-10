import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.join(__dirname, "..", "lib");
const dataDir = path.join(__dirname, "..", "data");

const config: NextConfig = {
  // Tell Next.js the monorepo root so it doesn't warn about multiple lockfiles
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Standalone output for Docker: self-contained server with minimal deps
  output: "standalone",
  // Resolve @lib and @data aliases — both webpack (dev/build) and Turbopack (--turbopack)
  turbopack: {
    resolveAlias: {
      "@lib": libDir,
      "@data": dataDir,
    },
  },
  webpack(cfg) {
    cfg.resolve.alias = {
      ...(cfg.resolve.alias as Record<string, string>),
      "@lib": libDir,
      "@data": dataDir,
    };
    // lib/*.ts files use `.js` imports (NodeNext). Tell webpack to resolve
    // `.js` → `.ts` so the bundler can find the TypeScript source files.
    cfg.resolve.extensionAlias = {
      ".js": [".ts", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return cfg;
  },
};

export default config;
