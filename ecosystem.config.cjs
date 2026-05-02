const REPO = '/Users/nightyoung/IdeaProjects/x-monitor'

const SHARED_ENV = {
  SQLITE_PATH: `${REPO}/data/x-monitor.db`,
  REDIS_URL: 'redis://localhost:6379',
  POSTER_DRY_RUN: '0',
  X_CLIENT_MODE: 'live',
  POSTER_HEADLESS: '1',
  POSTER_PART_DELAY_MS: '5000',
}

const COMMON = {
  autorestart: true,
  min_uptime: 5000,
  env: SHARED_ENV,
  cwd: REPO,
}

module.exports = {
  apps: [
    {
      name: 'network-health',
      script: 'apps/network-health/dist/index.js',
      max_memory_restart: '200M',
      restart_delay: 3000,
      out_file: '.pm2/logs/network-health.out.log',
      error_file: '.pm2/logs/network-health.err.log',
      ...COMMON,
    },
    {
      name: 'scanner-browser',
      script: 'apps/scanner-browser/dist/index.js',
      max_memory_restart: '500M',
      restart_delay: 5000,
      out_file: '.pm2/logs/scanner-browser.out.log',
      error_file: '.pm2/logs/scanner-browser.err.log',
      ...COMMON,
    },
    {
      name: 'scanner-customer',
      script: 'apps/scanner-customer/dist/index.js',
      max_memory_restart: '500M',
      restart_delay: 5000,
      out_file: '.pm2/logs/scanner-customer.out.log',
      error_file: '.pm2/logs/scanner-customer.err.log',
      ...COMMON,
    },
    {
      name: 'scanner-3rdparty',
      script: 'apps/scanner-3rdparty/dist/index.js',
      max_memory_restart: '300M',
      restart_delay: 10000,
      out_file: '.pm2/logs/scanner-3rdparty.out.log',
      error_file: '.pm2/logs/scanner-3rdparty.err.log',
      ...COMMON,
    },
    {
      name: 'ai-worker',
      script: 'apps/ai-worker/dist/index.js',
      max_memory_restart: '500M',
      restart_delay: 5000,
      out_file: '.pm2/logs/ai-worker.out.log',
      error_file: '.pm2/logs/ai-worker.err.log',
      ...COMMON,
    },
    {
      name: 'scheduler',
      script: 'apps/scheduler/dist/index.js',
      max_memory_restart: '200M',
      restart_delay: 3000,
      out_file: '.pm2/logs/scheduler.out.log',
      error_file: '.pm2/logs/scheduler.err.log',
      ...COMMON,
    },
    {
      name: 'poster',
      script: 'apps/poster/dist/index.js',
      max_memory_restart: '500M',
      restart_delay: 5000,
      out_file: '.pm2/logs/poster.out.log',
      error_file: '.pm2/logs/poster.err.log',
      ...COMMON,
    },
    {
      name: 'analytics-worker',
      script: 'apps/analytics-worker/dist/index.js',
      max_memory_restart: '500M',
      restart_delay: 5000,
      out_file: '.pm2/logs/analytics-worker.out.log',
      error_file: '.pm2/logs/analytics-worker.err.log',
      ...COMMON,
    },
    {
      name: 'dm-collector',
      script: 'apps/dm-collector/dist/index.js',
      max_memory_restart: '500M',
      restart_delay: 5000,
      out_file: '.pm2/logs/dm-collector.out.log',
      error_file: '.pm2/logs/dm-collector.err.log',
      ...COMMON,
    },
    {
      name: 'health-monitor',
      script: 'apps/health-monitor/dist/index.js',
      max_memory_restart: '200M',
      restart_delay: 5000,
      out_file: '.pm2/logs/health-monitor.out.log',
      error_file: '.pm2/logs/health-monitor.err.log',
      ...COMMON,
    },
    {
      name: 'watchdog',
      script: 'apps/watchdog/dist/index.js',
      max_memory_restart: '100M',
      restart_delay: 5000,
      out_file: '.pm2/logs/watchdog.out.log',
      error_file: '.pm2/logs/watchdog.err.log',
      ...COMMON,
    },
    // NOTE: The daily customer scrape runs under launchd, not PM2. Puppeteer
    // could not launch Chrome under PM2 (silent SIGKILL of the Chrome child
    // process; manual invocation works fine). The launchd plist lives at
    // launchd/com.fintax.daily-customer-scrape.plist and fires at 00:00
    // Asia/Shanghai daily. See launchd/install.sh to load it.
    {
      name: 'fresh-kb-indexer',
      script: 'apps/fresh-kb-indexer/dist/index.js',
      max_memory_restart: '200M',
      restart_delay: 60000,  // hourly task; failed runs back off slow
      out_file: '.pm2/logs/fresh-kb-indexer.out.log',
      error_file: '.pm2/logs/fresh-kb-indexer.err.log',
      ...COMMON,
    },
    {
      name: 'web-ui',
      cwd: `${REPO}/apps/web-ui`,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      autorestart: true,
      min_uptime: 5000,
      max_memory_restart: '500M',
      env: SHARED_ENV,
      out_file: `${REPO}/.pm2/logs/web-ui.out.log`,
      error_file: `${REPO}/.pm2/logs/web-ui.err.log`,
    },
  ],
}
