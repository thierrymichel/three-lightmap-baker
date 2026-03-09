import type { TextureFilter, WebGLRenderer, WebGLRenderTarget } from 'three'
import { Color, LinearFilter, type Mesh, type Object3D, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { generateAtlas } from '../atlas/generateAtlas'
import { renderAtlas } from '../atlas/renderAtlas'
import { CONFIG } from '../CONFIG'
import type { DenoiserOptions } from '../lightmap/LightmapDenoiser'
import type { LightDef } from '../lightmap/Lightmapper'
import { generateLightmapper } from '../lightmap/Lightmapper'
import { mergeGeometry } from '../utils/GeometryUtils'
import { LoadGLTF } from '../utils/LoaderUtils'

/** Options for the headless bake pipeline. */
export type BakeOptions = {
  modelUrl: string
  resolution: number
  casts: number
  samples: number
  filterMode?: TextureFilter
  lights: LightDef[]
  ambientDistance: number
  nDotLStrength: number
  directLightEnabled: boolean
  indirectLightEnabled: boolean
  ambientLightEnabled: boolean
  bounceEnabled: boolean
  albedoEnabled: boolean
  denoise?: Partial<DenoiserOptions>
  onProgress?: (sample: number, total: number) => void
}

export const defaultBakeOptions: Omit<BakeOptions, 'modelUrl'> = {
  resolution: 1024,
  casts: 1,
  samples: CONFIG.samples.nb,
  filterMode: LinearFilter,
  lights: [
    {
      position: new Vector3(25.0, 30.0, 2.0),
      size: 3,
      intensity: 0.5,
      color: new Color(0xffffff),
      distance: 60,
    },
    {
      position: new Vector3(-5.0, 30.0, -10.0),
      size: 3,
      intensity: 1.0,
      color: new Color(0xffffff),
      distance: 60,
    },
  ],
  ambientDistance: 0.3,
  nDotLStrength: 0.5,
  directLightEnabled: true,
  indirectLightEnabled: true,
  ambientLightEnabled: true,
  bounceEnabled: true,
  albedoEnabled: true,
  denoise: { enabled: true },
}

/** Result of a bake: RGBA pixels, scene, meshes, and the lightmap render target. */
export type BakeResult = {
  pixels: Uint8Array
  gltfScene: Object3D
  meshes: Mesh[]
  renderTarget: WebGLRenderTarget
}

/**
 * Bakes a lightmap for a GLB model: loads, UV-unwraps, renders atlas, builds BVH,
 * accumulates samples, optionally denoises, and returns RGBA pixels.
 *
 * @param renderer - WebGL renderer (preserveDrawingBuffer recommended for readPixels)
 * @param options - Bake configuration
 * @returns BakeResult with pixels, scene, meshes, and render target
 * @throws If no meshes found in the model
 */
export async function bakeLightmap(
  renderer: WebGLRenderer,
  options: BakeOptions,
): Promise<BakeResult> {
  const { resolution, samples } = options

  const gltf = await LoadGLTF(options.modelUrl)
  const meshes: Mesh[] = []
  gltf.scene.traverse((child) => {
    if ((child as Mesh).isMesh) {
      meshes.push(child as Mesh)
    }
  })

  if (meshes.length === 0) {
    throw new Error(`No meshes found in ${options.modelUrl}`)
  }

  if (CONFIG.debug) {
    console.log(`[bake] ${meshes.length} meshes loaded`)
  }

  await generateAtlas(meshes)
  if (CONFIG.debug) {
    console.log('[bake] Atlas UV2 generated')
  }

  const atlas = renderAtlas(renderer, meshes, resolution, true)
  if (CONFIG.debug) {
    console.log('[bake] Position/normal textures rendered')
  }

  const mergedGeometry = mergeGeometry(meshes)
  const bvh = new MeshBVH(mergedGeometry)

  if (CONFIG.debug) {
    console.log('[bake] BVH built')
  }

  const lightmapper = generateLightmapper(
    renderer,
    atlas.positionTexture,
    atlas.normalTexture,
    atlas.albedoTexture,
    bvh,
    {
      resolution,
      casts: options.casts,
      filterMode: options.filterMode ?? LinearFilter,
      lights: options.lights,
      ambientDistance: options.ambientDistance,
      nDotLStrength: options.nDotLStrength,
      ambientLightEnabled: options.ambientLightEnabled,
      directLightEnabled: options.directLightEnabled,
      indirectLightEnabled: options.indirectLightEnabled,
      bounceEnabled: options.bounceEnabled,
      albedoEnabled: options.albedoEnabled,
    },
  )

  if (CONFIG.debug) {
    console.log(`[bake] Rendering ${samples} samples...`)
  }

  for (let i = 0; i < samples; i++) {
    lightmapper.render()
    options.onProgress?.(i + 1, samples)
  }

  if (CONFIG.debug) {
    console.log('[bake] Rendering complete')
  }

  if (options.denoise?.enabled !== false) {
    lightmapper.denoise({ enabled: true, ...options.denoise })
    if (CONFIG.debug) {
      console.log('[bake] Denoised')
    }
  }

  const rt = lightmapper.renderTexture
  const pixels = new Float32Array(resolution * resolution * 4)

  if (CONFIG.debug) {
    console.log('[bake] Reading pixels')
    console.time('[bake] Reading pixels')
  }

  renderer.readRenderTargetPixels(rt, 0, 0, resolution, resolution, pixels)

  if (CONFIG.debug) {
    console.timeEnd('[bake] Reading pixels')
  }

  if (CONFIG.debug) {
    let min = Infinity,
      max = -Infinity,
      nonZero = 0
    for (let i = 0; i < pixels.length; i++) {
      const v = pixels[i]
      if (v < min) min = v
      if (v > max) max = v
      if (v > 0) nonZero++
    }
    console.log('[bake] Pixels debug:', {
      min,
      max,
      nonZero,
      total: pixels.length,
    })

    const buckets = [0, 0, 0, 0, 0] // 0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1
    for (let i = 0; i < pixels.length; i += 4) {
      const v = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
      const b = Math.min(4, Math.floor(v * 5))
      buckets[b]++
    }
    console.log('[bake] Value distribution:', buckets)
  }

  const output = new Uint8Array(resolution * resolution * 4)

  if (CONFIG.debug) {
    console.log('[bake] Converting to Uint8Array')
  }

  for (let i = 0; i < pixels.length; i++) {
    output[i] = Math.max(0, Math.min(255, Math.round(pixels[i] * 255)))
  }

  return {
    pixels: output,
    gltfScene: gltf.scene,
    meshes,
    renderTarget: rt,
  }
}

/**
 * Converts RGBA pixels to a PNG data URL.
 *
 * @param pixels - Uint8Array RGBA (width * height * 4)
 * @param width - Image width
 * @param height - Image height
 * @returns data:image/png;base64,... URL
 */
export function pixelsToDataURL(
  pixels: Uint8Array,
  width: number,
  height: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2d context')
  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height)
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}
