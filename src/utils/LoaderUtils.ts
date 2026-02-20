import type { Texture } from 'three'
import { TextureLoader } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

export const LoadTexture = (content: string): Promise<Texture> => {
  return new Promise((resolve, reject) => {
    const loader = new TextureLoader()
    loader.load(content, resolve, undefined, reject)
  })
}

export const LoadGLTF = (content: string): Promise<GLTF> => {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()

    loader.load(content, resolve, undefined, reject)
  })
}
