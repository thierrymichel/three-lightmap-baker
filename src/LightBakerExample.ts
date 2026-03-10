import type { Texture, WebGLRenderTarget } from 'three'
import {
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls'
import { MeshBVH } from 'three-mesh-bvh'
import type { FolderApi } from 'tweakpane'
import { Pane } from 'tweakpane'
import { generateAtlas } from './atlas/generateAtlas'
import { renderAtlas } from './atlas/renderAtlas'
import { CONFIG } from './CONFIG'
import type { Lightmapper, RaycastOptions } from './lightmap/Lightmapper'
import { generateLightmapper } from './lightmap/Lightmapper'
import { mergeGeometry } from './utils/GeometryUtils'
import { LoadGLTF } from './utils/LoaderUtils'
import { prepareScene } from './utils/SceneUtils'

type PointLightConfig = {
  position: Vector3
  enabled: boolean
  size: number
}

const defaultPointLights: PointLightConfig[] = CONFIG.pointLights.map(
  (cfg) => ({
    position: new Vector3(...cfg.position),
    enabled: cfg.enabled,
    size: cfg.size,
  }),
)

const models = {
  'level_blockout.glb': 'level_blockout.glb',
  'dressing.glb': 'dressing.glb',
  'dressing_x1.glb': 'dressing_x1.glb',
  'dressing_x5.glb': 'dressing_x5.glb',
  'dressing_x5_no_uv1.glb': 'dressing_x5_no_uv1.glb',
  'iles.glb': 'iles.glb',
  'ile_energie.glb': 'ile_energie.glb',
}

const renderMode = {
  Standard: 'standard',
  Positions: 'positions',
  Normals: 'normals',
  'UV1 Debug': 'uv',
  Lightmap: 'lightmap',
  Beauty: 'beauty',
}

const Filter = {
  LinearFilter: 'linear',
  Nearest: 'nearest',
}

export class LightBakerExample {
  renderer: WebGLRenderer
  camera: PerspectiveCamera
  scene: Scene
  controls: OrbitControls
  directionalLight: DirectionalLight

  pointLightConfigs: PointLightConfig[]
  pointLightDummies: Object3D[] = []
  pointLightControls: TransformControls[] = []

  currentModel: Object3D
  currentModelMeshes: Mesh[] = []

  uvDebugTexture: Texture
  positionTexture: Texture
  normalTexture: Texture
  lightmapTexture: WebGLRenderTarget

  debugPosition: Mesh
  debugNormals: Mesh
  debugLightmap: Mesh

  lightmapper: Lightmapper | null
  scaleFactor = 1

  pane: Pane

  options = {
    model: CONFIG.model,
    renderMode: CONFIG.renderMode,
    lightMapSize: CONFIG.lightMapSize,
    samples: CONFIG.samples,
    casts: 1,
    filterMode: 'linear',
    directLightEnabled: true,
    indirectLightEnabled: true,
    ambientLightEnabled: true,
    ambientDistance: 0.3,
    lightIntensity: 3.0,
    lightRadius: 60,
    nDotLStrength: 0.5,
    bounce: true,
    albedo: true,
    denoise: false,
    denoiseKernelRadius: 3,
    denoiseSpatialSigma: 2.0,
    denoiseRangeSigma: 0.5,
    debugTextures: false,
    debug: CONFIG.debug,
    accumulating: false,
  }

  constructor(uvDebugTexture: Texture) {
    this.uvDebugTexture = uvDebugTexture

    this.scene = new Scene()
    this.scene.background = new Color(0x74b9ff)

    this.camera = new PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    )
    this.camera.position.set(0, 10, 10)

    this.renderer = new WebGLRenderer({
      antialias: true,
    })
    this.renderer.outputColorSpace = SRGBColorSpace

    this.renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)

    this.directionalLight = new DirectionalLight(0xffffff, 1)

    this.pointLightConfigs = defaultPointLights.map((cfg) => ({ ...cfg }))
    for (const cfg of this.pointLightConfigs) {
      const dummy = new Object3D()
      dummy.position.copy(cfg.position)
      this.scene.add(dummy)
      this.pointLightDummies.push(dummy)

      const tc = new TransformControls(this.camera, this.renderer.domElement)
      tc.attach(dummy)
      tc.addEventListener('dragging-changed', (event) => {
        this.controls.enabled = !event.value
        if (!event.value) this.resetAccumulation()
      })
      const helper = tc.getHelper()
      helper.visible = cfg.enabled
      this.scene.add(helper)
      this.pointLightControls.push(tc)
    }

    this.pane = new Pane()
    this.pane
      .addBinding(this.options, 'model', {
        options: models,
      })
      .on('change', () => this.onMapChange())
    this.pane
      .addBinding(this.options, 'renderMode', {
        options: renderMode,
      })
      .on('change', () => this.onRenderModeChange())

    const lightMapFolder = this.pane.addFolder({ title: 'lightMap' })
    lightMapFolder.addBinding(this.options, 'lightMapSize', {
      max: 4096,
      min: 128,
      step: 128,
    })
    lightMapFolder.addBinding(this.options, 'samples', {
      max: 256,
      min: 1,
      step: 1,
    })
    lightMapFolder.addBinding(this.options, 'casts', {
      max: 4,
      min: 1,
      step: 1,
    })
    lightMapFolder
      .addBinding(this.options, 'filterMode', {
        options: Filter,
      })
      .on('change', () => this.onRenderModeChange())
    lightMapFolder.addBinding(this.options, 'bounce')
    lightMapFolder.addBinding(this.options, 'albedo')

    const lightsFolder = this.pane.addFolder({ title: 'lights' })
    this.setupPointLightFolders(lightsFolder)
    lightsFolder.addBinding(this.options, 'directLightEnabled')
    lightsFolder.addBinding(this.options, 'indirectLightEnabled')
    lightsFolder.addBinding(this.options, 'ambientLightEnabled')
    lightsFolder.addBinding(this.options, 'ambientDistance', {
      max: 2,
      min: 0.01,
    })
    lightsFolder.addBinding(this.options, 'lightIntensity', {
      max: 5,
      min: 0,
      step: 0.1,
    })
    lightsFolder.addBinding(this.options, 'lightRadius', {
      max: 200,
      min: 1,
      step: 1,
    })
    lightsFolder.addBinding(this.options, 'nDotLStrength', {
      max: 1,
      min: 0,
      step: 0.05,
    })

    const denoiseFolder = this.pane.addFolder({ title: 'denoise' })
    denoiseFolder
      .addBinding(this.options, 'denoise')
      .on('change', () => this.applyDenoise())
    denoiseFolder
      .addBinding(this.options, 'denoiseKernelRadius', {
        label: 'kernel',
        max: 4,
        min: 1,
        step: 1,
      })
      .on('change', () => this.applyDenoise())
    denoiseFolder
      .addBinding(this.options, 'denoiseSpatialSigma', {
        label: 'spatial σ',
        max: 5.0,
        min: 0.5,
        step: 0.1,
      })
      .on('change', () => this.applyDenoise())
    denoiseFolder
      .addBinding(this.options, 'denoiseRangeSigma', {
        label: 'range σ',
        max: 1.0,
        min: 0.01,
        step: 0.01,
      })
      .on('change', () => this.applyDenoise())

    const debugFolder = this.pane.addFolder({ title: 'debug' })
    debugFolder
      .addBinding(this.options, 'debugTextures')
      .on('change', () => this.onRenderModeChange())
    debugFolder.addBinding(this.options, 'debug').on('change', (ev) => {
      CONFIG.debug = ev.value
    })

    this.pane
      .addButton({
        title: 'Reset',
      })
      .on('click', () => {
        this.generateLightmap()
      })

    this.initialSetup()
  }

  updateSize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }

  async initialSetup() {
    await this.onMapChange()
  }

  async onMapChange() {
    if (this.currentModel) {
      this.scene.remove(this.currentModel)
    }

    this.currentModelMeshes = []
    this.lightmapper = null

    const gltf = await LoadGLTF(this.options.model)

    gltf.scene.traverse((child: Object3D) => {
      const mesh = child as Mesh

      if (mesh.isMesh) {
        // biome-ignore lint/suspicious/noExplicitAny: material is enhanced
        ;(mesh.material as any)._originalMap = (mesh.material as any).map
        this.currentModelMeshes.push(mesh)
      }
    })

    this.currentModel = gltf.scene
    this.scene.add(gltf.scene)

    const { scaleFactor } = prepareScene(gltf.scene)
    this.scaleFactor = scaleFactor

    for (let i = 0; i < this.pointLightConfigs.length; i++) {
      const ref = defaultPointLights[i]
      this.pointLightDummies[i].position
        .copy(ref.position)
        .multiplyScalar(scaleFactor)
    }

    const box = new Box3().setFromObject(gltf.scene)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)

    this.camera.position.set(
      center.x + maxDim * 0.5,
      center.y + maxDim * 0.35,
      center.z + maxDim * 0.55,
    )
    this.controls.target.copy(center)
    this.controls.update()

    await this.updateAtlasTextures()

    this.update()

    await this.generateLightmap()

    this.lightmapper.render()
  }

  async updateAtlasTextures() {
    await generateAtlas(this.currentModelMeshes)
  }

  async generateLightmap() {
    const resolution = this.options.lightMapSize

    const atlas = renderAtlas(
      this.renderer,
      this.currentModelMeshes,
      resolution,
      true,
    )
    this.positionTexture = atlas.positionTexture
    this.normalTexture = atlas.normalTexture

    this.update()

    // Comptage des attributs de géométrie par occurrence (debug)
    if (CONFIG.debug) {
      const attrCounts: Record<string, number> = {}

      for (const m of this.currentModelMeshes) {
        for (const attrName of Object.keys(m.geometry.attributes)) {
          attrCounts[attrName] = (attrCounts[attrName] ?? 0) + 1
        }
      }

      const total = this.currentModelMeshes.length
      const table = Object.entries(attrCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([attr, count]) => `${attr}: ${count}/${total}`)
      console.table(
        Object.fromEntries(
          Object.entries(attrCounts).sort(([, a], [, b]) => b - a),
        ),
      )
      console.log('Attributs par mesh:', table.join(' | '))
    }

    const mergedGeometry = mergeGeometry(this.currentModelMeshes)
    const bvh = new MeshBVH(mergedGeometry)

    const s = this.scaleFactor

    const pointLights = this.pointLightConfigs
      .map((cfg, i) => ({ cfg, dummy: this.pointLightDummies[i] }))
      .filter(({ cfg }) => cfg.enabled)
      .map(({ cfg, dummy }) => ({
        position: dummy.position,
        size: cfg.size * s,
        intensity: this.options.lightIntensity,
        color: new Color(0xffffff),
        distance: this.options.lightRadius * s,
      }))

    const lightmapperOptions: RaycastOptions = {
      resolution: resolution,
      casts: this.options.casts,
      filterMode:
        this.options.filterMode === 'linear' ? LinearFilter : NearestFilter,
      pointLights,
      ambientDistance: this.options.ambientDistance * s,
      nDotLStrength: this.options.nDotLStrength,
      ambientLightEnabled: this.options.ambientLightEnabled,
      directLightEnabled: this.options.directLightEnabled,
      indirectLightEnabled: this.options.indirectLightEnabled,
      bounceEnabled: this.options.bounce,
      albedoEnabled: this.options.albedo,
      rayEpsilon: 0.001 * s,
    }

    this.lightmapper = await generateLightmapper(
      this.renderer,
      atlas.positionTexture,
      atlas.normalTexture,
      atlas.albedoTexture,
      bvh,
      lightmapperOptions,
    )
    this.lightmapTexture = this.lightmapper.renderTexture
    this.options.accumulating = true

    this.onRenderModeChange()
  }

  createDebugTexture(texture: Texture, position: Vector3) {
    const debugTexture = new Mesh(
      new PlaneGeometry(20, 20),
      new MeshBasicMaterial({
        map: texture,
        side: DoubleSide,
      }),
    )

    debugTexture.position.copy(position)
    debugTexture.scale.set(0.5, 0.5, 0.5)

    this.scene.add(debugTexture)

    return debugTexture
  }

  applyDenoise() {
    if (!this.lightmapper) {
      return
    }

    this.lightmapper.denoise({
      enabled: this.options.denoise,
      kernelRadius: this.options.denoiseKernelRadius,
      spatialSigma: this.options.denoiseSpatialSigma,
      rangeSigma: this.options.denoiseRangeSigma,
    })
    this.lightmapTexture = this.lightmapper.renderTexture
    this.onRenderModeChange()
  }

  setupPointLightFolders(parent: FolderApi) {
    for (let i = 0; i < this.pointLightConfigs.length; i++) {
      const cfg = this.pointLightConfigs[i]
      const dummy = this.pointLightDummies[i]
      const folder = parent.addFolder({ title: `Point Light ${i + 1}` })
      folder.addBinding(cfg, 'enabled').on('change', () => {
        this.pointLightControls[i].getHelper().visible = cfg.enabled
        this.generateLightmap()
      })
      const refPos = {
        get x() {
          return dummy.position.x / self.scaleFactor
        },
        get y() {
          return dummy.position.y / self.scaleFactor
        },
        get z() {
          return dummy.position.z / self.scaleFactor
        },
      }
      const self = this
      folder.addBinding(refPos, 'x', { readonly: true, label: 'pos x' })
      folder.addBinding(refPos, 'y', { readonly: true, label: 'pos y' })
      folder.addBinding(refPos, 'z', { readonly: true, label: 'pos z' })
      folder.addBinding(cfg, 'size', { min: 0, max: 20, step: 0.5 })
    }
  }

  resetAccumulation() {
    if (!this.lightmapper) return
    this.lightmapper.reset()
    this.options.accumulating = true
  }

  onDebugTexturesChange() {
    if (this.debugPosition) {
      this.scene.remove(this.debugPosition)
    }

    if (this.debugNormals) {
      this.scene.remove(this.debugNormals)
    }

    if (this.debugLightmap) {
      this.scene.remove(this.debugLightmap)
    }

    if (this.options.debugTextures) {
      this.debugPosition = this.createDebugTexture(
        this.positionTexture,
        new Vector3(0, 10, 0),
      )
      this.debugNormals = this.createDebugTexture(
        this.normalTexture,
        new Vector3(12, 10, 0),
      )
      this.debugLightmap = this.createDebugTexture(
        this.lightmapTexture.texture,
        new Vector3(24, 10, 0),
      )
    }
  }

  onRenderModeChange() {
    if (!this.currentModel) {
      return
    }

    this.currentModel.traverse((child: Object3D) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        // biome-ignore lint/suspicious/noExplicitAny: material has _originalMap and lightMap
        const mat = mesh.material as any
        mat.map = null

        const mode = this.options.renderMode
        if (mode === 'standard') {
          mat.lightMap = null
          mat.map = mat._originalMap
        } else if (
          mode === 'positions' ||
          mode === 'normals' ||
          mode === 'uv' ||
          mode === 'lightmap' ||
          mode === 'beauty'
        ) {
          mat.lightMap =
            mode === 'positions'
              ? this.positionTexture
              : mode === 'normals'
                ? this.normalTexture
                : mode === 'uv'
                  ? this.uvDebugTexture
                  : this.lightmapTexture.texture
          mat.lightMap.channel = 1
          if (mode === 'beauty') mat.map = mat._originalMap
        }

        if (mat.lightMap) {
          mat.lightMap.needsUpdate = true
          mat.lightMap.channel = 1
        }
        mat.lightMapIntensity = 1
        mat.needsUpdate = true
      }
    })

    if (this.options.renderMode === 'standard') {
      this.scene.add(this.directionalLight)
    } else {
      this.scene.remove(this.directionalLight)
    }

    this.onDebugTexturesChange()
  }

  update() {
    requestAnimationFrame(() => this.update())

    if (this.lightmapper && this.options.accumulating) {
      const totalSamples = this.lightmapper.render()
      if (CONFIG.debug) {
        console.log('samples', totalSamples)
      }
      if (totalSamples >= this.options.samples) {
        this.options.accumulating = false
        this.applyDenoise()
      }
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
