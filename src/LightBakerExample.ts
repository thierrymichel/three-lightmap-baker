import type { Texture, WebGLRenderTarget } from 'three'
import {
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
import { Pane } from 'tweakpane'
import { generateAtlas } from './atlas/generateAtlas'
import { renderAtlas } from './atlas/renderAtlas'
import type { Lightmapper, RaycastOptions } from './lightmap/Lightmapper'
import { generateLightmapper } from './lightmap/Lightmapper'
import { mergeGeometry } from './utils/GeometryUtils'
import { LoadGLTF } from './utils/LoaderUtils'

const models = {
  'level_blockout.glb': 'level_blockout.glb',
  'dressing.glb': 'dressing.glb',
}

const renderMode = {
  Standard: 'standard',
  Positions: 'positions',
  Normals: 'normals',
  'UV2 Debug': 'uv',
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

  lightDummy1: Object3D
  lightDummy2: Object3D
  lightTranformController: TransformControls

  currentModel: Object3D
  currentModelMeshs: Mesh[] = []

  uvDebugTexture: Texture
  positionTexture: Texture
  normalTexture: Texture
  lightmapTexture: WebGLRenderTarget

  debugPosition: Mesh
  debugNormals: Mesh
  debugLightmap: Mesh

  lightmapper: Lightmapper | null

  pane: Pane

  options = {
    model: 'dressing.glb',
    renderMode: 'beauty',
    lightMapSize: 2048,
    casts: 2,
    filterMode: 'linear',
    directLightEnabled: true,
    indirectLightEnabled: true,
    ambientLightEnabled: true,
    ambientDistance: 0.3,
    lightIntensity: 3.0,
    lightRadius: 60,
    nDotLStrength: 0.5,
    bounce: true,
    denoise: false,
    denoiseKernelRadius: 2,
    denoiseSpatialSigma: 2.0,
    denoiseRangeSigma: 0.1,
    debugTextures: false,
    pause: false,
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

    this.lightDummy1 = new Object3D()
    this.lightDummy1.position.set(25.0, 30.0, 2.0)

    this.lightDummy2 = new Object3D()
    this.lightDummy2.position.set(-5.0, 30.0, -10.0)

    this.lightTranformController = new TransformControls(
      this.camera,
      this.renderer.domElement,
    )
    this.lightTranformController.addEventListener(
      'dragging-changed',
      (event) => {
        this.controls.enabled = !event.value
      },
    )
    this.lightTranformController.attach(this.lightDummy1)
    this.lightTranformController.attach(this.lightDummy2)
    this.scene.add(this.lightDummy1)
    this.scene.add(this.lightDummy2)
    this.scene.add(this.lightTranformController.getHelper())

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

    this.pane.addBinding(this.options, 'lightMapSize', {
      max: 4096,
      min: 128,
      step: 128,
    })

    this.pane.addBinding(this.options, 'casts', {
      max: 4,
      min: 1,
      step: 1,
    })

    this.pane.addBinding(this.options, 'directLightEnabled')
    this.pane.addBinding(this.options, 'indirectLightEnabled')
    this.pane.addBinding(this.options, 'ambientLightEnabled')
    this.pane.addBinding(this.options, 'ambientDistance', {
      max: 2,
      min: 0.01,
    })
    this.pane.addBinding(this.options, 'lightIntensity', {
      max: 5,
      min: 0,
      step: 0.1,
    })
    this.pane.addBinding(this.options, 'lightRadius', {
      max: 200,
      min: 1,
      step: 1,
    })
    this.pane.addBinding(this.options, 'nDotLStrength', {
      max: 1,
      min: 0,
      step: 0.05,
    })
    this.pane.addBinding(this.options, 'bounce')

    const denoiseFolder = this.pane.addFolder({ title: 'Denoise' })
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
        max: 0.5,
        min: 0.01,
        step: 0.01,
      })
      .on('change', () => this.applyDenoise())

    this.pane
      .addBinding(this.options, 'debugTextures')
      .on('change', () => this.onRenderModeChange())

    this.pane
      .addBinding(this.options, 'filterMode', {
        options: Filter,
      })
      .on('change', () => this.onRenderModeChange())

    this.pane
      .addButton({
        title: 'Reset',
      })
      .on('click', () => {
        this.options.pause = false
        this.pane.refresh()

        this.generateLightmap()

        // Todo: Not sure why need this in a timeout...
        setTimeout(() => {
          this.lightmapper.render()
        }, 0)
      })

    this.pane.addBinding(this.options, 'pause')

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

    this.camera.position.set(3.5, 3, 4)
    this.controls.target.set(1, 1, 1) // par exemple, centrer un peu plus haut
    this.controls.update()

    this.currentModelMeshs = []

    this.lightmapper = null

    const gltf = await LoadGLTF(this.options.model)

    gltf.scene.traverse((child: Object3D) => {
      const mesh = child as Mesh

      if (mesh.isMesh) {
        // biome-ignore lint/suspicious/noExplicitAny: material is enhanced
        ;(mesh.material as any)._originalMap = (mesh.material as any).map
        this.currentModelMeshs.push(mesh)
      }
    })

    this.currentModel = gltf.scene
    this.scene.add(gltf.scene)

    await this.updateAtlasTextures()

    this.update()

    await this.generateLightmap()

    // Render once to get the lightmap
    this.lightmapper.render()
  }

  async updateAtlasTextures() {
    await generateAtlas(this.currentModelMeshs)
  }

  async generateLightmap() {
    const resolution = this.options.lightMapSize

    const atlas = renderAtlas(
      this.renderer,
      this.currentModelMeshs,
      resolution,
      true,
    )
    this.positionTexture = atlas.positionTexture
    this.normalTexture = atlas.normalTexture

    this.update()

    const mergedGeomerty = mergeGeometry(this.currentModelMeshs)
    const bvh = new MeshBVH(mergedGeomerty)

    const lightmapperOptions: RaycastOptions = {
      resolution: resolution,
      casts: this.options.casts,
      filterMode:
        this.options.filterMode === 'linear' ? LinearFilter : NearestFilter,
      lights: [
        {
          position: this.lightDummy1.position,
          size: 3,
          intensity: this.options.lightIntensity * 0.5,
          color: new Color(0xffffff),
          distance: this.options.lightRadius,
        },
        {
          position: this.lightDummy2.position,
          size: 3,
          intensity: this.options.lightIntensity,
          color: new Color(0xffffff),
          distance: this.options.lightRadius,
        },
      ],
      ambientDistance: this.options.ambientDistance,
      nDotLStrength: this.options.nDotLStrength,
      ambientLightEnabled: this.options.ambientLightEnabled,
      directLightEnabled: this.options.directLightEnabled,
      indirectLightEnabled: this.options.indirectLightEnabled,
      bounceEnabled: this.options.bounce,
    }

    this.lightmapper = await generateLightmapper(
      this.renderer,
      atlas.positionTexture,
      atlas.normalTexture,
      bvh,
      lightmapperOptions,
    )
    this.lightmapTexture = this.lightmapper.renderTexture

    this.onRenderModeChange()

    // Auto-pause + denoise
    setTimeout(() => {
      this.options.pause = true
      this.pane.refresh()
      this.applyDenoise()
      console.log('✅')
    }, 10000)
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
    if (!this.lightmapper) return

    this.lightmapper.denoise({
      enabled: this.options.denoise,
      kernelRadius: this.options.denoiseKernelRadius,
      spatialSigma: this.options.denoiseSpatialSigma,
      rangeSigma: this.options.denoiseRangeSigma,
    })
    this.lightmapTexture = this.lightmapper.renderTexture
    this.onRenderModeChange()
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
    this.currentModel.traverse((child: any) => {
      if (child.isMesh) {
        // child.material = new MeshBasicMaterial();
        child.material.map = null

        if (this.options.renderMode === 'standard') {
          child.material.lightMap = null
          child.material.map = child.material._originalMap
        }

        if (this.options.renderMode === 'positions') {
          child.material.lightMap = this.positionTexture
          child.material.lightMap.channel = 2
        }

        if (this.options.renderMode === 'normals') {
          child.material.lightMap = this.normalTexture
          child.material.lightMap.channel = 2
        }

        if (this.options.renderMode === 'uv') {
          child.material.lightMap = this.uvDebugTexture
          child.material.lightMap.channel = 2
        }

        if (this.options.renderMode === 'lightmap') {
          child.material.lightMap = this.lightmapTexture.texture
          child.material.lightMap.channel = 2
        }

        if (this.options.renderMode === 'beauty') {
          child.material.lightMap = this.lightmapTexture.texture
          child.material.lightMap.channel = 2
          child.material.map = child.material._originalMap
        }

        if (child.material.lightMap) {
          child.material.lightMap.needsUpdate = true
          child.material.lightMap.channel = 2
        }

        child.material.lightMapIntensity = 1
        child.material.needsUpdate = true
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

    if (this.lightmapper && !this.options.pause) {
      const samples = this.lightmapper.render()

      console.log('samples', samples)
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
