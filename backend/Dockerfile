# Используем официальный образ Node.js
FROM node:20-alpine

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./
COPY prisma ./prisma/

# Устанавливаем зависимости и генерируем Prisma Client
RUN npm install
RUN npx prisma generate

# Копируем остальной код бэкенда
COPY . .

# Семплируем TypeScript в JavaScript
RUN npm run build

# Порт, на котором работает бэкенд
EXPOSE 5000

# Команда для запуска миграций и старта сервера
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
