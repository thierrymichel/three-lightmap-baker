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

export type MeshGroup = {
  meshes: Mesh[]
  area: number
}

const RESOLUTION_STEP = 128
const MIN_RESOLUTION = 256
const MAX_RESOLUTION = 4096

function roundToStep(value: number): number {
  return Math.round(value / RESOLUTION_STEP) * RESOLUTION_STEP
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
 * @returns Array of mesh groups with per-group surface area
 */
export function splitMeshGroups(
  meshes: Mesh[],
  numGroups: number,
): MeshGroup[] {
  if (numGroups <= 1 || meshes.length <= 1) {
    const area = meshes.reduce((sum, m) => sum + computeSurfaceArea(m), 0)
    return [{ meshes, area }]
  }

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

  const result = groups
    .filter((g) => g.meshes.length > 0)
    .map((g) => ({ meshes: g.meshes, area: g.totalArea }))

  if (CONFIG.debug) {
    console.log(
      `[split] ${meshes.length} meshes → ${blocks.length} material blocks → ${result.length} groups`,
    )
  }

  return result
}

/**
 * Computes per-group texture resolutions for uniform texel density.
 *
 * Uses a pixel-area budget (baseResolution² × numGroups) distributed
 * proportionally to surface area, then takes sqrt to get resolution.
 * This ensures pixels_per_unit_area is constant across groups.
 *
 * Excess budget from groups clamped to MAX_RESOLUTION is iteratively
 * redistributed to unclamped groups until stable.
 *
 * @param groups - Mesh groups with surface area from splitMeshGroups
 * @param baseResolution - Base lightmap resolution (e.g. 2048)
 * @param numGroups - Number of atlas groups (for budget calculation)
 * @returns Per-group resolution array (same order as input)
 */
export function computeGroupResolutions(
  groups: MeshGroup[],
  baseResolution: number,
  numGroups: number,
): number[] {
  if (groups.length <= 1) return [baseResolution]

  const totalArea = groups.reduce((sum, g) => sum + g.area, 0)
  if (totalArea === 0) return groups.map(() => baseResolution)

  const totalPixelBudget = baseResolution * baseResolution * numGroups
  const resolutions = new Array<number>(groups.length).fill(0)
  const clamped = new Array<boolean>(groups.length).fill(false)

  let remainingBudget = totalPixelBudget
  let remainingArea = totalArea

  for (let iter = 0; iter < groups.length; iter++) {
    let changed = false

    for (let i = 0; i < groups.length; i++) {
      if (clamped[i]) continue

      const raw = Math.sqrt(remainingBudget * (groups[i].area / remainingArea))
      const rounded = roundToStep(raw)
      resolutions[i] = Math.max(
        MIN_RESOLUTION,
        Math.min(MAX_RESOLUTION, rounded),
      )

      if (resolutions[i] === MAX_RESOLUTION && raw > MAX_RESOLUTION) {
        clamped[i] = true
        remainingBudget -= MAX_RESOLUTION * MAX_RESOLUTION
        remainingArea -= groups[i].area
        changed = true
      } else if (resolutions[i] === MIN_RESOLUTION && raw < MIN_RESOLUTION) {
        clamped[i] = true
        remainingBudget -= MIN_RESOLUTION * MIN_RESOLUTION
        remainingArea -= groups[i].area
        changed = true
      }
    }

    if (!changed) break
  }

  if (CONFIG.debug) {
    const usedPixels = resolutions.reduce((s, r) => s + r * r, 0)
    console.log(
      `[split] Resolutions (pixel budget ${totalPixelBudget}, used ${usedPixels}):`,
      resolutions.map((r, i) => `group ${i}: ${r}`).join(', '),
    )
  }

  return resolutions
}
