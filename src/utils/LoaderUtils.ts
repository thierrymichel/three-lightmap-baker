import type { Texture } from 'three'
import { TextureLoader } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

/** Loads a texture from URL. */
export const LoadTexture = (content: string): Promise<Texture> => {
  return new Promise((resolve, reject) => {
    const loader = new TextureLoader()
    loader.load(content, resolve, undefined, reject)
  })
}

/** Loads a GLTF/GLB model from URL. */
export const LoadGLTF = (content: string): Promise<GLTF> => {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()

    loader.load(content, resolve, undefined, reject)
  })
}
