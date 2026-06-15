// Generates the FusionUI Icons dataset for the gallery.
//
// Source of truth: the SVG files shipped in the FusionUI monorepo
// (packages/icons/svg). This script:
//   1. reads every *.svg from the source folder,
//   2. rebrands the markup from "feather feather-*" to "fui fui-*",
//   3. writes a self-contained copy of the rebranded SVGs into ./svg,
//   4. emits a compact ./src/icons.json the web app imports.
//
// Re-run with `npm run icons` whenever the upstream icon set changes.
// The committed svg/ + icons.json keep the repo buildable without the monorepo.

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

// Candidate source folders, in priority order. First, the local committed copy
// (so regeneration is idempotent); then the upstream monorepo location.
const sourceCandidates = [
  resolve(projectRoot, 'svg'),
  resolve(projectRoot, '../../hybrid/FusionUI/packages/icons/svg'),
]

const outSvgDir = join(projectRoot, 'svg')
const outJson = join(projectRoot, 'src', 'icons.json')

// Extra search keywords for the curated semantic aliases used by FusionUI.
// Maps an icon name -> additional words people might search by.
const aliasTags = {
  x: ['close', 'cancel', 'dismiss', 'remove'],
  'x-circle': ['clear', 'close', 'cancel'],
  check: ['complete', 'done', 'tick', 'confirm'],
  'check-circle': ['success', 'done', 'ok'],
  info: ['information', 'about', 'help'],
  'alert-triangle': ['warning', 'caution', 'danger'],
  'alert-circle': ['error', 'warning', 'alert'],
  'chevron-left': ['prev', 'previous', 'back'],
  'chevron-right': ['next', 'forward'],
  'chevron-down': ['dropdown', 'expand', 'open'],
  'chevron-up': ['collapse', 'close'],
  menu: ['hamburger', 'nav', 'navigation', 'bars'],
  search: ['find', 'magnify', 'lookup', 'zoom'],
  'trash-2': ['delete', 'remove', 'bin', 'garbage'],
  trash: ['delete', 'remove', 'bin', 'garbage'],
  'edit-2': ['edit', 'pencil', 'write', 'modify'],
  'edit-3': ['edit', 'pencil', 'write'],
  edit: ['pencil', 'write', 'modify'],
  plus: ['add', 'increment', 'new', 'create'],
  minus: ['remove', 'decrement', 'subtract'],
  upload: ['import', 'cloud'],
  download: ['export', 'save', 'cloud'],
  star: ['rating', 'favourite', 'favorite', 'bookmark'],
  heart: ['like', 'love', 'favourite', 'favorite'],
  calendar: ['date', 'event', 'schedule'],
  clock: ['time', 'watch', 'schedule'],
  eye: ['view', 'show', 'visible', 'preview'],
  'eye-off': ['hide', 'hidden', 'invisible'],
  home: ['house', 'main', 'dashboard'],
  user: ['person', 'account', 'profile', 'avatar'],
  users: ['people', 'group', 'team', 'contacts'],
  mail: ['email', 'envelope', 'message', 'inbox'],
  'message-circle': ['chat', 'comment', 'talk'],
  'message-square': ['chat', 'comment', 'talk', 'sms'],
  bell: ['notification', 'alert', 'reminder'],
  settings: ['gear', 'cog', 'preferences', 'options', 'config'],
  'log-out': ['logout', 'signout', 'exit'],
  'log-in': ['login', 'signin', 'enter'],
  'shopping-cart': ['cart', 'buy', 'checkout', 'store'],
  'shopping-bag': ['bag', 'buy', 'store', 'shop'],
  'credit-card': ['payment', 'pay', 'card', 'billing'],
  github: ['git', 'code', 'repo', 'octocat'],
  link: ['url', 'chain', 'hyperlink'],
  share: ['send', 'export'],
  'share-2': ['send', 'export', 'network'],
  lock: ['secure', 'password', 'private', 'locked'],
  unlock: ['unlocked', 'open', 'access'],
  camera: ['photo', 'picture', 'snapshot'],
  image: ['photo', 'picture', 'gallery'],
  video: ['film', 'movie', 'record'],
  phone: ['call', 'telephone', 'contact'],
  'map-pin': ['location', 'place', 'marker', 'gps'],
  globe: ['world', 'web', 'internet', 'language'],
  sun: ['light', 'day', 'bright', 'theme'],
  moon: ['dark', 'night', 'theme'],
  'refresh-cw': ['reload', 'refresh', 'sync', 'rotate'],
  'refresh-ccw': ['reload', 'refresh', 'sync', 'rotate'],
  filter: ['sort', 'funnel'],
  'more-horizontal': ['menu', 'options', 'ellipsis', 'dots'],
  'more-vertical': ['menu', 'options', 'ellipsis', 'dots'],
}

function pascalCase(name) {
  return name
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

// Pull the inner markup (everything between <svg ...> and </svg>) and
// normalise self-closing tags so the body is valid for both HTML and JSX.
function extractBody(svg) {
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return inner.trim()
}

function buildTags(name) {
  const words = new Set(name.split('-').filter(Boolean))
  words.add(name)
  for (const t of aliasTags[name] ?? []) words.add(t)
  return [...words].join(' ')
}

async function main() {
  const sourceDir = sourceCandidates.find(p => existsSync(p))
  if (!sourceDir) {
    console.error('No icon source folder found. Looked in:\n' + sourceCandidates.join('\n'))
    process.exit(1)
  }
  console.log('Reading icons from:', sourceDir)

  const files = (await readdir(sourceDir)).filter(f => f.endsWith('.svg')).sort()
  if (!files.length) {
    console.error('No .svg files in', sourceDir)
    process.exit(1)
  }

  // Rewrite the local svg/ folder fresh so removed upstream icons don't linger.
  const writingInPlace = resolve(sourceDir) === resolve(outSvgDir)
  if (!writingInPlace && existsSync(outSvgDir)) await rm(outSvgDir, { recursive: true, force: true })
  await mkdir(outSvgDir, { recursive: true })
  await mkdir(dirname(outJson), { recursive: true })

  const icons = []
  for (const file of files) {
    const name = file.replace(/\.svg$/, '')
    const raw = await readFile(join(sourceDir, file), 'utf8')

    // Rebrand: drop all "feather" references in favour of FusionUI's fui- prefix.
    const rebranded = raw
      .replace(/class="feather feather-[^"]*"/g, `class="fui fui-${name}"`)
      .replace(/feather/g, 'fui')
      .trim()

    if (!writingInPlace) await writeFile(join(outSvgDir, file), rebranded + '\n')

    icons.push({
      n: name,
      p: pascalCase(name),
      b: extractBody(rebranded),
      t: buildTags(name),
    })
  }

  const payload = { version: 1, count: icons.length, icons }
  await writeFile(outJson, JSON.stringify(payload))
  console.log(`Wrote ${icons.length} icons -> ${outJson}`)
  if (!writingInPlace) console.log(`Wrote ${icons.length} rebranded SVGs -> ${outSvgDir}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
