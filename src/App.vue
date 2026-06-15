<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, h } from 'vue'
import data from './icons.json'

const ICONS = Object.freeze(data.icons)
const PER_PAGE = 200
const bodyByName = new Map(ICONS.map(i => [i.n, i.b]))

/* -------------------------------------------------- inline glyph renderer */
// Functional component that draws any icon from the set by name. Used for the
// gallery cells and for the toolbar's own icons (sun / moon / monitor ...).
const Glyph = (props) =>
  h('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    class: ['fui', `fui-${props.name}`],
    innerHTML: bodyByName.get(props.name) || '',
  })
Glyph.props = ['name']

/* ----------------------------------------------------------------- search */
const query = ref('')
const page = ref(1)
const searchEl = ref(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return ICONS
  const terms = q.split(/\s+/)
  return ICONS.filter(i => {
    const hay = `${i.n} ${i.t}`
    return terms.every(t => hay.includes(t))
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PER_PAGE)))
const pageIcons = computed(() => {
  const start = (page.value - 1) * PER_PAGE
  return filtered.value.slice(start, start + PER_PAGE)
})

watch(() => query.value, () => { page.value = 1 })
watch(totalPages, tp => { if (page.value > tp) page.value = tp })

// Compact pagination model: 1 … 4 5 6 … 42
const pageList = computed(() => {
  const tp = totalPages.value
  const cur = page.value
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1)
  const want = [...new Set([1, 2, cur - 1, cur, cur + 1, tp - 1, tp])]
    .filter(p => p >= 1 && p <= tp)
    .sort((a, b) => a - b)
  const out = []
  let prev = 0
  for (const p of want) {
    if (p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
})

function go(p) {
  if (typeof p !== 'number') return
  page.value = Math.min(Math.max(1, p), totalPages.value)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const rangeStart = computed(() => (filtered.value.length ? (page.value - 1) * PER_PAGE + 1 : 0))
const rangeEnd = computed(() => Math.min(page.value * PER_PAGE, filtered.value.length))

/* ------------------------------------------------------------------ theme */
const themeMode = ref('system') // 'system' | 'light' | 'dark'
let mql
const themeOptions = [
  { value: 'system', icon: 'monitor', label: 'System' },
  { value: 'light', icon: 'sun', label: 'Light' },
  { value: 'dark', icon: 'moon', label: 'Dark' },
]

function applyTheme() {
  const resolved =
    themeMode.value === 'system' ? (mql && mql.matches ? 'dark' : 'light') : themeMode.value
  document.documentElement.dataset.theme = resolved
}
function setTheme(mode) {
  themeMode.value = mode
}
function onSystemChange() {
  if (themeMode.value === 'system') applyTheme()
}
watch(themeMode, mode => {
  try { localStorage.setItem('fui-theme', mode) } catch (e) { /* ignore */ }
  applyTheme()
})

/* ------------------------------------------------------------------ modal */
const active = ref(null)
function openIcon(icon) { active.value = icon }
function closeModal() { active.value = null }

/* ------------------------------------------------------------ code output */
const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

const SVG_OPEN_JSX =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"'

// Convert hyphenated SVG attributes to camelCase for JSX (e.g. stroke-width).
function toJsx(body) {
  return body.replace(
    /\s([a-z]+(?:-[a-z]+)+)=/g,
    (_, attr) => ' ' + attr.replace(/-([a-z])/g, (_m, c) => c.toUpperCase()) + '='
  )
}

function snippets(icon) {
  if (!icon) return []
  return [
    {
      key: 'svg',
      label: 'SVG (HTML)',
      lang: 'html',
      code: `${SVG_OPEN} class="fui fui-${icon.n}">${icon.b}</svg>`,
    },
    {
      key: 'vue',
      label: 'Vue',
      lang: 'vue',
      code:
        `<` + `script setup>\n` +
        `import { ${icon.p} } from '@rukkiecodes/icons'\n` +
        `import { FIcon } from '@rukkiecodes/vue'\n` +
        `<\/script>\n\n` +
        `<template>\n  <FIcon :icon="${icon.p}" />\n<\/template>`,
    },
    {
      key: 'jsx',
      label: 'JSX / React',
      lang: 'jsx',
      code:
        `export const ${icon.p}Icon = (props) => (\n` +
        `  ${SVG_OPEN_JSX} className="fui fui-${icon.n}" {...props}>\n` +
        `    ${toJsx(icon.b)}\n` +
        `  </svg>\n)`,
    },
    {
      key: 'name',
      label: 'Name',
      lang: 'text',
      code: icon.n,
    },
  ]
}

const activeSnippets = computed(() => snippets(active.value))

/* --------------------------------------------------------------- clipboard */
const copiedKey = ref('')
let copiedTimer
async function copy(text, key) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    copiedKey.value = key
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copiedKey.value = '' }, 1600)
  } catch (e) {
    /* ignore */
  }
}

