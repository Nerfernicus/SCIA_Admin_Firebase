import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Readable stack traces in Sentry: source maps are built and uploaded ONLY when
// SENTRY_AUTH_TOKEN is set (add it in Vercel > Settings > Environment Variables,
// plus SENTRY_ORG and SENTRY_PROJECT). They are deleted from dist after upload,
// so they are never served to visitors. Without the token nothing changes.
const release = process.env.VERCEL_GIT_COMMIT_SHA || ''
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN

// Vendor libraries change far less often than the app's own code. Putting them
// in their own files means that after a deploy the browser only re-downloads the
// small app chunk and keeps the big firebase / react / map / excel files from
// its cache (they are served with `Cache-Control: immutable`, see vercel.json).
export default defineConfig({
  define: { __APP_RELEASE__: JSON.stringify(release) },
  plugins: [
    react(),
    tailwindcss(),
    uploadSourceMaps && sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: release || undefined },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      telemetry: false,
      errorHandler: (err) => console.warn('[sentry] source map upload skipped:', err.message), // never fail the deploy
    }),
  ].filter(Boolean),
  build: {
    sourcemap: uploadSourceMaps ? 'hidden' : false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/, priority: 40 },
            { name: 'vendor-map', test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/, priority: 30 },
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
})
