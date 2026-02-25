# NOTES

## Direct lighting: atténuation et N·L dosables

### Atténuation par distance (inverse-square avec `lightRadius`)

Ajout d'un paramètre `distance` (renommé `lightRadius` côté UI) par lumière qui contrôle le falloff.

- Formule : `1.0 / (1.0 + d² / r²)` — inverse-square physiquement correct
- `lightRadius` représente la distance à laquelle l'intensité tombe à 50%
- Plus la valeur est grande, plus la lumière porte loin (intuitif)
- Valeur petite (ex: 5) → lumière locale, tombe vite
- Valeur grande (ex: 50+) → éclairage quasi uniforme

### Terme lambertien dosable (`nDotLStrength`)

Le terme N·L (Lambert) module la lumière selon l'angle entre la normale de surface et la direction vers la lumière. Il est maintenant dosable via `mix(1.0, NdotL, nDotLStrength)`.

- `nDotLStrength = 0` → contribution flat `1.0` (original), ombres maximalement contrastées
- `nDotLStrength = 1` → Lambert pur, shading directionnel mais contraste ombre/lumière réduit
- `nDotLStrength = 0.3–0.5` → bon compromis

### Sliders de debug (LightBakerExample)

| Slider           | Range   | Défaut | Effet                                            |
| ---------------- | ------- | ------ | ------------------------------------------------ |
| `lightIntensity` | 0 → 5   | 1.0    | Multiplie l'intensité de toutes les lumières     |
| `lightRadius`    | 1 → 200 | 60     | Distance à 50% d'intensité (inverse-square)      |
| `nDotLStrength`  | 0 → 1   | 0.5    | Dosage du Lambert (0 = flat, 1 = full N·L)       |

## Early-out texels vides

Les texels non couverts par l'atlas (`position.a == 0.0`) sont immédiatement discardés en début de fragment shader, évitant de lancer des rays inutiles (~30-40% de travail GPU en moins).

## Accumulation ping-pong

Remplacement du blending alpha WebGL par une accumulation explicite avec deux render targets (ping-pong).

### Avant (fragile)

- Un seul render target, `transparent: true`, `opacity = 1/totalSamples`
- Repose sur le blend hardware : `src × alpha + dst × (1 - alpha)`
- Bug : le sample 0 est écrasé par le sample 1 (les deux ont `opacity = 1.0`)
- Précision limitée par le blending alpha 8 bits
- Dépend de l'état global du blending WebGL

### Maintenant (ping-pong)

- Deux render targets (A et B) qui alternent lecture/écriture
- Le shader lit le frame précédent et écrit la running average :
  `mix(previous, newSample, 1.0 / float(sampleIndex + 1))`
- Calcul en full float32, déterministe, indépendant de l'état du renderer
- Coût : un texture fetch supplémentaire par fragment + 2× la VRAM (négligeable vs le BVH traversal)

### Contrôle de l'arrêt

Actuellement, l'accumulation s'arrête via un `setTimeout` de 2.5 secondes qui force `pause = true`. Le nombre de samples dépend donc du framerate (~120 à 60fps, ~240 à 120fps). Il n'y a pas encore de critère de convergence ni d'arrêt sur un nombre de samples cible.

## Denoiser — Filtre bilatéral en post-process

Un filtre bilatéral appliqué en fullscreen quad sur la lightmap accumulée. Le filtre bilatéral est **edge-preserving** par construction : il pondère chaque voisin par la distance spatiale ET la différence d'intensité. Résultat : les ombres franches (direct light) restent nettes tandis que le bruit Monte Carlo (indirect/AO) est lissé.

### Architecture

- `LightmapDenoiser.ts` — fonction `denoiseLightmap()` qui rend un pass unique (source → destination)
- Un 3e render target (`rtDenoised`) dans le `Lightmapper`, utilisé uniquement quand le denoiser est actif
- Le getter `renderTexture` retourne automatiquement la version denoisée ou brute selon l'état
- Pendant l'accumulation active (`render()`), `isDenoised` repasse à `false` — le denoiser ne tourne pas à chaque frame
- Le denoiser est déclenché une fois quand le bake se met en pause, ou manuellement depuis l'UI

### Paramètres

| Slider       | Range      | Défaut | Effet                                                      |
| ------------ | ---------- | ------ | ---------------------------------------------------------- |
| `denoise`    | on/off     | off    | Active/désactive le denoiser                               |
| `kernel`     | 1 → 4      | 2      | Rayon du noyau en texels (kernel 2 = fenêtre 5×5)          |
| `spatial σ`  | 0.5 → 5.0  | 2.0    | Écart-type spatial — plus grand = plus de blur spatial     |
| `range σ`    | 0.01 → 0.5 | 0.1    | Écart-type d'intensité — plus petit = plus edge-preserving |

