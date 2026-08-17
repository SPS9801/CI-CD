FROM node:20
WORKDIR /app

# backend की dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install

# backend का code copy
WORKDIR /app
COPY backend ./backend

WORKDIR /app/backend
# अगर build script नहीं है तो ये लाइन हटा देना
RUN npm run build

EXPOSE 10000
CMD ["npm", "start"]