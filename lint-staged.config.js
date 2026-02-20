export default {
  'src/**/*.{js,ts}': ['biome check --write'],
  '*.json': ['biome format --write'],
}
