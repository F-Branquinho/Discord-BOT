FROM node:22-alpine

# tzdata so the timezone (TZ) also applies to log timestamps
RUN apk add --no-cache tzdata

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000

CMD ["node", "src/index.js"]
