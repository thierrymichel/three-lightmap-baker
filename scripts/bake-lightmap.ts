import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { createServer } from 'vite'

declare global {
  interface Window {
    __bakeComplete?: boolean
    __bakeError?: string
    __bakeResult?: string
    __bakeRender?: string
  }
}

const { values: args } = parseArgs({
  options: {
    input: { type: 'string', short: 'i' },
    output: { type: 'string', short: 'o' },
    resolution: { type: 'string', short: 'r', default: '1024' },
    samples: { type: 'string', short: 's', default: '64' },
    casts: { type: 'string', default: '2' },
    timeout: { type: 'string', default: '300000' },
    gpu: { type: 'boolean', default: false },
  },
})

if (!args.input || !args.output) {
  console.error(
    'Usage: npx tsx scripts/bake-lightmap.ts --input <file.glb> --output <lightmap.png> [--resolution 1024] [--samples 64] [--casts 1] [--gpu]',
  )
  process.exit(1)
}

async function main() {
  const root = path.resolve(import.meta.dirname, '..')

  const server = await createServer({
    root,
    server: { port: 0 },
    logLevel: 'warn',
  })
  await server.listen()

  const address = server.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : 3000
  const baseUrl = `http://localhost:${port}`

  console.log(`Vite dev server on ${baseUrl}`)

  const launchArgs = ['--no-sandbox', '--enable-webgl']

  if (args.gpu) {
    launchArgs.push('--use-gl=egl') // <-- nécessaire pour utiliser le GPU en headless
  } else {
    launchArgs.push('--use-gl=swiftshader')
  }

  // const browser = await chromium.launch({
  //   headless: true,
  //   args: launchArgs,
  // })

  const browser = await chromium.launch({
    headless: false, // NE PAS utiliser headless: true
    channel: 'chrome', // utilise le Chrome système au lieu du Chromium Playwright
    args: [
      '--headless=new', // mode headless via le flag Chromium natif
      '--no-sandbox',
      '--enable-webgl',
      '--use-gl=angle', // ANGLE utilise Metal sur macOS
    ],
  })

  const page = await browser.newPage()

  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('[bake')) {
      console.log(text)
    }
  })

  page.on('pageerror', (err) => {
    console.error('Page error:', err.message)
  })

  const params = new URLSearchParams({
    input: args.input as string,
    resolution: args.resolution ?? '1024',
    samples: args.samples ?? '64',
    casts: args.casts ?? '2',
  })

  const url = `${baseUrl}/bake.html?${params}`
  console.log(`Navigating to ${url}`)
  await page.goto(url)

  console.log('Baking in progress...')

  await page.waitForFunction(() => window.__bakeComplete === true, null, {
    timeout: Number(args.timeout),
    polling: 1000,
  })

  const error = await page.evaluate(() => window.__bakeError)
  if (error) {
    throw new Error(`Bake failed: ${error}`)
  }

  const dataUrl = await page.evaluate(() => window.__bakeResult)

  if (!dataUrl) {
    throw new Error('Bake produced no result')
  }

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  const outputPath = path.resolve(args.output as string)

  await writeFile(outputPath, Buffer.from(base64, 'base64'))
  console.log(`Lightmap saved to ${outputPath}`)

  const renderDataUrl = await page.evaluate(() => window.__bakeRender)
  if (renderDataUrl) {
    const renderBase64 = renderDataUrl.replace(/^data:image\/png;base64,/, '')
    const ext = path.extname(outputPath)
    const baseName = outputPath.slice(0, -ext.length)
    const renderPath = `${baseName}-render${ext}`

    await writeFile(renderPath, Buffer.from(renderBase64, 'base64'))
    console.log(`Render saved to ${renderPath}`)
  }

  await browser.close()
  await server.close()
}

main().catch((err) => {
  console.error('Bake failed:', err)
  process.exit(1)
})
