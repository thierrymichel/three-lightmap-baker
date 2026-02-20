# NOTES

## Direct lighting: atténuation et N·L dosables

### Atténuation par distance (`lightDistance`)

Ajout d'un paramètre `distance` par lumière qui contrôle la portée du falloff.

- Formule : `(1 - d/distance)²` — falloff quadratique doux jusqu'à zéro
- `distance = 0` → aucune atténuation (comportement original)
- Plus la valeur est grande, plus la lumière porte loin

### Terme lambertien dosable (`nDotLStrength`)

Le terme N·L (Lambert) module la lumière selon l'angle entre la normale de surface et la direction vers la lumière. Il est maintenant dosable via `mix(1.0, NdotL, nDotLStrength)`.

- `nDotLStrength = 0` → contribution flat `1.0` (original), ombres maximalement contrastées
- `nDotLStrength = 1` → Lambert pur, shading directionnel mais contraste ombre/lumière réduit
- `nDotLStrength = 0.3–0.5` → bon compromis

### Sliders de debug (LightBakerExample)

| Slider           | Range   | Défaut | Effet                                          |
| ---------------- | ------- | ------ | ---------------------------------------------- |
| `lightIntensity` | 0 → 5   | 1.0    | Multiplie l'intensité de toutes les lumières   |
| `lightDistance`  | 0 → 200 | 60     | Portée de l'atténuation (0 = désactivé)        |
| `nDotLStrength`  | 0 → 1   | 0.5    | Dosage du Lambert (0 = flat, 1 = full N·L)     |

Pour retrouver le rendu original : `lightDistance = 0`, `nDotLStrength = 0`, `lightIntensity = 1.0`.