/* ---------------------------------------------------------------- keyboard */
function onKey(e) {
  if (e.key === 'Escape' && active.value) {
    closeModal()
    return
  }
  if (e.key === '/' && document.activeElement !== searchEl.value && !active.value) {
    e.preventDefault()
    searchEl.value && searchEl.value.focus()
  }
}

/* ----------------------------------------------------------------- lifecycle */
onMounted(() => {
  try {
    const stored = localStorage.getItem('fui-theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') themeMode.value = stored
  } catch (e) { /* ignore */ }
  mql = window.matchMedia('(prefers-color-scheme: dark)')
  mql.addEventListener('change', onSystemChange)
  applyTheme()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  mql && mql.removeEventListener('change', onSystemChange)
  window.removeEventListener('keydown', onKey)
  clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">
          <Glyph name="feather" />
        </span>
        <div class="brand__text">
          <h1>FusionUI <span>Icons</span></h1>
          <p>{{ ICONS.length }} open-source icons for web &amp; mobile</p>
        </div>
      </div>

      <div class="topbar__actions">
        <div class="theme" role="group" aria-label="Theme">
          <button
            v-for="opt in themeOptions"
            :key="opt.value"
            class="theme__btn"
            :class="{ 'is-active': themeMode === opt.value }"
            :aria-pressed="themeMode === opt.value"
            :title="opt.label + ' theme'"
            @click="setTheme(opt.value)"
          >
            <Glyph :name="opt.icon" />
            <span class="sr-only">{{ opt.label }}</span>
          </button>
        </div>
        <a
          class="ghlink"
          href="https://github.com/rukkiecodes/fusionui-icons"
          target="_blank"
          rel="noopener"
          title="View on GitHub"
        >
          <Glyph name="github" />
          <span>GitHub</span>
        </a>
      </div>
    </header>

    <div class="searchwrap">
      <div class="search">
        <Glyph name="search" class="search__icon" />
        <input
          ref="searchEl"
          v-model="query"
          type="search"
          class="search__input"
          placeholder="Search icons…  (press / to focus)"
          autocomplete="off"
          spellcheck="false"
          aria-label="Search icons"
        />
        <button v-if="query" class="search__clear" title="Clear" @click="query = ''">
          <Glyph name="x" />
        </button>
      </div>
      <p class="results">
        <template v-if="filtered.length">
          Showing <strong>{{ rangeStart }}–{{ rangeEnd }}</strong> of
          <strong>{{ filtered.length }}</strong>
          {{ filtered.length === 1 ? 'icon' : 'icons' }}
        </template>
        <template v-else> No icons match “{{ query }}” </template>
      </p>
    </div>

    <main class="content">
      <div v-if="pageIcons.length" class="grid">
        <button
          v-for="icon in pageIcons"
          :key="icon.n"
          class="cell"
          :title="icon.n"
          @click="openIcon(icon)"
        >
          <span class="cell__icon"><Glyph :name="icon.n" /></span>
          <span class="cell__name">{{ icon.n }}</span>
        </button>
      </div>

      <div v-else class="empty">
        <Glyph name="search" />
        <p>Nothing here. Try a different search term.</p>
      </div>

      <nav v-if="totalPages > 1" class="pager" aria-label="Pagination">
        <button class="pager__btn" :disabled="page === 1" @click="go(page - 1)">
          <Glyph name="chevron-left" />
          <span class="sr-only">Previous</span>
        </button>
        <button
          v-for="(p, i) in pageList"
          :key="i"
          class="pager__btn pager__num"
          :class="{ 'is-active': p === page, 'is-gap': p === '…' }"
          :disabled="p === '…'"
          @click="go(p)"
        >
          {{ p }}
        </button>
        <button class="pager__btn" :disabled="page === totalPages" @click="go(page + 1)">
          <Glyph name="chevron-right" />
          <span class="sr-only">Next</span>
        </button>
      </nav>
    </main>

    <footer class="footer">
      <p>
        FusionUI Icons — derived from open-source stroke icons, rebranded for the
        <strong>FusionUI</strong> design system. Free to use.
      </p>
    </footer>

    <!-- Icon detail / copy modal -->
    <transition name="fade">
      <div v-if="active" class="overlay" @click.self="closeModal">
        <div class="modal" role="dialog" aria-modal="true" :aria-label="active.n">
          <button class="modal__close" title="Close (Esc)" @click="closeModal">
            <Glyph name="x" />
          </button>

          <div class="modal__head">
            <div class="modal__preview"><Glyph :name="active.n" /></div>
            <div class="modal__meta">
              <h2>{{ active.n }}</h2>
              <p>{{ active.p }} · FusionUI Icons</p>
            </div>
          </div>

          <div class="snips">
            <div v-for="s in activeSnippets" :key="s.key" class="snip">
              <div class="snip__top">
                <span class="snip__label">{{ s.label }}</span>
                <button
                  class="snip__copy"
                  :class="{ 'is-copied': copiedKey === s.key }"
                  @click="copy(s.code, s.key)"
                >
                  <Glyph :name="copiedKey === s.key ? 'check' : 'copy'" />
                  {{ copiedKey === s.key ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="snip__code"><code>{{ s.code }}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
