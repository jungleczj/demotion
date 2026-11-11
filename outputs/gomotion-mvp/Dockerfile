FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json ./
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM node:26-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk fonts-noto-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3027 GOMOTION_DATA_DIR=/data \
    CAPTION_FONTS_DIR=/usr/share/fonts/opentype/noto \
    MOTION_FONT_FILE=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
    MOTION_FONT_FAMILY="Noto Sans CJK SC" MOTION_SYSTEM_FONTS=1
USER node
EXPOSE 3027
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
