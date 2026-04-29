export default {
  transpilePackages: [
    '@x-monitor/core',
    '@x-monitor/db',
    '@x-monitor/queue',
    '@x-monitor/observability',
  ],
  webpack: (config) => {
    config.externals = config.externals || []
    config.externals.push({ 'better-sqlite3': 'commonjs better-sqlite3' })
    return config
  },
}
