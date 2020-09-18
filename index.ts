require('dotenv').config();
import bot from './src/Bot';
(async () => {
    await bot.start();
})();