FROM node:20-alpine

RUN mkdir -p /data

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3737

CMD ["node", "server.js"]
