const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuração do banco para Railway ou desenvolvimento local
let dbConfig;

if (process.env.DATABASE_URL) {
  // Configuração para Railway usando DATABASE_URL
  dbConfig = {
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else {
  // Configuração para desenvolvimento local
  dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'controle_gastos',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}

// Criar pool de conexões
const pool = mysql.createPool(dbConfig);

// Função para testar a conexão
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✓ Conexão com MySQL estabelecida com sucesso!');
    connection.release();
    return true;
  } catch (error) {
    console.error('✗ Erro ao conectar com o MySQL:', error.message);
    return false;
  }
}

// Função para executar queries
async function executeQuery(query, params = []) {
  try {
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    console.error('Erro ao executar query:', error);
    throw error;
  }
}

module.exports = {
  pool,
  testConnection,
  executeQuery
};
