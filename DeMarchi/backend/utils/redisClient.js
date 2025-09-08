const Redis = require('ioredis');

let redis = null;
function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING;
  if (!url) return null; // Redis opcional
  try {
    redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
    redis.on('error', (e) => console.warn('⚠️ Redis error:', e.message));
    redis.connect().catch(()=>{}); // tentativa assíncrona
    console.log('✅ Redis inicializado');
  } catch (e) {
    console.warn('⚠️ Falha ao inicializar Redis:', e.message);
  }
  return redis;
}

module.exports = { getRedis };
