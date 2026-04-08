module.exports = {
  apps: [{
    name: 'localdrop',
    script: 'server.js',
    env_file: '.env',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
  }]
};
