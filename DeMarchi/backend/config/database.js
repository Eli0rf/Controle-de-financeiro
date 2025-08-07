const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuração do banco para Railway ou desenvolvimento local
let dbConfig;

// Prioridade para variáveis do Railway MySQL
if (process.env.MYSQLHOST && process.env.MYSQLPORT && process.env.MYSQLUSER) {
  console.log('🚀 Usando configuração Railway MySQL...');
  dbConfig = {
    host: process.env.MYSQLHOST,
    port: parseInt(process.env.MYSQLPORT),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else if (process.env.MYSQL_URL) {
  console.log('🔗 Usando MYSQL_URL do Railway...');
  // Parse da URL do MySQL
  const url = new URL(process.env.MYSQL_URL);
  dbConfig = {
    host: url.hostname,
    port: parseInt(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.substring(1), // Remove a barra inicial
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else if (process.env.NODE_ENV === 'production') {
  console.log('🏭 Usando configuração de produção local...');
  dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else {
  console.log('💻 Usando configuração de desenvolvimento local...');
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
    console.log('🔄 Testando conexão com o banco de dados...');
    console.log('Configuração:', {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database
    });
    
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    
    console.log('✅ Conexão com banco de dados estabelecida com sucesso!');
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar com o banco de dados:', error.message);
    throw error;
  }
}

module.exports = {
  pool,
  testConnection
};
