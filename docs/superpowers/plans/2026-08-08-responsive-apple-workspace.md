# Responsive Apple Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Vue frontend as an Apple-inspired adaptive workspace that is fully usable on phones, tablets, and desktop computers without changing PF-001–PF-004 business or safety contracts.

**Architecture:** Keep routing, API calls, orchestration state, and Vant behavior intact. Add a small shared presentation layer (`AppPage`, status surfaces, layout/tokens), split the Agent workbench into stateless view components, and let CSS Grid progressively enhance layouts at 600px, 900px, and 1200px. Use Vitest/Vue Test Utils for component contracts and Playwright with the installed Microsoft Edge channel for real viewport verification.

**Tech Stack:** Vue 3.5, Vue Router 4, Vant 4, Vite 8, CSS custom properties/Grid, Node test runner, Vitest, Vue Test Utils, jsdom, Playwright.

---

## File map

### Shared foundation

- Modify `web/index.html`: allow zoom and replace the Vite favicon/title.
- Modify `web/src/App.vue`: remove the desktop phone shell and import shared layout styles.
- Modify `web/src/styles/variables.css`: semantic color, type, surface, focus, motion, and layout tokens.
- Create `web/src/styles/base.css`: reset, focus, motion/transparency/contrast fallbacks, touch target rules.
- Create `web/src/styles/layout.css`: page containers and four responsive layout tiers.
- Create `web/src/components/ui/AppPage.vue`: semantic page/header/main shell.
- Create `web/src/components/ui/StatusPanel.vue`: accessible loading/error/empty/status surface.

### Route pages

- Modify `web/src/views/Home.vue`: responsive portfolio-oriented landing surface.
- Modify `web/src/views/JdInput.vue`: semantic input method controls and shared shell.
- Modify `web/src/views/ResumeInput.vue`: semantic method controls, accessible upload, shared shell.
- Modify `web/src/views/Supplement.vue`: accessible item removal and adaptive form/actions.
- Modify `web/src/views/AgentWorkbench.vue`: retain orchestration, adopt adaptive grid, delegate presentation.
- Create `web/src/components/agent/AgentTaskNavigation.vue`: task navigation only.
- Create `web/src/components/agent/AgentEvidenceContext.vue`: requirement/fact/validation context only.
- Modify `web/src/views/AnalysisResult.vue`: overview/detail adaptive layout and accessible async states.
- Modify `web/src/views/History.vue`: semantic rows/cards and desktop density.
- Modify `web/src/views/GuidedDemo.vue`: responsive timeline/detail presentation and polite step announcements.

### Existing presentation components

- Modify `web/src/components/DimensionCard.vue`: button semantics, `aria-expanded`, transform-based progress.
- Modify `web/src/components/ScoreCircle.vue`: reduced-motion-safe score reveal.
- Modify `web/src/components/RadarChart.vue`: text alternative.
- Modify `web/src/components/SectionAnalysis.vue`: semantic expand action and readable type.
- Modify `web/src/components/RequirementItem.vue`: semantic status color tokens.

### Tests and browser evidence

- Modify `web/package.json` and `web/package-lock.json`: unit/E2E tools and scripts.
- Create `web/vitest.config.js` and `web/test/setup.js`.
- Create `web/test/responsive-foundation.test.mjs`.
- Create `web/test/ui/AppPage.spec.js`, `StatusPanel.spec.js`.
- Create `web/test/views/Home.spec.js`, `InputFlow.spec.js`, `AgentWorkbench.spec.js`, `ResultHistory.spec.js`, `GuidedDemo.spec.js`.
- Create `web/playwright.config.js`.
- Create `web/e2e/responsive-workspace.spec.js`.
- Create `web/e2e/fixtures.js` with synthetic, non-personal data.
- Create `web/e2e/screenshots/.gitkeep`; generated screenshots stay ignored.

---

### Task 1: Establish test infrastructure and responsive foundations

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: `web/index.html`
- Modify: `web/src/App.vue`
- Modify: `web/src/styles/variables.css`
- Create: `web/src/styles/base.css`
- Create: `web/src/styles/layout.css`
- Create: `web/test/responsive-foundation.test.mjs`
- Create: `web/vitest.config.js`
- Create: `web/test/setup.js`

- [ ] **Step 1: Write the failing foundation contract test**

