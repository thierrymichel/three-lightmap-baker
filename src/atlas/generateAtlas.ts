import type { Mesh } from 'three'
import { BufferAttribute } from 'three'
import { UVUnwrapper } from 'xatlas-three'
import { CONFIG } from '../CONFIG'

const unwrapper = new UVUnwrapper({ BufferAttribute: BufferAttribute })

enum ProgressCategory {
  AddMesh,
  ComputeCharts,
  PackCharts,
  BuildOutputMeshes,
}

const DEFAULT_WASM_URL =
  'https://cdn.jsdelivr.net/npm/xatlasjs@0.2.0/dist/xatlas.wasm'
const DEFAULT_JS_URL =
  'https://cdn.jsdelivr.net/npm/xatlasjs@0.2.0/dist/xatlas.js'

/**
 * Loads the XAtlas WASM library. Must be called before any atlas operation.
 *
 * @param wasmUrl - URL to xatlas.wasm (default: jsDelivr CDN)
 * @param jsUrl - URL to xatlas.js
 */
export const loadXAtlasThree = async (
  wasmUrl = DEFAULT_WASM_URL,
  jsUrl = DEFAULT_JS_URL,
) => {
  const onProgress = (mode: number, progress: number) => {
    if (CONFIG.debug) {
      console.log(`🗺️ XAtlas ${ProgressCategory[mode]} ${progress}%`)
    }
  }
  await unwrapper.loadLibrary(onProgress, wasmUrl, jsUrl)

  if (CONFIG.debug) {
    console.log('Loaded')
  }
}

/**
 * Generates UV2 atlas for the given meshes using XAtlas.
 * Writes the result to each mesh geometry's uv2 attribute.
 *
 * @param meshes - Meshes to unwrap (must have uv attribute)
 */
export const generateAtlas = async (meshes: Mesh[]) => {
  const geometry = meshes.map((mesh) => mesh.geometry)

  // We can pass in options to the unwrapper
  // unwrapper.packOptions.padding = 1;

  // Write the shared UVs the uv2 attribute
  await unwrapper.packAtlas(geometry, 'uv2', 'uv')
}
