import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vendor libraries change far less often than the app's own code. Putting them
// in their own files means that after a deploy the browser only re-downloads the
// small app chunk and keeps the big firebase / react / map / excel files from
// its cache (they are served with `Cache-Control: immutable`, see vercel.json).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
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
