FROM node:22-alpine

# tzdata para o fuso horário (TZ) funcionar também nos logs
RUN apk add --no-cache tzdata

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
RUN mkdir -p /app/data && chown node:node /app/data

USER node

CMD ["node", "src/index.js"]
