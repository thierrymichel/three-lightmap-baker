import type {
  Color,
  Texture,
  TextureFilter,
  Vector3,
  WebGLRenderer,
} from 'three'
import {
  FloatType,
  LinearFilter,
  LinearMipMapLinearFilter,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  WebGLRenderTarget,
} from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import { LightmapperMaterial } from './LightmapperMaterial'

export type LightDef = {
  position: Vector3
  size: number
  intensity: number
  color: Color
  distance: number
}

export type RaycastOptions = {
  resolution: number
  casts: number
  lights: LightDef[]
  filterMode: TextureFilter

  directLightEnabled: boolean
  indirectLightEnabled: boolean
  ambientLightEnabled: boolean
  ambientDistance: number
  nDotLStrength: number
}

export type Lightmapper = {
  renderTexture: WebGLRenderTarget
  render: () => number
}

export const generateLightmapper = (
  renderer: WebGLRenderer,
  positions: Texture,
  normals: Texture,
  bvh: MeshBVH,
  options: RaycastOptions,
): Lightmapper => {
  const raycastMaterial = new LightmapperMaterial({
    bvh,
    invModelMatrix: new Matrix4().identity(),
    positions,
    normals,
    casts: options.casts,
    lights: options.lights,
    sampleIndex: 0,
    directLightEnabled: options.directLightEnabled,
    indirectLightEnabled: options.indirectLightEnabled,
    ambientLightEnabled: options.ambientLightEnabled,
    ambientDistance: options.ambientDistance,
    nDotLStrength: options.nDotLStrength,
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

  for (const rt of [rtA, rtB]) {
    renderer.setRenderTarget(rt)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
  }

  const raycastMesh = new Mesh(new PlaneGeometry(2, 2), raycastMaterial)
  const orthographicCamera = new OrthographicCamera()

  let totalSamples = 0
  let readTarget = rtA
  let writeTarget = rtB

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

    return totalSamples
  }

  renderer.setRenderTarget(null)

  return {
    get renderTexture() {
      return readTarget
    },
    render,
  }
}
