import type { Object3D } from 'three'
import { Box3, Vector3 } from 'three'
import { CONFIG } from '../CONFIG'

/**
 * Recenters a scene so that its bounding box is grounded (minY = 0) and
 * centered on the XZ plane (centerX = 0, centerZ = 0).
 * Returns the scale factor relative to {@link CONFIG.referenceDiagonal}.
 */
export function prepareScene(scene: Object3D): { scaleFactor: number } {
  scene.updateMatrixWorld(true)

  const box = new Box3().setFromObject(scene)
  const center = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  const diagonal = size.length()

  scene.position.x -= center.x
  scene.position.z -= center.z
  scene.position.y -= box.min.y

  scene.updateMatrixWorld(true)

  const scaleFactor = diagonal / CONFIG.referenceDiagonal

  if (CONFIG.debug) {
    console.log(
      `[prepareScene] size: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} | diagonal: ${diagonal.toFixed(1)} | scaleFactor: ${scaleFactor.toFixed(3)}`,
    )
  }

  return { scaleFactor }
}
