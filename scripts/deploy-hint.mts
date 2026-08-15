#!/usr/bin/env node
/** Prints free deploy steps (Render). */
console.log(`
Бесплатный хостинг (ПК можно выключить): Render Free

1. Зарегистрируйся: https://dashboard.render.com/register
   (лучше через GitHub, карта не нужна)

2. Залей этот проект на GitHub (новый репозиторий).

3. В Render: New → Blueprint → выбери репозиторий.
   Файл render.yaml уже готов (plan: free).

4. После деплоя открой URL вида:
   https://rpg-table-xxxx.onrender.com

5. В Environment добавь:
   PUBLIC_URL=https://твой-адрес.onrender.com
   и сделай Manual Deploy → Deploy latest.

Особенности бесплатного плана:
- после ~15 мин без игроков сервис засыпает;
- первый заход после сна ~1 минута;
- пока идёт игра по WebSocket — не засыпает;
- SQLite на free без постоянного диска: комнаты могут сброситься после сна/redeploy.

Локально сейчас: http://localhost:3001
`);
