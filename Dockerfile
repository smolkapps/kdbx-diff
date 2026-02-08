FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --include=optional 2>/dev/null || npm ci

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
