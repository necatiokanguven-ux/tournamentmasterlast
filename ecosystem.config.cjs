/** PM2 ecosystem — main server + localhost watchdog for auto-recovery. */
module.exports = {
  apps: [
    {
      name: "tournament-master",
      script: "dist/server.cjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "5s",
      restart_delay: 2_000,
      env: {
        NODE_ENV: "production",
        TM_AUTO_OPEN_BROWSER: "0",
      },
      kill_timeout: 10_000,
      listen_timeout: 15_000,
    },
    {
      name: "tournament-master-watchdog",
      script: "dist/watchdog.cjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "3s",
      env: {
        NODE_ENV: "production",
        TM_WATCHDOG_PORT: "3099",
      },
      kill_timeout: 5_000,
    },
  ],
};
