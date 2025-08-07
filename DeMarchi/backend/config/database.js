const mysql = require('mysql2/promise');

// Configuração do banco de dados para Railway
const dbConfig = {
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway',
  ssl: {
    rejectUnauthorized: false
  },
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
};

const pool = mysql.createPool(dbConfig);

async function testConnection() {
  try {
    console.log('🔍 Testando conexão com o banco de dados...');
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Conexão com o banco estabelecida com sucesso!');
    return true;
  } catch (error) {
    console.error('❌ Erro na conexão com o banco:', error.message);
    throw error;
  }
}

module.exports = { pool, testConnection };
