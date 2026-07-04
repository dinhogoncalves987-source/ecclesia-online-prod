FROM node:20-alpine

WORKDIR /app

# Instalar dependências nativas para Baileys
RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Diretório de auth persistente (montar como volume)
RUN mkdir -p auth_info_baileys

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3100/health || exit 1

CMD ["node", "src/index.js"]
