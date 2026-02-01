module.exports = {
  apps: [{
    name: "bald-discord-bot",
    // We tell PM2 to execute the 'bun' command directly
    script: "bun",
    // We pass 'run' and your file name as arguments to bun
    args: "run bot.ts",
    // This tells PM2 NOT to look for a node interpreter
    exec_mode: "fork",
    interpreter: "none", 
    env: {
      NODE_ENV: "production",
    }
  }]
}