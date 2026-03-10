# AGENTS.md

## Project

GPU lightmap baker for Three.js scenes. Loads GLB models, UV-unwraps them with XAtlas, renders world-position/normal atlas textures, then raycasts via three-mesh-bvh on the GPU to produce a baked lightmap with optional bilateral denoising.

## Vision (target UX)

In the browser, the user can:

- upload their GLB model
- add, edit, and remove lights
- preview the render

When satisfied, they can:

- either save their configuration for use with the `bake` script
- or generate the lightmap and download it

## Tech stack

- **Language**: TypeScript (ESM, `"type": "module"`)
- **Runtime**: Node 20.20.0
- **Package manager**: Yarn 4 (`yarn@4.12.0`, `.yarnrc.yml`)
- **Bundler**: Vite 7 — two entry points: `index.html` (interactive demo) and `bake.html` (headless bake)
- **3D**: Three.js 0.183, three-mesh-bvh (BVH + GPU raycasting), xatlas-three (UV unwrapping)
- **UI**: Tweakpane
- **Linter/formatter**: Biome 2 — single quotes, no semicolons, 2-space indent, recommended rules
- **Git hooks**: Husky + lint-staged (runs `biome check --write` on `src/**/*.{js,ts}`)
- **Commits**: Commitizen + commitlint with `ccgls` convention

## Architecture

```txt
src/
├── index.ts                         # Browser entry (loads XAtlas, boots LightBakerExample)
├── LightBakerExample.ts             # Interactive demo: scene, camera, Tweakpane UI, render loop
├── atlas/
│   ├── generateAtlas.ts             # XAtlas WASM loading + UV1 unwrap
│   └── renderAtlas.ts               # Renders world-position & normal textures in UV1 space (with dilation)
├── bake/
│   ├── bakeLightmap.ts              # Programmatic API: load model → atlas → BVH → accumulate N samples → denoise → Uint8Array
│   └── BakeEntry.ts                 # bake.html entry: reads URL params, calls bakeLightmap, exposes result on window
├── lightmap/
│   ├── Lightmapper.ts               # Core: creates ping-pong render targets, LightmapperMaterial, render()/denoise() API
│   ├── LightmapperMaterial.ts       # ShaderMaterial — GLSL fragment does BVH raycasting (direct + indirect + AO)
│   ├── LightmapDenoiser.ts          # Bilateral filter post-process (edge-preserving)
│   └── LightmapperUtils.ts          # Helpers: renderSampleCount(), renderTime()
├── denoise/
│   └── DenoiseMaterial.ts           # Alternative smart denoise shader (currently unused in main pipeline)
└── utils/
    ├── GeometryUtils.ts             # mergeGeometry() for BVH construction
    └── LoaderUtils.ts               # Promise wrappers for TextureLoader / GLTFLoader

scripts/
└── bake-lightmap.ts                 # CLI: spins up Vite + Playwright, navigates to bake.html, waits for result, saves PNG
```

### Bake pipeline

1. **XAtlas** unwraps all meshes → `uv1` attribute (`TEXCOORD_1` in glTF)
2. **renderAtlas** renders meshes in UV1 space → position texture + normal texture (with texel dilation for seam bleeding)
3. **mergeGeometry** + **MeshBVH** builds the acceleration structure
4. **LightmapperMaterial** (fullscreen quad) reads position/normal textures, casts rays per texel via BVH:
   - Direct light (shadow rays toward point lights, soft shadows, inverse-square attenuation, dosable N·L)
   - Indirect light (cosine-weighted hemisphere sampling)
   - AO (hemisphere occlusion within `ambientDistance`)
5. **Ping-pong accumulation**: running average across N samples in float32 render targets
6. **Bilateral denoise** (optional) preserves hard shadow edges while smoothing Monte Carlo noise

### Headless bake (`yarn bake`)

Uses Playwright to launch Chrome in headless mode, navigates to `bake.html?input=…&resolution=…&samples=…`, waits for `window.__bakeComplete`, extracts the base64 PNG.

## Code conventions

- **Biome**: single quotes, no semicolons, 2-space indentation, recommended lint rules
- **No explicit `any`** unless annotated with `// biome-ignore lint/suspicious/noExplicitAny: <reason>`
- Prefer `type` imports (`import type { ... }`) when importing only types
- Shader code uses `/* glsl */` tagged template literals for syntax highlighting
- GLSL uniforms follow camelCase naming
- French comments are acceptable (this is a francophone author's project)

## Commands

| Command                                                                                                 | Description                              |
|---------------------------------------------------------------------------------------------------------|------------------------------------------|
| `yarn dev`                                                                                              | Start Vite dev server (interactive demo) |
| `yarn build`                                                                                            | Production build                         |
| `yarn bake --input <file.glb> --output <out.png> [--resolution 1024] [--samples 64] [--casts 2] [--gpu]`| Headless lightmap bake via Playwright    |

## Key types

- `LightDef` — point light definition (`position`, `size`, `intensity`, `color`, `distance`)
- `RaycastOptions` — lightmapper config (resolution, casts, lights, toggles for direct/indirect/AO)
- `Lightmapper` — returned by `generateLightmapper()`, exposes `render()`, `denoise()`, `renderTexture`
- `BakeOptions` — high-level bake config for `bakeLightmap()`
- `DenoiserOptions` — bilateral filter params (`kernelRadius`, `spatialSigma`, `rangeSigma`)

## Gotchas

- `CONFIG.debug` (default `false`) gates all console logs and debug blocks (attributs stats, pixels distribution, XAtlas progress, etc.). Set to `true` for development or headless bake debugging.
- `MAX_LIGHTS` is configurable via `CONFIG.maxLights` (default 4); GLSL arrays remain fixed-size at compile time
- XAtlas WASM must be loaded before any atlas operation (`loadXAtlasThree()`)
- The interactive demo auto-pauses accumulation after 2.5s via `setTimeout` — there is no convergence criterion yet
- `DenoiseMaterial.ts` (smart denoise, `@deprecated`) is kept with annotations but not wired; the active denoiser is `LightmapDenoiser.ts` (bilateral filter)
- Headless bake requires system Chrome (`channel: 'chrome'`) with `--headless=new` for Metal/ANGLE GPU access on macOS
