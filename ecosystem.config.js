// PM2 ecosystem configuration — manages all Helm processes for 24/7 operation.
// Start: pm2 start ecosystem.config.js
// Monitor: pm2 monit
// Persist: pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: "helm-api",
      script: "python",
      args: "-m uvicorn helm.main:app --host 0.0.0.0 --port 8000",
      watch: false,
      max_memory_restart: "500M",
      env: { NODE_ENV: "production" },
      error_file: "logs/helm-api-error.log",
      out_file: "logs/helm-api-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "smart-checkins",
      script: "python",
      args: "-m helm.checkins.run_checkins",
      cron_restart: "*/30 * * * *",
      autorestart: false,
      watch: false,
      env: { NODE_ENV: "production" },
      error_file: "logs/checkins-error.log",
      out_file: "logs/checkins-out.log",
    },
    {
      name: "context-sync",
      script: "python",
      args: "-m helm.orchestrator.run_context_sync",
      cron_restart: "*/15 * * * *",
      autorestart: false,
      watch: false,
      env: { NODE_ENV: "production" },
      error_file: "logs/context-sync-error.log",
      out_file: "logs/context-sync-out.log",
    },
    {
      name: "health-monitor",
      script: "python",
      args: "-c \"import asyncio; from helm.reliability.health_check import health_checker; asyncio.run(health_checker.run_and_alert())\"",
      cron_restart: "* * * * *",
      autorestart: false,
      watch: false,
      env: { NODE_ENV: "production" },
      error_file: "logs/health-error.log",
      out_file: "logs/health-out.log",
    },
    {
      name: "retry-processor",
      script: "python",
      args: "-c \"import asyncio; from helm.reliability.retry_queue import retry_queue; asyncio.run(retry_queue.process())\"",
      cron_restart: "*/5 * * * *",
      autorestart: false,
      watch: false,
      env: { NODE_ENV: "production" },
      error_file: "logs/retry-error.log",
      out_file: "logs/retry-out.log",
    },
  ],
};
