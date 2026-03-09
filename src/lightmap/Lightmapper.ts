import type {
  Color,
  Texture,
  TextureFilter,
  Vector3,
  WebGLRenderer,
} from 'three'
import {
  type BufferAttribute,
  FloatType,
  LinearFilter,
  LinearMipMapLinearFilter,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  WebGLRenderTarget,
} from 'three'
import { FloatVertexAttributeTexture, type MeshBVH } from 'three-mesh-bvh'
import { CONFIG } from '../CONFIG'
import {
  type DenoiserOptions,
  defaultDenoiserOptions,
  denoiseLightmap,
} from './LightmapDenoiser'
import { LightmapperMaterial } from './LightmapperMaterial'

/** Point light definition for the lightmapper. */
export type LightDef = {
  position: Vector3
  size: number
  intensity: number
  color: Color
  distance: number
}

/** Options for the lightmapper raycast pass. */
export type RaycastOptions = {
  resolution: number
  casts: number
  pointLights: LightDef[]
  filterMode: TextureFilter

  directLightEnabled: boolean
  indirectLightEnabled: boolean
  ambientLightEnabled: boolean
  ambientDistance: number
  nDotLStrength: number
  bounceEnabled: boolean
  albedoEnabled: boolean
}

/** Lightmapper instance: render texture, render/denoise/reset methods. */
export type Lightmapper = {
  renderTexture: WebGLRenderTarget
  render: () => number
  denoise: (options?: Partial<DenoiserOptions>) => void
  reset: () => void
  denoiserOptions: DenoiserOptions
}

/**
 * Creates a lightmapper: fullscreen quad that raycasts via BVH per texel.
 * Uses ping-pong accumulation for progressive refinement.
 *
 * @param renderer - WebGL renderer
 * @param positions - World position atlas texture
 * @param normals - Normal atlas texture
 * @param albedo - Albedo atlas texture (for indirect bounce)
 * @param bvh - MeshBVH acceleration structure
 * @param options - Raycast options
 * @returns Lightmapper with render(), denoise(), renderTexture
 */
export const generateLightmapper = (
  renderer: WebGLRenderer,
  positions: Texture,
  normals: Texture,
  albedo: Texture,
  bvh: MeshBVH,
  options: RaycastOptions,
): Lightmapper => {
  const uv2Texture = new FloatVertexAttributeTexture()
  uv2Texture.updateFrom(bvh.geometry.attributes.uv2 as BufferAttribute)

  const raycastMaterial = new LightmapperMaterial({
    bvh,
    invModelMatrix: new Matrix4().identity(),
    positions,
    normals,
    casts: options.casts,
    pointLights: options.pointLights,
    sampleIndex: 0,
    directLightEnabled: options.directLightEnabled,
    indirectLightEnabled: options.indirectLightEnabled,
    ambientLightEnabled: options.ambientLightEnabled,
    ambientDistance: options.ambientDistance,
    nDotLStrength: options.nDotLStrength,
    bounceEnabled: options.bounceEnabled,
    albedoEnabled: options.albedoEnabled,
    uv2Attr: uv2Texture,
    albedoAtlas: albedo,
  })

  const rtOptions = {
    type: FloatType,
    minFilter: LinearMipMapLinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: true,
  }
  const rtA = new WebGLRenderTarget(
    options.resolution,
    options.resolution,
    rtOptions,
  )
  const rtB = new WebGLRenderTarget(
    options.resolution,
    options.resolution,
    rtOptions,
  )
  const rtDenoised = new WebGLRenderTarget(
    options.resolution,
    options.resolution,
    rtOptions,
  )

  for (const rt of [rtA, rtB, rtDenoised]) {
    renderer.setRenderTarget(rt)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
  }

  const raycastMesh = new Mesh(new PlaneGeometry(2, 2), raycastMaterial)
  const orthographicCamera = new OrthographicCamera()

  let totalSamples = 0
  let readTarget = rtA
  let writeTarget = rtB
  let isDenoised = false

  const denoiserOptions: DenoiserOptions = { ...defaultDenoiserOptions }

  const render = () => {
    raycastMaterial.uniforms.sampleIndex.value = totalSamples
    raycastMaterial.uniforms.previousFrame.value = readTarget.texture

    renderer.setRenderTarget(writeTarget)
    renderer.render(raycastMesh, orthographicCamera)
    renderer.setRenderTarget(null)

    const tmp = readTarget
    readTarget = writeTarget
    writeTarget = tmp

    totalSamples++
    isDenoised = false

    return totalSamples
  }

  const denoise = (overrides?: Partial<DenoiserOptions>) => {
    const opts = { ...denoiserOptions, ...overrides }
    if (!opts.enabled) {
      isDenoised = false
      return
    }

    denoiseLightmap(renderer, readTarget, rtDenoised, opts)
    isDenoised = true

    if (CONFIG.debug) {
      console.log('denoised')
    }
  }

  const reset = () => {
    totalSamples = 0
    isDenoised = false
    for (const rt of [rtA, rtB, rtDenoised]) {
      renderer.setRenderTarget(rt)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
    }
    renderer.setRenderTarget(null)
  }

  renderer.setRenderTarget(null)

  return {
    get renderTexture() {
      return isDenoised ? rtDenoised : readTarget
    },
    render,
    denoise,
    reset,
    denoiserOptions,
  }
}
