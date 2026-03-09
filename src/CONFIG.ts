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
  /** Number of samples (demo + headless bake). */
  samples: 24,
  /** Default point lights for the interactive demo. */
  pointLights: [
    { position: [5.0, 3.0, 2.0] as const, enabled: true, size: 3 },
    { position: [-5.0, 30.0, -10.0] as const, enabled: false, size: 3 },
  ],
  /** When true, enables console logs and debug blocks (attributs, pixels stats, etc.) */
  debug: true,
}
