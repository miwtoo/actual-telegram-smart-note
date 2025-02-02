FROM node:23-alpine

WORKDIR /app

COPY package*.json ./
COPY .env ./
RUN mkdir -p .cache

RUN npm install

COPY . .

CMD ["npm", "start"] 