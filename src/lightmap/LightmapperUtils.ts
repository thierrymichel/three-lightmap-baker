import { CONFIG } from '../CONFIG'
import type { Lightmapper } from './Lightmapper'

/**
 * Renders a fixed number of lightmap samples via requestAnimationFrame.
 * Useful for UI-driven bake with progress feedback.
 *
 * @param lightmapper - The lightmapper instance
 * @param samples - Number of samples to render (default: CONFIG.samples)
 * @param onProgress - Callback with progress 0..1
 */
export const renderSampleCount = async (
  lightmapper: Lightmapper,
  samples: number = CONFIG.samples,
  onProgress?: (progress: number) => void,
) => {
  return new Promise<void>((resolve) => {
    let sampleIndex = 0

    const sample = () => {
      lightmapper.render()

      sampleIndex++

      onProgress?.(sampleIndex / samples)

      if (sampleIndex < samples) {
        requestAnimationFrame(sample)
      } else {
        resolve()
      }
    }

    sample()
  })
}

/**
 * Renders lightmap samples for a given duration (ms).
 * Useful for time-based bake (e.g. "render for 2 seconds").
 *
 * @param lightmapper - The lightmapper instance
 * @param time - Duration in milliseconds (default: 1000)
 * @param onProgress - Callback with progress 0..1
 */
export const renderTime = async (
  lightmapper: Lightmapper,
  time: number = 1000,
  onProgress?: (progress: number) => void,
) => {
  return new Promise<void>((resolve) => {
    const startTime = Date.now()

    const sample = () => {
      lightmapper.render()

      onProgress?.((Date.now() - startTime) / time)

      if (Date.now() - startTime < time) {
        requestAnimationFrame(sample)
      } else {
        resolve()
      }
    }

    sample()
  })
}
