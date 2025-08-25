/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Build optimizations
  build: {
    // Target modern browsers
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    
    // Enable minification
    minify: false, // Disabled for Docker build
    
    // Code splitting configuration
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk for external dependencies
          vendor: ['react', 'react-dom', 'react-router-dom'],
          
          // UI chunk for UI libraries
          ui: ['lucide-react', '@tanstack/react-query'],
          
          // Charts chunk for data visualization
          charts: ['chart.js', 'react-chartjs-2'],
          
          // Forms chunk for form handling
          forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
          
          // Utils chunk for utilities
          utils: ['zustand', 'clsx', 'tailwind-merge'],
        },
      },
    },
    
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000,
    
    // Source maps for production debugging
    sourcemap: false, // Set to true if you need source maps in production
  },
  
  // Performance optimizations
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'lucide-react',
      'chart.js',
      'react-chartjs-2',
      'react-hook-form',
      'zod',
      'zustand'
    ],
  },
  
  // Server configuration
  server: {
    port: 5173,
    host: true, // Expose to network
    open: false, // Don't auto-open browser
    
    // Proxy API requests to backend
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      },
    },
  },
  
  // Preview server configuration (for production build preview)
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  
  // Path resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@services': resolve(__dirname, './src/services'),
      '@stores': resolve(__dirname, './src/stores'),
      '@utils': resolve(__dirname, './src/utils'),
      '@types': resolve(__dirname, './src/types'),
    },
  },
  
  // Testing configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/',
      ],
    },
  },
})