Create `web/test/responsive-foundation.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('viewport permits zoom and the desktop phone shell is removed', async () => {
  const [html, app] = await Promise.all([
    read('../index.html'),
    read('../src/App.vue'),
  ])
  assert.doesNotMatch(html, /maximum-scale|user-scalable=no/)
  assert.doesNotMatch(app, /max-width:\s*480px/)
  assert.match(app, /base\.css/)
  assert.match(app, /layout\.css/)
})

test('global tokens cover material, focus, motion and workspace sizes', async () => {
  const [tokens, base] = await Promise.all([
    read('../src/styles/variables.css'),
    read('../src/styles/base.css'),
  ])
  for (const token of [
    '--surface-content',
    '--surface-material',
    '--focus-ring',
    '--motion-press',
    '--motion-reveal',
    '--workspace-max',
    '--sidebar-width',
  ]) assert.match(tokens, new RegExp(token))
  assert.match(base, /prefers-reduced-motion/)
  assert.match(base, /prefers-reduced-transparency/)
  assert.match(base, /prefers-contrast:\s*more/)
})
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
cd web
node --test test/responsive-foundation.test.mjs
```

Expected: FAIL because zoom is disabled, `App.vue` contains `max-width: 480px`, and the new imports/tokens do not exist.

- [ ] **Step 3: Install component and browser test tooling**

Run:

```powershell
cd web
npm.cmd install --save-dev vitest @vue/test-utils jsdom @playwright/test
```

Update scripts in `web/package.json` to exactly:

```json
{
  "test": "node --test test/*.test.mjs && vitest run",
  "test:contracts": "node --test test/*.test.mjs",
  "test:unit": "vitest run",
  "test:e2e": "playwright test",
  "build": "vite build"
}
```

Create `web/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.spec.js'],
  },
})
```

Create `web/test/setup.js`:

```js
import { config } from '@vue/test-utils'

config.global.stubs = {
  'van-icon': { template: '<span aria-hidden="true"><slot /></span>' },
  'van-loading': { template: '<span><slot /></span>' },
}
```

- [ ] **Step 4: Implement tokens, base rules and responsive containers**

Replace the viewport line in `web/index.html` with:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Change the title to `精投助手｜证据驱动的 AI 求职教练` and remove the `/vite.svg` favicon line.

Extend `variables.css` with this token block while retaining the existing compatibility aliases:

```css
:root {
  --surface-page: #f5f5f7;
  --surface-content: #ffffff;
  --surface-subtle: #f0f1f3;
  --surface-material: rgba(255, 255, 255, 0.78);
  --surface-selected: #eaf3ff;
  --border-subtle: rgba(29, 29, 31, 0.1);
  --border-strong: rgba(29, 29, 31, 0.2);
  --focus-ring: 0 0 0 3px rgba(0, 113, 227, 0.28);
  --motion-press: 120ms;
  --motion-reveal: 180ms;
  --motion-layout: 260ms;
  --ease-out-fluid: cubic-bezier(0.23, 1, 0.32, 1);
  --workspace-max: 73.75rem;
  --reading-max: 45rem;
  --sidebar-width: 18rem;
  --context-width: 19rem;
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --type-display: clamp(2.25rem, 6vw, 4.5rem);
  --type-title: clamp(1.75rem, 3vw, 2.5rem);
  --type-headline: 1.125rem;
  --type-body: 1rem;
  --type-caption: 0.875rem;
}
```

Create `base.css` with exact global behavior:

```css
*, *::before, *::after { box-sizing: border-box; }
html { font: 100%/1.5 var(--font-family); text-size-adjust: 100%; }
body { margin: 0; min-width: 20rem; color: var(--text-primary); background: var(--surface-page); }
button, input, textarea, select { font: inherit; }
button, [href], input, textarea, select { -webkit-tap-highlight-color: transparent; }
button:focus-visible, [href]:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.tap-target { min-width: 2.75rem; min-height: 2.75rem; }
.pressable { transition: transform var(--motion-press) ease-out, opacity var(--motion-press) ease-out; }
.pressable:active { transform: scale(0.98); opacity: 0.86; }
@media (hover: hover) and (pointer: fine) { .pressable:hover { transform: translateY(-1px); } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
  .pressable:active, .pressable:hover { transform: none; }
}
@media (prefers-reduced-transparency: reduce) { .material { background: #fff !important; backdrop-filter: none !important; } }
@media (prefers-contrast: more) { .material { background: #fff !important; border: 1px solid #1d1d1f !important; } }
```

Create `layout.css`:

```css
.app-page { min-height: 100svh; background: var(--surface-page); }
.app-page__main { width: min(100%, var(--workspace-max)); margin-inline: auto; padding: 1rem; }
.reading-column { width: min(100%, var(--reading-max)); margin-inline: auto; }
.adaptive-grid { display: grid; gap: 1rem; min-width: 0; }
@media (min-width: 37.5rem) { .app-page__main { padding: 1.5rem; } }
@media (min-width: 56.25rem) {
  .app-page__main { padding: 2rem; }
  .adaptive-grid--sidebar { grid-template-columns: var(--sidebar-width) minmax(0, 1fr); align-items: start; }
}
@media (min-width: 75rem) {
  .adaptive-grid--context { grid-template-columns: var(--sidebar-width) minmax(0, 1fr) var(--context-width); align-items: start; }
}
```

