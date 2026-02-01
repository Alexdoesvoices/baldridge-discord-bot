module.exports = {
  apps: [{
    name: "bald-discord-bot",
    script: "bun",
    args: "run bot.ts",
    exec_mode: "fork",
    interpreter: "none", 
    env: {
      NODE_ENV: "production",
    }
  }]
}
