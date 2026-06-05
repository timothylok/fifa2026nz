#!/usr/bin/env node
/**
 * Test runner — starts dev server, executes all suites, writes results.
 * Usage: node UnitTesting/run-tests.js [--url http://localhost:5175]
 */

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { createRequire } from 'module'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '..')
const RESULTS_DIR = join(__dir, 'results')

// --- collect test suites ---
const suiteFiles = ['./predict.test.js']
const suites = await Promise.all(suiteFiles.map(f => import(f)))

// --- determine base URL ---
const urlArg = process.argv.find(a => a.startsWith('--url='))
let baseUrl = urlArg ? urlArg.split('=')[1] : null
let viteServer = null

if (!baseUrl) {
  process.stdout.write('Starting Vite dev server… ')
  viteServer = await createServer({ root: ROOT, server: { port: 5299 } })
  await viteServer.listen()
  baseUrl = `http://localhost:5299`
  console.log(`running at ${baseUrl}`)
}

// --- run ---
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const runDir = join(RESULTS_DIR, runId)
mkdirSync(runDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const allResults = []

for (const mod of suites) {
  const { suite: suiteName, tests } = mod
  console.log(`\n▸ ${suiteName}`)

  for (const t of tests) {
    const page = await browser.newPage()
    const consoleErrors = []
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
    page.on('pageerror', e => consoleErrors.push(e.message))

    const screenshots = []
    const ctx = {
      consoleErrors,
      async screenshot(name) {
        const file = join(runDir, `${name}.png`)
        await page.screenshot({ path: file, fullPage: true })
        screenshots.push(`${name}.png`)
      }
    }

    await page.goto(baseUrl)
    await page.waitForSelector('button', { timeout: 10000 })

    let status = 'pass', error = null
    const start = Date.now()
    try {
      await t.run(page, ctx)
    } catch (e) {
      status = 'fail'
      error = e.message
    }
    const ms = Date.now() - start

    const result = { suite: suiteName, id: t.id, name: t.name, status, ms, error, screenshots }
    allResults.push(result)
    console.log(`  ${status === 'pass' ? '✓' : '✗'} ${t.name} (${ms}ms)${error ? '\n    ' + error : ''}`)

    await page.close()
  }
}

await browser.close()
if (viteServer) await viteServer.close()

// --- write results ---
const summary = {
  runId,
  timestamp: new Date().toISOString(),
  baseUrl,
  total: allResults.length,
  passed: allResults.filter(r => r.status === 'pass').length,
  failed: allResults.filter(r => r.status === 'fail').length,
  results: allResults
}

writeFileSync(join(runDir, 'results.json'), JSON.stringify(summary, null, 2))
writeFileSync(join(RESULTS_DIR, 'latest.json'), JSON.stringify(summary, null, 2))

console.log(`\n${summary.passed}/${summary.total} passed — results saved to UnitTesting/results/${runId}/`)
process.exit(summary.failed > 0 ? 1 : 0)