Import `base.css` and `layout.css` from `App.vue`, remove the 480px media rule, and keep only the router view plus Vant variable overrides.

- [ ] **Step 5: Verify GREEN and the existing contract suite**

Run:

```powershell
cd web
node --test test/responsive-foundation.test.mjs
npm.cmd run test:contracts
npm.cmd run build
```

Expected: foundation tests pass, existing 4 contracts pass, and Vite exits 0.

- [ ] **Step 6: Commit Task 1**

```powershell
git add web/package.json web/package-lock.json web/vitest.config.js web/test/setup.js web/test/responsive-foundation.test.mjs web/index.html web/src/App.vue web/src/styles/variables.css web/src/styles/base.css web/src/styles/layout.css
git commit -m "feat: establish responsive Apple design foundations"
```

---

### Task 2: Build the shared page and state surfaces

**Files:**
- Create: `web/src/components/ui/AppPage.vue`
- Create: `web/src/components/ui/StatusPanel.vue`
- Create: `web/test/ui/AppPage.spec.js`
- Create: `web/test/ui/StatusPanel.spec.js`

- [ ] **Step 1: Write failing component tests**

Create `web/test/ui/AppPage.spec.js`:

```js
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppPage from '../../src/components/ui/AppPage.vue'

describe('AppPage', () => {
  it('provides labelled chrome and emits back', async () => {
    const wrapper = mount(AppPage, { props: { title: '输入简历', back: true, description: '第二步' } })
    expect(wrapper.get('main').attributes('aria-labelledby')).toBe('page-title')
    expect(wrapper.get('#page-title').text()).toBe('输入简历')
    expect(wrapper.get('[aria-label="返回上一页"]')).toBeTruthy()
    await wrapper.get('[aria-label="返回上一页"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})
```

Create `web/test/ui/StatusPanel.spec.js`:

```js
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StatusPanel from '../../src/components/ui/StatusPanel.vue'

describe('StatusPanel', () => {
  it('announces blocking errors and emits retry', async () => {
    const wrapper = mount(StatusPanel, { props: { kind: 'error', title: '加载失败', retryable: true } })
    expect(wrapper.attributes('role')).toBe('alert')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('uses polite status semantics for loading', () => {
    const wrapper = mount(StatusPanel, { props: { kind: 'loading', title: '正在加载' } })
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-live')).toBe('polite')
  })
})
```

- [ ] **Step 2: Run and verify RED**

Run `cd web; npm.cmd run test:unit -- test/ui/AppPage.spec.js test/ui/StatusPanel.spec.js`.

Expected: FAIL because both components are missing.

- [ ] **Step 3: Implement `AppPage.vue`**

```vue
<template>
  <div class="app-page">
    <header class="app-chrome material">
      <div class="app-chrome__inner">
        <button v-if="back" class="icon-button tap-target pressable" type="button" aria-label="返回上一页" @click="$emit('back')">‹</button>
        <div class="app-chrome__titles">
          <p v-if="eyebrow" class="app-chrome__eyebrow">{{ eyebrow }}</p>
          <h1 id="page-title">{{ title }}</h1>
          <p v-if="description" class="app-chrome__description">{{ description }}</p>
        </div>
        <div class="app-chrome__actions"><slot name="actions" /></div>
      </div>
    </header>
    <main class="app-page__main" aria-labelledby="page-title"><slot /></main>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  back: { type: Boolean, default: false },
})
defineEmits(['back'])
</script>

<style scoped>
.app-chrome { position: sticky; top: 0; z-index: 20; background: var(--surface-material); backdrop-filter: blur(24px) saturate(160%); }
.app-chrome__inner { width: min(100%, var(--workspace-max)); min-height: 4.5rem; margin: auto; padding: .75rem 1rem; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .75rem; align-items: center; }
.icon-button { border: 0; border-radius: 50%; background: var(--surface-subtle); color: var(--text-primary); font-size: 1.75rem; line-height: 1; }
.app-chrome__titles { min-width: 0; }
.app-chrome__eyebrow, .app-chrome__description { margin: 0; color: var(--text-secondary); font-size: var(--type-caption); }
h1 { margin: 0; font-size: var(--type-headline); line-height: 1.25; letter-spacing: -.01em; }
@media (min-width: 56.25rem) { .app-chrome__inner { padding: 1rem 2rem; } h1 { font-size: 1.375rem; } }
</style>
```

