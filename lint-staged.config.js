export default {
  'src/**/*.{js,ts}': ['biome check --write'],
  '*.{json,md}': ['biome format --write'],
}
