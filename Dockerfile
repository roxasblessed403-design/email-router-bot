FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --only=production

COPY bot.js .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 404) throw new Error(r.statusCode)})"

CMD ["node", "bot.js"]