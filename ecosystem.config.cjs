/** PM2 ecosystem config — single instance only (no cluster). */
module.exports = {
  apps: [
    {
      name: "tournament-master",
      script: "dist/server.cjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      env: {
        NODE_ENV: "production",
        TM_AUTO_OPEN_BROWSER: "0",
        USE_POSTGRES: "true",
      },
      kill_timeout: 10_000,
      listen_timeout: 15_000,
    },
  ],
};