- [ ] **Step 4: Implement `StatusPanel.vue`**

```vue
<template>
  <section class="status-panel" :class="`status-panel--${kind}`" :role="role" :aria-live="live">
    <h2>{{ title }}</h2>
    <p v-if="message">{{ message }}</p>
    <button v-if="retryable" type="button" class="status-panel__retry pressable" @click="$emit('retry')">重试</button>
  </section>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  kind: { type: String, default: 'empty' },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  retryable: { type: Boolean, default: false },
})
defineEmits(['retry'])
const role = computed(() => props.kind === 'error' ? 'alert' : 'status')
const live = computed(() => props.kind === 'error' ? 'assertive' : 'polite')
</script>

<style scoped>
.status-panel { padding: 2rem; border-radius: var(--radius-lg); background: var(--surface-content); text-align: center; border: 1px solid var(--border-subtle); }
h2 { margin: 0; font-size: var(--type-headline); } p { margin: .5rem 0 0; color: var(--text-secondary); }
.status-panel__retry { min-height: 2.75rem; margin-top: 1rem; padding: 0 1.25rem; border: 0; border-radius: 999px; background: var(--color-primary); color: #fff; }
</style>
```

- [ ] **Step 5: Verify GREEN and commit**

Run `cd web; npm.cmd run test:unit -- test/ui/AppPage.spec.js test/ui/StatusPanel.spec.js`.

Expected: 4 assertions across 3 tests pass.

```powershell
git add web/src/components/ui web/test/ui
git commit -m "feat: add accessible adaptive page surfaces"
```

---

### Task 3: Rebuild Home and the three input pages

**Files:**
- Modify: `web/src/views/Home.vue`
- Modify: `web/src/views/JdInput.vue`
- Modify: `web/src/views/ResumeInput.vue`
- Modify: `web/src/views/Supplement.vue`
- Create: `web/test/views/Home.spec.js`
- Create: `web/test/views/InputFlow.spec.js`

- [ ] **Step 1: Write failing route-view tests**

Create tests that mount pages with `AppPage`, stub API modules, and assert:

```js
// web/test/views/Home.spec.js
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
vi.mock('../../src/api', () => ({ historyApi: { list: vi.fn().mockResolvedValue({ list: [] }) } }))
import Home from '../../src/views/Home.vue'

describe('Home', () => {
  it('presents the evidence-driven value and two explicit routes', () => {
    const wrapper = mount(Home, { global: { mocks: { $router: { push: vi.fn() } } } })
    expect(wrapper.text()).toContain('证据驱动')
    expect(wrapper.text()).toContain('事实安全')
    expect(wrapper.findAll('button').length).toBeGreaterThanOrEqual(2)
  })
})
```

```js
// web/test/views/InputFlow.spec.js
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
vi.mock('../../src/api', () => ({
  jdApi: { create: vi.fn(), ocr: vi.fn() }, resumeApi: { create: vi.fn(), upload: vi.fn() },
  supplementApi: { upsert: vi.fn() }, agentSessionApi: { create: vi.fn(), start: vi.fn() },
}))
import ResumeInput from '../../src/views/ResumeInput.vue'
import Supplement from '../../src/views/Supplement.vue'

describe('input flow accessibility and persistence', () => {
  it('uses buttons for resume input methods', () => {
    const wrapper = mount(ResumeInput, { global: { mocks: { $route: { query: { jdId: 'jd-1' } }, $router: { push: vi.fn() } } } })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].attributes('aria-selected')).toBe('true')
  })
  it('labels supplement remove controls with the item title', async () => {
    const source = await readFile(new URL('../../src/views/Supplement.vue', import.meta.url), 'utf8')
    expect(source).toContain(':aria-label="`删除经历：${item.title}`"')
  })
})
```

- [ ] **Step 2: Run and verify RED**

Run `cd web; npm.cmd run test:unit -- test/views/Home.spec.js test/views/InputFlow.spec.js`.

Expected: FAIL because old pages do not expose the new value copy, tabs, or accessible controls.

- [ ] **Step 3: Implement shared layout and semantic controls**

For each page:

- Replace its outer root/nav with `AppPage`, preserving `$router.back()`.
- Put input content inside `.reading-column`.
- Replace method `div` elements with:

```vue
<div class="method-tabs" role="tablist" aria-label="输入方式">
  <button v-for="option in methods" :key="option.value" type="button" role="tab"
    class="method-tab pressable" :class="{ active: method === option.value }"
    :aria-selected="method === option.value" @click="method = option.value">
    {{ option.label }}
  </button>
</div>
```

