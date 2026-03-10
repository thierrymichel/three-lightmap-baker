import type { Material, Mesh } from 'three'
import { Vector3 } from 'three'
import { CONFIG } from '../CONFIG'

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _cb = new Vector3()
const _ab = new Vector3()

/**
 * Computes the total surface area of a mesh's triangles in world space.
 */
function computeSurfaceArea(mesh: Mesh): number {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  const index = geo.index

  let area = 0
  const triCount = index ? index.count / 3 : pos.count / 3

  for (let i = 0; i < triCount; i++) {
    const i0 = index ? index.getX(i * 3) : i * 3
    const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1
    const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2

    _a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld)
    _b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld)
    _c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld)

    _cb.subVectors(_c, _b)
    _ab.subVectors(_a, _b)
    area += _cb.cross(_ab).length() * 0.5
  }

  return area
}

type MaterialBlock = {
  material: Material
  meshes: Mesh[]
  totalArea: number
}

/**
 * Groups meshes by shared Material instance into atomic blocks,
 * then bin-packs those blocks into N groups by cumulative surface area.
 *
 * Meshes sharing the same material are never split across groups,
 * preventing lightmap assignment conflicts on shared materials.
 *
 * @param meshes - All scene meshes (matrixWorld must be up-to-date)
 * @param numGroups - Target number of groups (1 = no split)
 * @returns Array of mesh arrays, one per group
 */
export function splitMeshGroups(meshes: Mesh[], numGroups: number): Mesh[][] {
  if (numGroups <= 1 || meshes.length <= 1) return [meshes]

  const blockMap = new Map<Material, MaterialBlock>()
  for (const mesh of meshes) {
    const mat = mesh.material as Material
    let block = blockMap.get(mat)
    if (!block) {
      block = { material: mat, meshes: [], totalArea: 0 }
      blockMap.set(mat, block)
    }
    block.meshes.push(mesh)
    block.totalArea += computeSurfaceArea(mesh)
  }

  const blocks = [...blockMap.values()]
  blocks.sort((a, b) => b.totalArea - a.totalArea)

  const effectiveGroups = Math.min(numGroups, blocks.length)

  if (CONFIG.debug) {
    console.log(
      `[split] ${meshes.length} meshes → ${blocks.length} material blocks → ${effectiveGroups} groups`,
    )
  }

  const groups: { meshes: Mesh[]; totalArea: number }[] = Array.from(
    { length: effectiveGroups },
    () => ({ meshes: [], totalArea: 0 }),
  )

  for (const block of blocks) {
    const lightest = groups.reduce((a, b) =>
      a.totalArea <= b.totalArea ? a : b,
    )
    lightest.meshes.push(...block.meshes)
    lightest.totalArea += block.totalArea
  }

  return groups.filter((g) => g.meshes.length > 0).map((g) => g.meshes)
}
