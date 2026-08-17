FROM node:20 AS build
WORKDIR /app

# backend की dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# backend का code copy
COPY backend ./backend

WORKDIR /app/backend
RUN npm run build

EXPOSE 10000
CMD ["npm", "start"]