In `ResumeInput.vue`, make the upload surface a `<label for="resume-file">` with the hidden input still keyboard reachable via the label; retain drop events on the label. In `Supplement.vue`, replace the cross icon with:

```vue
<button type="button" class="icon-button tap-target pressable" :aria-label="`删除经历：${item.title}`" @click="removeItem(idx)">
  <van-icon name="cross" aria-hidden="true" />
</button>
```

Keep `savePendingState()`, `skip === '1'`, `router.replace`, OCR confirmation, accepted file types, and every existing API payload unchanged.

For `Home.vue`, use this desktop structure without changing history loading:

```vue
<div class="home-grid">
  <section class="home-hero">
    <p class="eyebrow">证据驱动的 AI 求职教练</p>
    <h2>让每次简历修改都有依据，也经得起面试追问。</h2>
    <p>连接岗位要求、真实经历、事实审核和修改验证。</p>
    <div class="hero-actions">
      <button class="hero-btn pressable" type="button" @click="startNewAnalysis">开始新分析</button>
      <button class="demo-btn pressable" type="button" @click="$router.push('/demo')">查看引导演示</button>
    </div>
  </section>
  <section class="proof-rail" aria-label="核心闭环">
    <ol><li>找到关键缺口</li><li>确认真实事实</li><li>验证修改效果</li></ol>
  </section>
</div>
```

Use `grid-template-columns: minmax(0, 1.2fr) minmax(18rem, .8fr)` from 900px upward and collapse to one column below it.

- [ ] **Step 4: Verify the input-flow semantics and persistence contracts GREEN**

Run:

```powershell
cd web
npm.cmd run test:unit -- test/views/Home.spec.js test/views/InputFlow.spec.js
npm.cmd run test:contracts
```

Expected: all route-view tests and 4 existing contracts pass.

- [ ] **Step 5: Commit Task 3**

```powershell
git add web/src/views/Home.vue web/src/views/JdInput.vue web/src/views/ResumeInput.vue web/src/views/Supplement.vue web/test/views/Home.spec.js web/test/views/InputFlow.spec.js
git commit -m "feat: adapt landing and input flow across viewports"
```

---

### Task 4: Split and adapt the Agent workbench

**Files:**
- Create: `web/src/components/agent/AgentTaskNavigation.vue`
- Create: `web/src/components/agent/AgentEvidenceContext.vue`
- Modify: `web/src/views/AgentWorkbench.vue`
- Create: `web/test/views/AgentWorkbench.spec.js`

- [ ] **Step 1: Write failing component and orchestration tests**

The test fixture must include a recommended task, requirement, fact, candidate verification, and validation record. Assert:

```js
expect(wrapper.get('[aria-label="优化任务"]')).toBeTruthy()
expect(wrapper.get('[aria-current="step"]').text()).toContain('用户研究')
expect(wrapper.get('[aria-label="证据与审核上下文"]')).toBeTruthy()
expect(wrapper.text()).toContain('系统未将该 AI 内容标记为可采用')
```

Also mock `agentSessionApi.get()` and assert no child component calls the API directly; only `AgentWorkbench.vue` receives the session.

- [ ] **Step 2: Run and verify RED**

Run `cd web; npm.cmd run test:unit -- test/views/AgentWorkbench.spec.js`.

Expected: FAIL because the navigation/context components and landmark labels do not exist.

- [ ] **Step 3: Implement stateless task navigation**

Create `AgentTaskNavigation.vue` with props `tasks`, `requirements`, `selectedId`; emit `select`. Use buttons with `aria-current="step"` for the selected task and human-readable state labels. Do not import the API module.

Core template:

```vue
<nav class="task-navigation material" aria-label="优化任务">
  <h2>优化任务</h2>
  <button v-for="item in tasks" :key="item.id" type="button" class="task-row pressable"
    :aria-current="item.id === selectedId ? 'step' : undefined" @click="$emit('select', item)">
    <span>{{ item.recommended ? '推荐 · ' : '' }}{{ requirementText(item) }}</span>
    <small>{{ stateLabel(item.state) }}</small>
  </button>
</nav>
```

- [ ] **Step 4: Implement stateless evidence context**

Create `AgentEvidenceContext.vue` with props `requirement`, `facts`, `validation`. It renders requirement text, cited facts, and the latest validation status in an `<aside aria-label="证据与审核上下文">`. It must show `unavailable` and `blocked` explicitly and never map them to passed styling.

- [ ] **Step 5: Recompose `AgentWorkbench.vue`**