### Pourquoi ça marche sans séparer direct/indirect

Le filtre bilatéral préserve naturellement les discontinuités d'intensité (bords d'ombres dures) grâce à sa composante range. Avec un `range σ` bas (0.05–0.15), les transitions franches du direct light sont préservées tandis que le bruit haute fréquence de l'indirect/AO est moyenné. Pas besoin de MRT séparés.

## Bounce lighting — indirect multi-rebond progressif

Ajout d'un rebond de lumière indirecte via l'accumulation progressive. Quand un ray hémisphère touche une surface, au lieu de contribuer 0, on échantillonne la lightmap accumulée au point d'impact pour récupérer la lumière déjà calculée à cet endroit.

### Principe

1. À chaque sample, le shader lance des rays hémisphère depuis chaque texel
2. Si le ray ne touche rien → contribution sky `vec3(1.0)` (inchangé)
3. Si le ray touche une surface et `bounceEnabled` :
   - Interpolation des coordonnées UV2 au point d'impact via les barycentriques (`textureSampleBarycoord`)
   - Échantillonnage de `previousFrame` (la lightmap accumulée) à ces UV2
   - La couleur récupérée est ajoutée comme contribution indirecte

### Convergence naturelle multi-bounce

Pas besoin de paramètre "nombre de bounces" :

- **Sample 0** : `previousFrame` est noir (render targets vidés) → aucun bounce, seulement direct + sky
- **Samples suivants** : `previousFrame` contient la running average → les surfaces touchées retournent de la lumière
- **Après N samples** : convergence itérative — chaque nouveau sample capte la lumière rebondie des passes précédentes, équivalent à un solver de radiosité progressive avec bounces infinis

### Implémentation technique

- **Texture UV2** : `FloatVertexAttributeTexture` (de three-mesh-bvh) créée à partir de `bvh.geometry.attributes.uv2` — les vertex indices retournés par `bvhIntersectFirstHit` (`faceIndices.xyz`) indexent directement cette texture
- **`textureSampleBarycoord()`** : helper GLSL déjà fourni par three-mesh-bvh (`common_functions`), fait l'interpolation barycentrique pour nous
- **Double usage de `previousFrame`** : sert à la fois pour l'accumulation ping-pong (running average) et comme source de bounce — pas de render target supplémentaire

### Paramètre

| Toggle   | Défaut | Effet                                                                            |
| -------- | ------ | -------------------------------------------------------------------------------- |
| `bounce` | on     | Active/désactive le rebond indirect (surfaces éclairées rebondissent la lumière) |

### Limites actuelles

- **Convergence plus lente** : les bounces dépendant des samples précédents, il faut ~2-3× plus de samples pour le même niveau de bruit. Le denoiser bilatéral compense en partie.

## Albedo atlas — color bleeding et absorption d'énergie

La texture diffuse (`map`) de chaque mesh est rendue dans l'espace UV2 pour créer un **atlas albedo**, au même titre que les textures de position et de normales. Les bounces multiplient la lumière rebondie par l'albedo de la surface impactée.

### Effet

- **Color bleeding** : un mur rouge teinte les surfaces voisines en rouge via la lumière rebondie
- **Absorption d'énergie** : les surfaces sombres absorbent plus de lumière à chaque rebond, évitant la sur-luminosité en intérieur
- **Cohérence** : la lightmap elle-même n'est pas modulée par l'albedo — celui-ci est appliqué au runtime via le matériau (`lightMap × map`). Seuls les bounces intègrent l'albedo au point d'impact.

### Implémentation

- **`renderAtlas.ts`** : nouvelle fonction `renderAlbedoAtlas()` qui crée un `ShaderMaterial` par mesh (chacun avec sa propre texture `map`), positionne les vertices en UV2, et rend dans un render target commun avec dilation
- Les meshes sans `map` utilisent un fallback blanc (1×1 `DataTexture`)
- L'offset de dilation est partagé via une référence `Vector2` commune à tous les matériaux
- **`LightmapperMaterial.ts`** : uniform `albedoAtlas` (sampler2D), échantillonné au point d'impact du bounce :

  ```glsl
  vec3 hitAlbedo = texture2D(albedoAtlas, hitUV).rgb;
  totalIndirectLight += texture2D(previousFrame, hitUV).rgb * hitAlbedo;
  ```

## NPM scripts

```sh
yarn bake --input dressing.glb --output 'output/lightmap-low.png' --resolution 512 --samples 16
yarn bake --input dressing.glb --output 'output/lightmap-high.png' --resolution 2048 --samples 128 --gpu
yarn bake --input dressing.glb --output 'output/lightmap-ultra.png' --resolution 4096 --samples 256 --gpu
```
