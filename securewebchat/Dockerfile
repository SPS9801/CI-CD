FROM node:18-alpine
WORKDIR /app

# Dependencies install
COPY package*.json ./
RUN npm ci --only=production

# Saara code copy
COPY . .

EXPOSE 10000
CMD ["node", "backend/server.js"]