Keep every existing script function and API payload. Replace the page shell and outer content with the following landmarks. In the current template, replace the opening `<template v-if="task">` immediately before the questioning section with `<section v-if="task" class="agent-stage" aria-label="当前优化任务">`. Replace that template's matching closing `</template>` immediately after the completed-task section with `</section>`. Do not change the enclosed conditions, handlers, labels, or API-bound values.

```vue
<AppPage title="证据驱动简历优化" description="确认事实，再决定如何表达" back @back="$router.back()">
  <StatusPanel v-if="loading" kind="loading" title="正在建立证据匹配…" />
  <StatusPanel v-else-if="error" kind="error" title="会话加载失败" retryable @retry="load" />
  <div v-else class="agent-layout adaptive-grid adaptive-grid--sidebar adaptive-grid--context">
    <AgentTaskNavigation :tasks="session.tasks" :requirements="session.requirements" :selected-id="task?.id" @select="select" />
    <section v-if="task" class="agent-stage" aria-label="当前优化任务"></section>
    <AgentEvidenceContext v-if="task" :requirement="requirement(task)" :facts="facts(task)" :validation="latestValidation(task)" />
  </div>
</AppPage>
```

At widths below 1200px, move the evidence context below the stage; below 900px, all three regions are single-column. Sticky task/context panels are allowed only at desktop widths and use `max-height: calc(100svh - 7rem); overflow: auto`.

Preserve all state values, fact confirmation, retry, `return_control`, editing, validation, `completed_with_risk`, and handoff wording exactly.

- [ ] **Step 6: Verify GREEN and full Agent contracts**

Run:

```powershell
cd web
npm.cmd run test:unit -- test/views/AgentWorkbench.spec.js
cd ..\server
npm.cmd test -- --test-name-pattern="Agent|PF-001|PF-003|PF-004"
```

Expected: frontend Agent test passes; focused server tests exit 0 without business regressions.

- [ ] **Step 7: Commit Task 4**

```powershell
git add web/src/components/agent web/src/views/AgentWorkbench.vue web/test/views/AgentWorkbench.spec.js
git commit -m "feat: build adaptive evidence-driven Agent workspace"
```

---

### Task 5: Adapt results, history and legacy components

**Files:**
- Modify: `web/src/views/AnalysisResult.vue`
- Modify: `web/src/views/History.vue`
- Modify: `web/src/components/DimensionCard.vue`
- Modify: `web/src/components/ScoreCircle.vue`
- Modify: `web/src/components/RadarChart.vue`
- Modify: `web/src/components/SectionAnalysis.vue`
- Modify: `web/src/components/RequirementItem.vue`
- Create: `web/test/views/ResultHistory.spec.js`

- [ ] **Step 1: Write failing accessibility/layout tests**

Mount representative result/history components and assert:

```js
expect(result.find('[aria-label="分析概览"]').exists()).toBe(true)
expect(result.find('[aria-label="分析详情"]').exists()).toBe(true)
expect(radar.find('[role="img"]').attributes('aria-label')).toContain('技能匹配')
expect(dimension.get('button').attributes('aria-expanded')).toBe('false')
expect(history.findAll('button[aria-label^="删除分析"]').length).toBe(1)
```

- [ ] **Step 2: Run and verify RED**

Run `cd web; npm.cmd run test:unit -- test/views/ResultHistory.spec.js`.

Expected: FAIL on missing landmarks, text alternative, button semantics, and labels.

- [ ] **Step 3: Implement the adaptive result grid**

Use `AppPage` and `StatusPanel`. Keep polling, retry, tabs, update events, and API calls unchanged. Rename the existing completed-result wrapper to `result-layout`. Add `aria-label="分析概览"` to the existing `score-section`, and add `aria-label="分析详情"` to the existing `result-tabs`. At desktop widths, place `score-section` in the first grid column and make `result-tabs` span the second column; keep `bottom-actions` in the second column below the tabs. Do not duplicate or remove any result node.

```vue
<div v-else-if="result" class="result-layout">
  <div class="score-section" aria-label="分析概览"></div>
  <van-tabs v-model="activeTab" class="result-tabs" aria-label="分析详情" sticky />
  <div class="bottom-actions"></div>
</div>
```

The empty tags above identify the exact existing nodes to relabel and position; retain their current children and slots verbatim.

CSS:

```css
.result-layout { display: grid; gap: 1rem; }
@media (min-width: 56.25rem) { .result-layout { grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr); align-items: start; } .result-overview { position: sticky; top: 6.5rem; } }
```

- [ ] **Step 4: Fix legacy component semantics and motion**

