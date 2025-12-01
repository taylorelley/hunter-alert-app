import { validateEnvConfig } from './scripts/validate-env.mjs'

validateEnvConfig({ quiet: process.env.NODE_ENV === 'test' })

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
}

export default nextConfig