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

Actuellement, l'accumulation s'arrête via un `setTimeout` de 2 secondes qui force `pause = true`. Le nombre de samples dépend donc du framerate (~120 à 60fps, ~240 à 120fps). Il n'y a pas encore de critère de convergence ni d'arrêt sur un nombre de samples cible.
