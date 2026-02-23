import type { Mesh } from 'three'
import { BufferAttribute } from 'three'
import { UVUnwrapper } from 'xatlas-three'

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

export const loadXAtlasThree = async (
  wasmUrl = DEFAULT_WASM_URL,
  jsUrl = DEFAULT_JS_URL,
) => {
  const onProgress = (mode: number, progress: number) => {
    console.log(`🗺️ XAtlas ${ProgressCategory[mode]} ${progress}%`)
  }
  await unwrapper.loadLibrary(onProgress, wasmUrl, jsUrl)

  console.log('Loaded')
}

export const generateAtlas = async (meshs: Mesh[]) => {
  const geometry = meshs.map((mesh) => mesh.geometry)

  // We can pass in options to the unwrapper
  // unwrapper.packOptions.padding = 1;

  // Write the shared UVs the uv2 attribute
  await unwrapper.packAtlas(geometry, 'uv2', 'uv')
}
