import { loadXAtlasThree } from './atlas/generateAtlas'
import { LightBakerExample } from './LightBakerExample'
import { LoadTexture } from './utils/LoaderUtils'

;(async () => {
  await loadXAtlasThree()
  const uvDebugTexture = await LoadTexture('uv_map.jpg')

  const app = new LightBakerExample(uvDebugTexture)
  window.addEventListener('resize', () => {
    app.updateSize()
  })
})()
