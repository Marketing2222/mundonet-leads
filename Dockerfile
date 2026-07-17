FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
ENV DB_PATH=/data/mundonet.db
EXPOSE 3737
CMD ["node", "server.js"]
