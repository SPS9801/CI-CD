# Step 1: Build React/Vite Frontend
FROM node:20 as frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

# Step 2: Run Backend + Serve Frontend
FROM node:20
WORKDIR /app

# Backend deps
COPY package*.json ./
RUN npm install
COPY . .

# Frontend build copy करो backend के public folder में
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 10000
CMD ["npm", "start"]
