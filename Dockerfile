# Image officielle Playwright : Ubuntu Noble + Node 24 + Chromium (moins de vulnérabilités que node:bookworm)
FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Appliquer les mises à jour de sécurité Ubuntu
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn

RUN corepack enable && yarn install --immutable

COPY . .

# RUN yarn build

# Chromium déjà inclus dans l'image de base Playwright
ENV DOCKER=1

# Test : bake avec le modèle de démo
# Input = chemin URL servi par Vite (public/ → /)
# CMD ["yarn", "bake", "--input", "/dressing.glb", "--output", "/tmp/lightmap.png", "--resolution", "512", "--samples", "16"]
