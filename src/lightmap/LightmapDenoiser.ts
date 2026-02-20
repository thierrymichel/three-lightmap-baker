import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  ShaderMaterial,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'

export type DenoiserOptions = {
  enabled: boolean
  kernelRadius: number
  spatialSigma: number
  rangeSigma: number
}

export const defaultDenoiserOptions: DenoiserOptions = {
  enabled: true,
  kernelRadius: 2,
  spatialSigma: 2.0,
  rangeSigma: 0.1,
}

const bilateralFilterShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      gl_Position = vec4(position, 1.0);
      vUv = uv;
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tLightmap;
    uniform vec2 texelSize;
    uniform int kernelRadius;
    uniform float spatialSigma;
    uniform float rangeSigma;

    varying vec2 vUv;

    void main() {
      vec4 center = texture2D(tLightmap, vUv);

      // Skip empty texels (not covered by atlas)
      if (center.a == 0.0) discard;

      float spatialFactor = -0.5 / (spatialSigma * spatialSigma);
      float rangeFactor = -0.5 / (rangeSigma * rangeSigma);

      vec3 weightedSum = vec3(0.0);
      float totalWeight = 0.0;

      for (int y = -4; y <= 4; y++) {
        if (y < -kernelRadius || y > kernelRadius) continue;
        for (int x = -4; x <= 4; x++) {
          if (x < -kernelRadius || x > kernelRadius) continue;

          vec2 offset = vec2(float(x), float(y));
          vec2 sampleUv = vUv + offset * texelSize;
          vec4 sampleColor = texture2D(tLightmap, sampleUv);

          // Skip empty neighbor texels
          if (sampleColor.a == 0.0) continue;

          float spatialDist = dot(offset, offset);
          float spatialWeight = exp(spatialDist * spatialFactor);

          vec3 diff = sampleColor.rgb - center.rgb;
          float rangeDist = dot(diff, diff);
          float rangeWeight = exp(rangeDist * rangeFactor);

          float w = spatialWeight * rangeWeight;
          weightedSum += sampleColor.rgb * w;
          totalWeight += w;
        }
      }

      gl_FragColor = vec4(weightedSum / totalWeight, 1.0);
    }
  `,
}

export const denoiseLightmap = (
  renderer: WebGLRenderer,
  source: WebGLRenderTarget,
  destination: WebGLRenderTarget,
  options: DenoiserOptions,
) => {
  const material = new ShaderMaterial({
    uniforms: {
      tLightmap: { value: source.texture },
      texelSize: {
        value: [1.0 / source.width, 1.0 / source.height],
      },
      kernelRadius: { value: options.kernelRadius },
      spatialSigma: { value: options.spatialSigma },
      rangeSigma: { value: options.rangeSigma },
    },
    vertexShader: bilateralFilterShader.vertexShader,
    fragmentShader: bilateralFilterShader.fragmentShader,
  })

  const mesh = new Mesh(new PlaneGeometry(2, 2), material)
  const camera = new OrthographicCamera()

  renderer.setRenderTarget(destination)
  renderer.render(mesh, camera)
  renderer.setRenderTarget(null)

  material.dispose()
  mesh.geometry.dispose()
}
