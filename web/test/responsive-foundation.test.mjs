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
const layoutCss = readProjectFile('src/styles/layout.css')
const testSetup = readProjectFile('test/setup.js')

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

test('the design tokens use the reviewed material, motion, safe-area, and type values', () => {
  for (const declaration of [
    '--surface-material: rgba(255, 255, 255, 0.78)',
    '--surface-selected: #eaf3ff',
    '--border-subtle: rgba(29, 29, 31, 0.1)',
    '--border-strong: rgba(29, 29, 31, 0.2)',
    '--ease-out-fluid: cubic-bezier(0.23, 1, 0.32, 1)',
    '--safe-bottom: env(safe-area-inset-bottom, 0px)',
    '--type-display: clamp(2.25rem, 6vw, 4.5rem)',
    '--type-title: clamp(1.75rem, 3vw, 2.5rem)',
    '--type-headline: 1.125rem',
    '--type-caption: 0.875rem',
  ]) {
    assert.ok(variablesCss.includes(declaration), `missing exact declaration: ${declaration}`)
  }
})

test('adaptive columns are opt-in through sidebar and context modifiers', () => {
  assert.match(layoutCss, /\.adaptive-grid\s*\{[^}]*min-width:\s*0[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
  assert.match(layoutCss, /@media\s*\(min-width:\s*56\.25rem\)[\s\S]*?\.app-page__main\s*\{[^}]*padding:\s*2rem[^}]*\}[\s\S]*?\.adaptive-grid--sidebar\s*\{[^}]*grid-template-columns:\s*var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)[^}]*align-items:\s*start/s)
  assert.match(layoutCss, /@media\s*\(min-width:\s*75rem\)[\s\S]*?\.adaptive-grid--context\s*\{[^}]*grid-template-columns:\s*var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)\s+var\(--context-width\)[^}]*align-items:\s*start/s)
  assert.doesNotMatch(layoutCss, /@media\s*\(min-width:\s*(?:56\.25|75)rem\)[\s\S]*?\.adaptive-grid\s*\{/)
})

test('tap targets and press feedback have accessible pointer and motion behavior', () => {
  assert.match(baseCss, /\.tap-target\s*\{[^}]*min-width:\s*2\.75rem[^}]*min-height:\s*2\.75rem/s)
  for (const selector of ['button', '[href]', 'input', 'textarea', 'select']) {
    assert.ok(baseCss.includes(selector), `tap highlight selector missing: ${selector}`)
  }
  assert.match(baseCss, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)[\s\S]*?\.pressable:hover[^}]*transform:\s*translateY\(-1px\)/s)
  assert.match(baseCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.pressable:hover[\s\S]*?\.pressable:active[^}]*transform:\s*none/s)
})

test('material fallbacks use important solid surfaces and borders', () => {
  assert.match(baseCss, /prefers-reduced-transparency:[\s\S]*?\.material\s*\{[^}]*background:\s*#fff\s*!important[^}]*backdrop-filter:\s*none\s*!important/s)
  assert.match(baseCss, /prefers-contrast:\s*more[\s\S]*?\.material\s*\{[^}]*background:\s*#fff\s*!important[^}]*border:\s*1px\s+solid\s+#1d1d1f\s*!important/s)
})

test('Vant stubs preserve slots and icon accessibility semantics', () => {
  assert.match(testSetup, /'van-icon':\s*\{\s*template:\s*['"]<span aria-hidden="true"><slot \/><\/span>['"]/)
  assert.match(testSetup, /'van-loading':\s*\{\s*template:\s*['"]<span><slot \/><\/span>['"]/)
})