- `DimensionCard`: make header a button, add `aria-expanded`, animate progress with `transform: scaleX()` from the left for 300ms.
- `ScoreCircle`: use a 300ms reveal and render the final value immediately under reduced motion.
- `RadarChart`: wrap SVG in `role="img"` and compute an `aria-label` summary such as `技能匹配 80 分，经验匹配 70 分`.
- `SectionAnalysis`: replace clickable expansion container with a button and raise 11px/12px essential text to at least `var(--type-caption)`.
- `RequirementItem`: replace hard-coded colors with semantic token classes and retain text labels.

- [ ] **Step 5: Implement semantic adaptive history rows**

Use a `<button class="history-row__open">` for opening each analysis and separately labelled edit/delete buttons. Desktop uses two columns from 900px unless the row contains enough metadata for a table-like single column. Preserve rename/delete APIs, confirmation, and analytics.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```powershell
cd web
npm.cmd run test:unit -- test/views/ResultHistory.spec.js
npm.cmd run test:contracts
npm.cmd run build
```

Expected: unit tests pass, 4 contract tests pass, build exits 0.

```powershell
git add web/src/views/AnalysisResult.vue web/src/views/History.vue web/src/components/DimensionCard.vue web/src/components/ScoreCircle.vue web/src/components/RadarChart.vue web/src/components/SectionAnalysis.vue web/src/components/RequirementItem.vue web/test/views/ResultHistory.spec.js
git commit -m "feat: adapt result and history workspaces"
```

---

### Task 6: Rebuild GuidedDemo as a responsive explanatory timeline

**Files:**
- Modify: `web/src/views/GuidedDemo.vue`
- Modify: `web/test/demo.test.mjs`
- Create: `web/test/views/GuidedDemo.spec.js`

- [ ] **Step 1: Extend failing demo tests**

Add source-independent component assertions:

```js
expect(wrapper.get('[aria-label="演示进度"]').exists()).toBe(true)
expect(wrapper.get('[aria-live="polite"]').text()).toContain('岗位要求')
await wrapper.get('[data-testid="demo-next"]').trigger('click')
expect(wrapper.get('[aria-live="polite"]').text()).toContain('简历事实')
```

Retain the Node contract that only `fixture.session` supplies business data and that GuidedDemo page views are excluded.

- [ ] **Step 2: Run and verify RED**

Run `cd web; npm.cmd run test:unit -- test/views/GuidedDemo.spec.js`.

Expected: FAIL because the timeline, announcement and test IDs do not exist.

- [ ] **Step 3: Implement mobile step flow and desktop timeline/detail**

Use `AppPage`. Render all step titles as an ordered progress list; only the active/completed portions are emphasized. Render current detail inside `aria-live="polite"`. Keep `session`, `task`, `requirement`, `fact`, and `validation` derivation exactly as it is.

Desktop CSS:

```css
.demo-layout { display: grid; gap: 1rem; }
@media (min-width: 56.25rem) { .demo-layout { grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr); } .demo-progress { position: sticky; top: 6.5rem; align-self: start; } }
.demo-detail { animation: reveal var(--motion-reveal) var(--ease-out-fluid); }
@keyframes reveal { from { opacity: 0; transform: translateY(.375rem); } to { opacity: 1; transform: none; } }
```

Global reduced-motion rules must neutralize the transform/animation. `restart()` continues to set `current.value = 0`.

- [ ] **Step 4: Verify GREEN and demo isolation**

Run:

```powershell
cd web
npm.cmd run test:unit -- test/views/GuidedDemo.spec.js
npm.cmd run test:contracts
cd ..\server
npm.cmd test -- --test-name-pattern="PF-004|fixture|GuidedDemo"
```

Expected: all tests exit 0; no demo API or analytics regression.

- [ ] **Step 5: Commit Task 6**

```powershell
git add web/src/views/GuidedDemo.vue web/test/demo.test.mjs web/test/views/GuidedDemo.spec.js
git commit -m "feat: create responsive guided evidence demo"
```

---

### Task 7: Add real browser viewport and accessibility evidence

