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
import {
  computeGroupResolutions,
  splitMeshGroups,
} from '../utils/MeshGroupUtils'
import { prepareScene } from '../utils/SceneUtils'

/** Options for the headless bake pipeline. */
export type BakeOptions = {
  modelUrl: string
  resolution: number
  casts: number
  samples: number
  filterMode?: TextureFilter
  pointLights: LightDef[]
  ambientDistance: number
  nDotLStrength: number
  directLightEnabled: boolean
  indirectLightEnabled: boolean
  ambientLightEnabled: boolean
  bounceEnabled: boolean
  albedoEnabled: boolean
  atlasGroups?: number
  denoise?: Partial<DenoiserOptions>
  onProgress?: (sample: number, total: number) => void
}

export const defaultBakeOptions: Omit<BakeOptions, 'modelUrl'> = {
  resolution: 1024,
  casts: 1,
  samples: CONFIG.samples,
  filterMode: LinearFilter,
  pointLights: [
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
  atlasGroups: 1,
  denoise: { enabled: true },
}

/** Bake result for a single atlas group. */
export type BakeGroupResult = {
  meshes: Mesh[]
  pixels: Uint8Array
  resolution: number
  renderTarget: WebGLRenderTarget
}

/** Result of a bake: grouped lightmaps, scene, and all meshes. */
export type BakeResult = {
  groups: BakeGroupResult[]
  gltfScene: Object3D
  meshes: Mesh[]
}

/**
 * Bakes a lightmap for a GLB model: loads, UV-unwraps, renders atlas, builds BVH,
 * accumulates samples, optionally denoises, and returns RGBA pixels.
 *
 * When `atlasGroups > 1`, meshes are split into groups by surface area for
 * higher texel density. Bounce is automatically disabled in multi-atlas mode.
 *
 * @param renderer - WebGL renderer (preserveDrawingBuffer recommended for readPixels)
 * @param options - Bake configuration
 * @returns BakeResult with per-group pixels, scene, meshes, and render targets
 * @throws If no meshes found in the model
 */
export async function bakeLightmap(
  renderer: WebGLRenderer,
  options: BakeOptions,
): Promise<BakeResult> {
  const { resolution, samples } = options
  const atlasGroups = options.atlasGroups ?? 1

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

  const { scaleFactor } = prepareScene(gltf.scene)

  const meshGroups = splitMeshGroups(meshes, atlasGroups)
  const isMultiAtlas = meshGroups.length > 1
  const groupResolutions = computeGroupResolutions(
    meshGroups,
    resolution,
    atlasGroups,
  )

  if (CONFIG.debug) {
    console.log(
      `[bake] ${meshes.length} meshes → ${meshGroups.length} group(s)`,
    )
  }

  for (const group of meshGroups) {
    await generateAtlas(group.meshes)
  }
  if (CONFIG.debug) {
    console.log('[bake] Atlas UV1 generated')
  }

  const mergedGeometry = mergeGeometry(meshes)
  const bvh = new MeshBVH(mergedGeometry)

  if (CONFIG.debug) {
    console.log('[bake] BVH built')
  }

  const s = scaleFactor
  const scaledLights = options.pointLights.map((l) => ({
    ...l,
    size: l.size * s,
    distance: l.distance * s,
  }))

  const bounceEnabled = options.bounceEnabled && !isMultiAtlas
  if (isMultiAtlas && options.bounceEnabled && CONFIG.debug) {
    console.warn(
      '[bake] Bounce disabled in multi-atlas mode (cross-group lookup unsupported)',
    )
  }

  const lightmappers = meshGroups.map((group, gi) => {
    const res = groupResolutions[gi]
    const atlas = renderAtlas(renderer, group.meshes, res, true)
    return {
      meshes: group.meshes,
      resolution: res,
      lightmapper: generateLightmapper(
        renderer,
        atlas.positionTexture,
        atlas.normalTexture,
        atlas.albedoTexture,
        bvh,
        {
          resolution: res,
          casts: options.casts,
          filterMode: options.filterMode ?? LinearFilter,
          pointLights: scaledLights,
          ambientDistance: options.ambientDistance * s,
          nDotLStrength: options.nDotLStrength,
          ambientLightEnabled: options.ambientLightEnabled,
          directLightEnabled: options.directLightEnabled,
          indirectLightEnabled: options.indirectLightEnabled,
          bounceEnabled,
          albedoEnabled: options.albedoEnabled,
          rayEpsilon: 0.001 * s,
        },
      ),
    }
  })

  if (CONFIG.debug) {
    console.log(`[bake] Rendering ${samples} samples...`)
  }

  for (let i = 0; i < samples; i++) {
    for (const { lightmapper } of lightmappers) {
      lightmapper.render()
    }
    options.onProgress?.(i + 1, samples)
  }

  if (CONFIG.debug) {
    console.log('[bake] Rendering complete')
  }

  if (options.denoise?.enabled !== false) {
    for (const { lightmapper } of lightmappers) {
      lightmapper.denoise({ enabled: true, ...options.denoise })
    }
    if (CONFIG.debug) {
      console.log('[bake] Denoised')
    }
  }

  const groups: BakeGroupResult[] = lightmappers.map(
    ({ meshes: groupMeshes, lightmapper, resolution: res }, gi) => {
      const rt = lightmapper.renderTexture
      const pixels = new Float32Array(res * res * 4)

      renderer.readRenderTargetPixels(rt, 0, 0, res, res, pixels)

      if (CONFIG.debug) {
        let min = Infinity
        let max = -Infinity
        let nonZero = 0
        for (let i = 0; i < pixels.length; i++) {
          const v = pixels[i]
          if (v < min) min = v
          if (v > max) max = v
          if (v > 0) nonZero++
        }
        const prefix = isMultiAtlas ? `[bake] Group ${gi}` : '[bake]'
        console.log(`${prefix} (${res}×${res}) Pixels debug:`, {
          min,
          max,
          nonZero,
          total: pixels.length,
        })
      }

      const output = new Uint8Array(res * res * 4)
      for (let i = 0; i < pixels.length; i++) {
        output[i] = Math.max(0, Math.min(255, Math.round(pixels[i] * 255)))
      }

      return {
        meshes: groupMeshes,
        pixels: output,
        resolution: res,
        renderTarget: rt,
      }
    },
  )

  return {
    groups,
    gltfScene: gltf.scene,
    meshes,
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
