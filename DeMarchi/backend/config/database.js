const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuração do banco para Railway ou desenvolvimento local
let dbConfig;

// Railway fornece estas variáveis automaticamente
if (process.env.MYSQL_HOST) {
  // Configuração para Railway (MySQL addon)
  dbConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: {
      rejectUnauthorized: false
    },
    reconnect: true,
    idleTimeout: 300000,
    acquireTimeout: 60000
  };
} else if (process.env.DATABASE_URL) {
  // Configuração alternativa usando DATABASE_URL (formato mysql://user:pass@host:port/db)
  const url = new URL(process.env.DATABASE_URL);
  dbConfig = {
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1), // Remove a barra inicial
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: {
      rejectUnauthorized: false
    },
    reconnect: true
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

console.log('Configuração do banco de dados:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  hasPassword: !!dbConfig.password
});

// Criar pool de conexões
const pool = mysql.createPool(dbConfig);

// Função para testar a conexão
async function testConnection() {
  try {
    console.log('🔍 Testando conexão com o banco de dados...');
    const connection = await pool.getConnection();
    console.log('✓ Conexão com MySQL estabelecida com sucesso!');
    
    // Testar uma query simples
    await connection.ping();
    console.log('✓ Ping no banco realizado com sucesso!');
    
    connection.release();
    return true;
  } catch (error) {
    console.error('✗ Erro ao conectar com o MySQL:', error.message);
    console.error('Detalhes do erro:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      host: dbConfig.host,
      user: dbConfig.user,
      database: dbConfig.database
    });
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