**Files:**
- Create: `web/playwright.config.js`
- Create: `web/e2e/fixtures.js`
- Create: `web/e2e/responsive-workspace.spec.js`
- Create: `web/e2e/screenshots/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing Playwright suite**

Create `web/playwright.config.js`:

```js
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'msedge', headless: true },
  webServer: { command: 'npm.cmd run dev -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
})
```

Create synthetic fixtures for history, analysis and Agent session in `web/e2e/fixtures.js`; use only invented role descriptions and the existing demo fixture shape.

Create tests that:

1. Mock `/api/analysis*` and `/api/agent-sessions/*` with `page.route()`.
2. Open `/`, `/jd-input`, `/resume-input`, `/supplement`, `/agent/session-1`, `/result/analysis-1`, `/history`, and `/demo`.
3. Assert `document.documentElement.scrollWidth <= window.innerWidth`.
4. Assert the Agent desktop project has at least two rendered grid columns and phone has one.
5. Tab through the first five controls and require a visible focus indicator.
6. Run `/demo` under reduced motion and confirm no transform animation persists.
7. Open the desktop Agent and result routes, create a CDP session with `page.context().newCDPSession(page)`, then call `client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })`; require the active task, primary action, error/status region, and back control to remain reachable without clipped text.
8. Inject a synthetic requirement and fact longer than 120 Chinese characters; require its bounding box to remain within the owning content column.
9. Save screenshots to `e2e/screenshots/<project>-<route>.png` only when `UPDATE_SCREENSHOTS=1`.

- [ ] **Step 2: Run and verify RED**

Run `cd web; npm.cmd run test:e2e`.

Expected: FAIL until every page has been integrated and route mocks/selectors are correct. A missing Edge channel is an environment failure; confirm `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` exists before changing the plan.

- [ ] **Step 3: Fix only observed browser defects**

For each failure, add a focused unit regression when the defect is semantic or state-based, then adjust layout CSS. Do not loosen overflow, focus, or column assertions to make the test pass. Do not add fixed widths that only satisfy the three sample viewports.

- [ ] **Step 4: Verify GREEN and capture evidence**

Run:

```powershell
cd web
npm.cmd run test:e2e
$env:UPDATE_SCREENSHOTS='1'; npm.cmd run test:e2e; Remove-Item Env:UPDATE_SCREENSHOTS
```

Expected: 8 route checks in each of 3 projects, 24 route checks total; screenshots contain no real personal data.

Add to `.gitignore`:

```gitignore
web/test-results/
web/playwright-report/
web/e2e/screenshots/*.png
!web/e2e/screenshots/.gitkeep
```

- [ ] **Step 5: Commit Task 7**

```powershell
git add web/playwright.config.js web/e2e/fixtures.js web/e2e/responsive-workspace.spec.js web/e2e/screenshots/.gitkeep .gitignore
git commit -m "test: verify responsive workspace in real browsers"
```

---

### Task 8: Integration audit, cross-review and final verification

**Files:**
- Modify only files required by verified review findings.
- Read: `docs/superpowers/specs/2026-08-08-responsive-apple-workspace-design.md`

- [ ] **Step 1: Run a requirement-by-requirement specification audit**

Create an audit checklist from the eight acceptance criteria in the design spec. For every item, record the file/test/browser output that proves it. Treat missing evidence as incomplete.

- [ ] **Step 2: Dispatch two independent reviewers**

Reviewer A checks business contract preservation: route/query order, localStorage recovery, `skip`, user ID, Agent states, risk semantics, error compatibility, demo isolation.

Reviewer B checks Apple design and accessibility: responsive hierarchy, materials, typography, focus, touch targets, reduced motion/transparency/contrast, unnecessary animation, and desktop efficiency.

Both reviewers return Critical/Important/Minor findings with file and line references. Fix all Critical and Important issues with a failing regression test first.

- [ ] **Step 3: Run fresh full verification**

Run exactly:

```powershell
cd server
npm.cmd test

cd ..\web
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build

cd ..
git diff --check
git status --short
```

Run PF-002 evaluation only after first copying the two report files to a validated temporary backup, because the current npm script hard-codes `server/evaluations/reports`. After evaluation, compare outputs and retain the intentional report version; never overwrite unknown user changes silently.

Expected fresh baseline:

- Server: 114 tests plus any added tests, 0 failures.
- PF-002: 42/42, 0 failures.
- Frontend contracts and unit tests: 0 failures.
- Playwright: all phone/tablet/desktop route checks pass.
- Vite build: exit 0 with no warnings introduced by the refactor.
- `git diff --check`: no whitespace errors.

- [ ] **Step 4: Commit verified review fixes**

```powershell
git add -u -- web/src web/test web/e2e web/playwright.config.js
git diff --cached --check
git commit -m "fix: close responsive workspace review findings"
```

Omit this commit when reviewers produce no actionable changes. Never include `server/evaluations/reports/*` unless their exact content is intentionally reviewed and approved.

---

## Completion handoff

After this plan passes, the responsive frontend objective is complete but the broader V0.1 job-portfolio release still requires a separate plan for the expanded PF-002 report, Agent diagram, product case study, three résumé bullets, README rewrite, deployment smoke test, and—only if real résumé upload remains public—MongoDB ownership migration/index verification.
