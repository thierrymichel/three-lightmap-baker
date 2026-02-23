import {
  Color,
  LinearFilter,
  NearestFilter,
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
    __bakeError: string | null
  }
}

window.__bakeComplete = false
window.__bakeResult = ''
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

  const pixels = await bakeLightmap(renderer, {
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
    denoise: defaultBakeOptions.denoise,
    onProgress: (sample, total) => {
      if (sample % 10 === 0 || sample === total) {
        console.log(`[bake-entry] Sample ${sample}/${total}`)
      }
    },
  })

  window.__bakeResult = pixelsToDataURL(
    pixels,
    config.resolution,
    config.resolution,
  )
  window.__bakeComplete = true
  console.log('[bake-entry] Done')

  renderer.dispose()
}

main().catch((err) => {
  console.error('[bake-entry] Error:', err)
  window.__bakeError = String(err)
  window.__bakeComplete = true
})
