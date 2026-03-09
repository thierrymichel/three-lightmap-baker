import type { Mesh, MeshStandardMaterial, Texture, WebGLRenderer } from 'three'
import {
  DataTexture,
  DoubleSide,
  FloatType,
  NearestFilter,
  Object3D,
  OrthographicCamera,
  RGBAFormat,
  ShaderMaterial,
  Uniform,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
} from 'three'

const worldPositionVertexShader = `
    uniform vec2 offset;
    attribute vec2 uv2;
    varying vec4 vWorldPosition;

    void main() {
        vWorldPosition = modelMatrix * vec4(position, 1.0) ;

        gl_Position = vec4((uv2 + offset) * 2.0 - 1.0, 0.0, 1.0);
    }
`

const worldPositionFragmentShader = `
    varying vec4 vWorldPosition;

    void main() {
        gl_FragColor = vWorldPosition;
    }
`

const worldPositionMaterial = new ShaderMaterial({
  vertexShader: worldPositionVertexShader,
  fragmentShader: worldPositionFragmentShader,
  side: DoubleSide,
  fog: false,
  uniforms: {
    offset: new Uniform(new Vector2(0, 0)),
  },
})

const normalVertexShader = `
    varying vec4 vNormal;
    attribute vec2 uv2;
    uniform vec2 offset;

    void main() {
        vNormal = modelMatrix * vec4(normal, 0.0);

        gl_Position = vec4((uv2 + offset) * 2.0 - 1.0, 0.0, 1.0);
    }
`

const normalFragmentShader = `
    varying vec4 vWorldPosition;
    varying vec4 vNormal;

    void main() {
        vec3 n = vNormal.xyz;
        float len = length(n);

        gl_FragColor = len > 0.001
          ? vec4(normalize(n), 1.0)
          : vec4(0.0, 1.0, 0.0, 1.0);
    }
`

const normalMaterial = new ShaderMaterial({
  vertexShader: normalVertexShader,
  fragmentShader: normalFragmentShader,
  side: DoubleSide,
  fog: false,
  uniforms: {
    offset: new Uniform(new Vector2(0, 0)),
  },
})

const albedoVertexShader = `
    attribute vec2 uv2;
    uniform vec2 offset;
    varying vec2 vOriginalUv;

    void main() {
        vOriginalUv = uv;
        gl_Position = vec4((uv2 + offset) * 2.0 - 1.0, 0.0, 1.0);
    }
`

const albedoFragmentShader = `
    uniform sampler2D map;
    varying vec2 vOriginalUv;

    void main() {
        gl_FragColor = texture2D(map, vOriginalUv);
    }
`

const whiteTexture = new DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
  RGBAFormat,
  UnsignedByteType,
)
whiteTexture.needsUpdate = true

const offsets = [
  { x: -2, y: -2 },
  { x: 2, y: -2 },
  { x: -2, y: 2 },
  { x: 2, y: 2 },

  { x: -1, y: -2 },
  { x: 1, y: -2 },
  { x: -2, y: -1 },
  { x: 2, y: -1 },
  { x: -2, y: 1 },
  { x: 2, y: 1 },
  { x: -1, y: 2 },
  { x: 1, y: 2 },

  { x: -2, y: 0 },
  { x: 2, y: 0 },
  { x: 0, y: -2 },
  { x: 0, y: 2 },

  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },

  { x: 0, y: 0 },
]

/**
 * Renders position, normal, and albedo textures in UV2 atlas space.
 * Optionally dilates texels to reduce seam bleeding.
 *
 * @param renderer - WebGL renderer
 * @param meshes - Meshes with uv2 attribute (from generateAtlas)
 * @param resolution - Atlas texture size (e.g. 1024)
 * @param dilate - Whether to dilate texels (default: true)
 * @returns { positionTexture, normalTexture, albedoTexture }
 */
export const renderAtlas = (
  renderer: WebGLRenderer,
  meshes: Mesh[],
  resolution: number,
  dilate: boolean = true,
) => {
  const renderWithShader = (material: ShaderMaterial): Texture => {
    const target = new WebGLRenderTarget(resolution, resolution, {
      type: FloatType,
      magFilter: NearestFilter,
      minFilter: NearestFilter,
    })
    // Create orthographic camera with large clip area to prevent clipping the geometry
    // I'm don't know a better way to do this :(
    const orthographicCamera = new OrthographicCamera(
      -100,
      100,
      -100,
      100,
      -100,
      200,
    )
    orthographicCamera.updateMatrix()

    // Re-create objects with util material - Maybe we could just change the material on the fly?
    const lightMapMeshes = new Object3D()
    lightMapMeshes.matrixWorldAutoUpdate = false

    for (const mesh of meshes) {
      const lightMapMesh = mesh.clone()
      lightMapMesh.material = material
      lightMapMeshes.add(lightMapMesh)
    }

    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(target)
    renderer.setClearColor(0, 0)
    renderer.clear()

    if (dilate) {
      for (const offset of offsets) {
        material.uniforms.offset.value.x = offset.x * (1 / resolution)
        material.uniforms.offset.value.y = offset.y * (1 / resolution)
        renderer.render(lightMapMeshes, orthographicCamera)
      }
    }

    material.uniforms.offset.value.x = 0
    material.uniforms.offset.value.y = 0
    renderer.render(lightMapMeshes, orthographicCamera)

    renderer.setRenderTarget(null)
    renderer.autoClear = prevAutoClear

    return target.texture
  }

  const renderAlbedoAtlas = (): Texture => {
    const target = new WebGLRenderTarget(resolution, resolution, {
      type: FloatType,
      magFilter: NearestFilter,
      minFilter: NearestFilter,
    })
    const orthographicCamera = new OrthographicCamera(
      -100,
      100,
      -100,
      100,
      -100,
      200,
    )
    orthographicCamera.updateMatrix()

    const sharedOffset = new Vector2(0, 0)
    const albedoMeshes = new Object3D()
    albedoMeshes.matrixWorldAutoUpdate = false

    for (const mesh of meshes) {
      const albedoMesh = mesh.clone()
      const originalMap =
        (mesh.material as MeshStandardMaterial).map ?? whiteTexture
      albedoMesh.material = new ShaderMaterial({
        vertexShader: albedoVertexShader,
        fragmentShader: albedoFragmentShader,
        side: DoubleSide,
        fog: false,
        uniforms: {
          offset: { value: sharedOffset },
          map: { value: originalMap },
        },
      })
      albedoMeshes.add(albedoMesh)
    }

    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(target)
    renderer.setClearColor(0, 0)
    renderer.clear()

    if (dilate) {
      for (const offset of offsets) {
        sharedOffset.x = offset.x * (1 / resolution)
        sharedOffset.y = offset.y * (1 / resolution)
        renderer.render(albedoMeshes, orthographicCamera)
      }
    }

    sharedOffset.x = 0
    sharedOffset.y = 0
    renderer.render(albedoMeshes, orthographicCamera)

    renderer.setRenderTarget(null)
    renderer.autoClear = prevAutoClear

    return target.texture
  }

  const positionTexture = renderWithShader(worldPositionMaterial)
  const normalTexture = renderWithShader(normalMaterial)
  const albedoTexture = renderAlbedoAtlas()

  return {
    positionTexture,
    normalTexture,
    albedoTexture,
  }
}
