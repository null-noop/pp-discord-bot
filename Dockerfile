FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.js ./
COPY scripts ./scripts
COPY data ./data

ENV NODE_ENV=production
USER node

CMD ["node", "app.js"]
