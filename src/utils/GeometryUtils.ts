import { Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Merges mesh geometries into a single BufferGeometry for BVH construction.
 * Applies world matrix, removes unused attributes (color).
 *
 * @param meshes - Meshes with uv1 (from generateAtlas)
 * @returns Merged BufferGeometry
 */
export const mergeGeometry = (meshes: Mesh[]) => {
  return mergeGeometries(
    meshes.map((mesh) => {
      const lightmapMesh = new Mesh(mesh.geometry.clone(), mesh.material)

      // Attributs non utilisés par le pipeline (position, normal, uv, uv2)
      lightmapMesh.geometry.deleteAttribute('color')
      lightmapMesh.geometry.deleteAttribute('color_1')
      lightmapMesh.geometry.deleteAttribute('uv1')
      lightmapMesh.geometry.applyMatrix4(mesh.matrixWorld)

      return lightmapMesh.geometry
    }),
  )
}
