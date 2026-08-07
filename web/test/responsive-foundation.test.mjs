import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readProjectFile = (relativePath) => {
  try {
    return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
}

const indexHtml = readProjectFile('index.html')
const appVue = readProjectFile('src/App.vue')
const variablesCss = readProjectFile('src/styles/variables.css')
const baseCss = readProjectFile('src/styles/base.css')

test('the viewport remains zoomable and supports safe areas', () => {
  assert.doesNotMatch(indexHtml, /maximum-scale/i)
  assert.doesNotMatch(indexHtml, /user-scalable\s*=\s*no/i)
  assert.match(indexHtml, /viewport-fit=cover/i)
})

test('the app loads shared responsive foundations without a desktop phone shell', () => {
  assert.doesNotMatch(appVue, /max-width\s*:\s*480px/i)
  assert.match(appVue, /styles\/base\.css/)
  assert.match(appVue, /styles\/layout\.css/)
})

test('the design tokens expose responsive workspace primitives', () => {
  for (const token of [
    '--surface-content',
    '--surface-material',
    '--focus-ring',
    '--motion-press',
    '--motion-reveal',
    '--workspace-max',
    '--sidebar-width',
  ]) {
    assert.match(variablesCss, new RegExp(`${token}\\s*:`), `missing ${token}`)
  }
})

test('the base styles respect accessibility media preferences', () => {
  assert.match(baseCss, /prefers-reduced-motion/)
  assert.match(baseCss, /prefers-reduced-transparency/)
  assert.match(baseCss, /prefers-contrast\s*:\s*more/)
})
