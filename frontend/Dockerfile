# --- Этап 1: Сборка фронтенда ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Этап 2: Раздача через Nginx ---
FROM nginx:alpine
# Копируем собранный билд из предыдущего этапа в папку Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Копируем дефолтный конфиг nginx (если понадобится, пока стандартный)
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
