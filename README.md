<!-- markdownlint-disable -->
# 🍞 Three Lightmap Baker

<h3 align="center">Basic example of lightmapping in ThreeJS</h3>
<h4 align="center">✨ Big Thanks for <a href="https://github.com/gkjohnson/three-mesh-bvh">Three Mesh BVH</a>, <a href="https://github.com/gkjohnson/three-gpu-pathtracer">Three GPU Pathtracer</a> & <a href="https://github.com/repalash/xatlas-three/">XAtlas-Three</a> for been excellent libraries ✨</h4>
<h1 align="center">
<a href="https://lucas-jones.github.io/three-lightmap-baker/">Live Demo</a></h1>


## Todo
 - [x] Progressive renderer <!-- ping-pong accumulation with running average -->
 - [x] Convert to an API <!-- `generateLightmapper()` + `bakeLightmap()` -->
 - [ ] NPM Package
 - [x] Add denoiser options <!-- bilateral filter (kernel, spatial σ, range σ) -->
 - [ ] High casts can cause the WebGL context to timeout
 - [x] Import & Export models & lightmaps <!-- GLB import + headless bake via Playwright (`yarn bake` → PNG) -->
 - [ ] Bounce lighting <!-- single-bounce indirect only, no recursive bounces -->
 - [ ] Albedo & Emissive textures
 - [ ] Only denoise indirect light & AO <!-- bilateral filter is applied to the full combined lightmap -->
 - [ ] Denoise offline (using Optix)
 - [ ] Try import/use more GPU Pathtracer logic <!-- uses BVH structs/shaders, not the full pathtracer -->
 - [x] Multiple lights, light types, light colour <!-- up to 2 point lights with color, intensity, distance attenuation -->
 - [ ] Downscaling
 - [ ] Seperate AO map
 - [ ] Generate & export light probes

## Examples

![alt text](screenshots/lightmap5.png)
![alt text](screenshots/lightmap7.png)
![alt text](screenshots/lightmap8.png)


## How it works
1. Pass all the geomerty into [XAtlas-Three](https://github.com/repalash/xatlas-three/) (UV unwrapping library). This will generate a "UV2" attribute on the geometry.
2. Render the geomerties vericies in the UV2 space. Create two textures (resolution being the lightmap resolution), using the gl_FragColor to encode **world position** and the **normal**. This is packing Vec3 data into a texture using the RGB channel.

![alt text](screenshots/lightmap6.png)
![alt text](screenshots/lightmap_combo.png)
**Visual reference:** Using these textures as the lightmap (using UV2). 

3. These two texture are effectivly a 2D array of World Position & Normals covering the entire geomerty.
4. Itterate through each World Position & Normal. Cast rays at each position to calculate incoming light.

![alt text](screenshots/lightmap_pixels.png)
**Visual reference:** Creating arrows for each world positon & the normal


![alt text](screenshots/lightmap5.png)
5. The Three Mesh BVH library helps improve the performance of raycasting, it also allows raycasting on the GPU (this is super fast). 
6. Using A LOT of copy & pasted code from Three GPU Pathtracer to generate light

## Further Reading / Watching
 - [I made a better Ray-Tracing engine](https://www.youtube.com/watch?v=A61S_2swwAc)
 - [High level overview of a lightmapping generation process](https://www.reddit.com/r/GraphicsProgramming/comments/brl22k/high_level_overview_of_a_lightmapping_generation/)
 - [Baking artifact-free lightmaps on the GPU](https://ndotl.wordpress.com/2018/08/29/baking-artifact-free-lightmaps/)
 - [Radiosity Baker](http://david-westreicher.github.io/2014/05/31/radiosity/)
 - [Lightmapping in Anomaly 2 mobile](https://knarkowicz.wordpress.com/2014/07/20/lightmapping-in-anomaly-2-mobile/)
 ## Credit
  - [Level Blockout Model - DJMaesen](https://sketchfab.com/3d-models/level-blockout-24b39d9beef54166a14e6f2542d01def)
