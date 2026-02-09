#!usr/bin/env bas

git fetch origin master
git reset --hard origin/master
git clean -fd

chmod +x deploy.sh

bun install

pm2 restart ecosystem.config.cjs

echo "Done!"