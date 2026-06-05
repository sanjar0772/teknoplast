// PM2 process manager konfiguratsiyasi (VPS uchun)
// Ishga tushirish: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'teknoplast-api',
      cwd: './backend',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      time: true,
    },
  ],
};
