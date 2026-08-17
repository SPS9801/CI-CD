FROM node:20
WORKDIR /app

# 1. root का package.json copy करो
COPY package*.json ./

# 2. install करो
RUN npm install

# 3. सारा code copy करो
COPY . 

EXPOSE 10000
CMD ["node", "backend/server.js"]