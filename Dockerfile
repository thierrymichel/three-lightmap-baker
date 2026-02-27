# Image officielle Playwright : Ubuntu Noble + Node 24 + Chromium
# Exécution : Linux uniquement. Chromium headless (DOCKER=1) + SwiftShader ou EGL selon --gpu
FROM mcr.microsoft.com/playwright:v1.58.2-noble

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn

RUN corepack enable && yarn install --immutable

COPY . .

# Chromium utilisé par défaut (pas de Chrome système dans le container)
ENV DOCKER=1

# Sans GPU : SwiftShader (--use-gl=swiftshader)
# Avec GPU : docker run --gpus all ... yarn bake ... --gpu
CMD ["yarn", "bake", "--input", "/dressing.glb", "--output", "/tmp/lightmap.png", "--resolution", "512", "--samples", "16"]
