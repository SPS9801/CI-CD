FROM node:20
WORKDIR /app

# Step 1: backend folder में जाओ और package install करो
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install

# Step 2: पूरा backend code copy करो
WORKDIR /app
COPY backend ./backend

# Step 3: run करो
WORKDIR /app/backend
# अगर package.json में "build" नहीं है तो नीचे वाली लाइन हटा दो
# RUN npm run build

EXPOSE 10000
CMD ["npm", "start"]