// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'comptaclems-api',
    script: './server.js',
    cwd: '/opt/comptaclems/apps/api',
    instances: 'max',
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '1G',
    
    env_production: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    
    error_file: '/var/log/pm2/comptaclems/error.log',
    out_file: '/var/log/pm2/comptaclems/out.log',
    log_file: '/var/log/pm2/comptaclems/combined.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    min_uptime: '10s',
    max_restarts: 10,
    
    listen_timeout: 5000,
    kill_timeout: 5000,
    
    health_check_url: '/api/health',
    
    // Monitoring
    instance_var: 'INSTANCE_ID',
    
    // Métriques
    metrics: {
      http: true,
      event_loop: true
    }
  }],

  // Configuration du déploiement
  deploy: {
    production: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:votre-repo/comptaclems.git',
      path: '/opt/comptaclems',
      'post-deploy': 'npm ci --production && pm2 reload ecosystem.config.js --env production'
    }
  }
};