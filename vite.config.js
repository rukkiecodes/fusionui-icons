import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Project pages are served from https://rukkiecodes.github.io/fusionui-icons/
// so all asset URLs must be prefixed with the repo name.
export default defineConfig({
  base: '/fusionui-icons/',
  plugins: [vue()],
})
