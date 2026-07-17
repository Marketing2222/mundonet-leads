FROM node:20
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --production
COPY . .
ENV DB_PATH=/data/mundonet.db
EXPOSE 3737
CMD ["node", "server.js"]
