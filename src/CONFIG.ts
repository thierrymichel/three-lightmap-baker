/** Global configuration for the demo and bake pipeline. */
export const CONFIG = {
  /** Default model for the interactive demo. */
  model: 'dressing.glb',
  /** Default render mode: 'standard' | 'positions' | 'normals' | 'uv' | 'lightmap' | 'beauty'. */
  renderMode: 'beauty',
  /** Lightmap resolution (demo). */
  lightMapSize: 2048,
  /** Max point lights (GLSL array size). */
  maxLights: 4,
  samples: {
    /** Number of samples for headless bake. */
    nb: 64,
    /** Auto-pause timeout (ms) in demo. */
    timeout: 1000,
  },
  /** When true, enables console logs and debug blocks (attributs, pixels stats, etc.) */
  debug: true,
}
