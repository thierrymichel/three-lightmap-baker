import {
  Box3,
  Color,
  LinearFilter,
  NearestFilter,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { loadXAtlasThree } from '../atlas/generateAtlas'
import type { LightDef } from '../lightmap/Lightmapper'
import {
  bakeLightmap,
  defaultBakeOptions,
  pixelsToDataURL,
} from './bakeLightmap'

declare global {
  interface Window {
    __bakeComplete: boolean
    __bakeResult: string
    __bakeRender: string
    __bakeError: string | null
  }
}

window.__bakeComplete = false
window.__bakeResult = ''
window.__bakeRender = ''
window.__bakeError = null

function parseParams(): {
  input: string
  resolution: number
  samples: number
  casts: number
  filterMode: 'linear' | 'nearest'
  lights: LightDef[]
} {
  const params = new URLSearchParams(location.search)

  const input = params.get('input')
  if (!input) throw new Error('Missing required "input" URL param')

  let lights: LightDef[] = defaultBakeOptions.lights
  const lightsParam = params.get('lights')
  if (lightsParam) {
    const parsed = JSON.parse(lightsParam)
    lights = parsed.map(
      (l: {
        position: number[]
        size: number
        intensity: number
        color: string
        distance: number
      }) => ({
        position: new Vector3(...l.position),
        size: l.size,
        intensity: l.intensity,
        color: new Color(l.color),
        distance: l.distance,
      }),
    )
  }

  return {
    input,
    resolution: Number(
      params.get('resolution') ?? defaultBakeOptions.resolution,
    ),
    samples: Number(params.get('samples') ?? defaultBakeOptions.samples),
    casts: Number(params.get('casts') ?? defaultBakeOptions.casts),
    filterMode: (params.get('filterMode') as 'linear' | 'nearest') ?? 'linear',
    lights,
  }
}

async function main() {
  const config = parseParams()

  console.log(
    '[bake-entry] Config:',
    JSON.stringify({ ...config, lights: `${config.lights.length} light(s)` }),
  )

  await loadXAtlasThree()

  const renderer = new WebGLRenderer({ preserveDrawingBuffer: true })
  renderer.setSize(config.resolution, config.resolution)

  console.time('[bake-entry] bakeLightmap')
  const result = await bakeLightmap(renderer, {
    modelUrl: config.input,
    resolution: config.resolution,
    casts: config.casts,
    samples: config.samples,
    filterMode: config.filterMode === 'nearest' ? NearestFilter : LinearFilter,
    lights: config.lights,
    ambientDistance: defaultBakeOptions.ambientDistance,
    nDotLStrength: defaultBakeOptions.nDotLStrength,
    directLightEnabled: defaultBakeOptions.directLightEnabled,
    indirectLightEnabled: defaultBakeOptions.indirectLightEnabled,
    ambientLightEnabled: defaultBakeOptions.ambientLightEnabled,
    bounceEnabled: defaultBakeOptions.bounceEnabled,
    albedoEnabled: defaultBakeOptions.albedoEnabled,
    denoise: defaultBakeOptions.denoise,
    onProgress: (sample, total) => {
      if (sample % 10 === 0 || sample === total) {
        console.log(`[bake-entry] Sample ${sample}/${total}`)
      }
    },
  })
  console.timeEnd('[bake-entry] bakeLightmap')

  window.__bakeResult = pixelsToDataURL(
    result.pixels,
    config.resolution,
    config.resolution,
  )

  // Beauty render
  const renderWidth = 1920
  const renderHeight = 1080
  renderer.setSize(renderWidth, renderHeight)
  renderer.outputColorSpace = SRGBColorSpace

  const scene = new Scene()
  scene.background = new Color(0x74b9ff)
  scene.add(result.gltfScene)

  for (const mesh of result.meshes) {
    // biome-ignore lint/suspicious/noExplicitAny: apply lightmap to materials
    const mat = mesh.material as any
    mat.lightMap = result.renderTarget.texture
    mat.lightMap.channel = 2
    mat.lightMapIntensity = 1
    mat.needsUpdate = true
  }

  const box = new Box3().setFromObject(result.gltfScene)
  const center = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = 75
  const dist = maxDim / (2 * Math.tan((fov * Math.PI) / 360))

  const camera = new PerspectiveCamera(
    fov,
    renderWidth / renderHeight,
    0.1,
    dist * 10,
  )
  camera.position.set(
    center.x + dist * 0.2,
    center.y + dist * 0.25,
    center.z + dist * 0.25,
  )
  camera.lookAt(new Vector3(center.x, center.y + 0.3, center.z))

  renderer.render(scene, camera)
  window.__bakeRender = renderer.domElement.toDataURL('image/png')
  console.log('[bake-entry] Render captured')

  window.__bakeComplete = true
  console.log('[bake-entry] Done')

  renderer.dispose()
}

main().catch((err) => {
  console.error('[bake-entry] Error:', err)
  window.__bakeError = String(err)
  window.__bakeComplete = true
})
