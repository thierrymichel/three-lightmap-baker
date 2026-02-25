import type { TextureFilter, WebGLRenderer, WebGLRenderTarget } from 'three'
import { Color, LinearFilter, type Mesh, type Object3D, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { generateAtlas } from '../atlas/generateAtlas'
import { renderAtlas } from '../atlas/renderAtlas'
import type { DenoiserOptions } from '../lightmap/LightmapDenoiser'
import type { LightDef } from '../lightmap/Lightmapper'
import { generateLightmapper } from '../lightmap/Lightmapper'
import { mergeGeometry } from '../utils/GeometryUtils'
import { LoadGLTF } from '../utils/LoaderUtils'

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
  samples: 64,
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

export type BakeResult = {
  pixels: Uint8Array
  gltfScene: Object3D
  meshes: Mesh[]
  renderTarget: WebGLRenderTarget
}

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

  console.log(`[bake] ${meshes.length} meshes loaded`)

  await generateAtlas(meshes)
  console.log('[bake] Atlas UV2 generated')

  const atlas = renderAtlas(renderer, meshes, resolution, true)
  console.log('[bake] Position/normal textures rendered')

  const mergedGeometry = mergeGeometry(meshes)
  const bvh = new MeshBVH(mergedGeometry)
  console.log('[bake] BVH built')

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

  console.log(`[bake] Rendering ${samples} samples...`)
  for (let i = 0; i < samples; i++) {
    lightmapper.render()
    options.onProgress?.(i + 1, samples)
  }
  console.log('[bake] Rendering complete')

  if (options.denoise?.enabled !== false) {
    lightmapper.denoise({ enabled: true, ...options.denoise })
    console.log('[bake] Denoised')
  }

  const rt = lightmapper.renderTexture
  const pixels = new Float32Array(resolution * resolution * 4)
  console.log('[bake] Reading pixels')
  console.time('[bake] Reading pixels')
  renderer.readRenderTargetPixels(rt, 0, 0, resolution, resolution, pixels)
  console.timeEnd('[bake] Reading pixels')

  const output = new Uint8Array(resolution * resolution * 4)
  console.log('[bake] Converting to Uint8Array')
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
