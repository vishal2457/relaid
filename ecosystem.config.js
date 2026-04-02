module.exports = {
  apps: [
    {
      name: "relay",
      cwd: "./apps/relay",
      script: "pnpm",
      args: "start",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      env_development: {
        NODE_ENV: "development",
        script: "pnpm",
        args: "dev",
      },
      max_memory_restart: "512M",
      restart_delay: 3000,
    },
    {
      name: "local",
      cwd: "./apps/local",
      script: "pnpm",
      args: "start",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      env_development: {
        NODE_ENV: "development",
        script: "pnpm",
        args: "dev",
      },
      max_memory_restart: "512M",
      restart_delay: 3000,
    },
    {
      name: "local-web",
      cwd: "./apps/local-web",
      script: "pnpm",
      args: "dev",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      restart_delay: 3000,
    },
    {
      name: "mobile",
      cwd: "./apps/mobile",
      script: "pnpm",
      args: "start",
      watch: false,
      env: {
        NODE_ENV: "development",
      },
      max_memory_restart: "512M",
      restart_delay: 3000,
    },
  ],
};
