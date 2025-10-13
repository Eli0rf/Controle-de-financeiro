const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

// Helpers para garantir colunas e índices de forma idempotente
async function ensureColumn(connection, tableName, columnName, columnDefinition) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (rows.length === 0) {
    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`;
    await connection.query(sql);
    console.log(`✓ Coluna adicionada: ${tableName}.${columnName}`);
  } else {
    // console.log(`↺ Coluna já existe: ${tableName}.${columnName}`);
  }
}

async function ensureIndex(connection, tableName, indexName, indexColumnsClause) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (rows.length === 0) {
    const sql = `CREATE INDEX ${indexName} ON ${tableName}(${indexColumnsClause})`;
    await connection.query(sql);
    console.log(`✓ Índice criado: ${indexName} em ${tableName}`);
  } else {
    // console.log(`↺ Índice já existe: ${indexName} em ${tableName}`);
  }
}

// Função para executar arquivos SQL
async function executeSQLFile(filePath) {
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Dividir o SQL em comandos individuais
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--') && !cmd.startsWith('/*'));

    const connection = await pool.getConnection();
    
    for (const command of commands) {
      if (command.trim()) {
        try {
          await connection.query(command);
          console.log(`✓ Comando executado: ${command.substring(0, 50)}...`);
        } catch (error) {
          // Ignorar erros de "table already exists" ou similar
          if (!error.message.includes('already exists') && 
              !error.message.includes('Duplicate column') &&
              !error.message.includes('Duplicate key')) {
            console.error(`Erro ao executar comando: ${command.substring(0, 50)}...`);
            console.error(error.message);
          }
        }
      }
    }
    
    connection.release();
    console.log(`✓ Arquivo SQL executado: ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`Erro ao executar arquivo SQL ${filePath}:`, error.message);
    throw error;
  }
}

// Função para criar o database e tabelas
async function createDatabase() {
  try {
    console.log('🔄 Iniciando migração do banco de dados...');
    
    // Verificar se conseguimos conectar
    const connection = await pool.getConnection();
    console.log('✓ Conexão com banco estabelecida');
    
    // Não criar database - usar o que já está configurado (Railway)
    // await connection.query(`CREATE DATABASE IF NOT EXISTS controle_gastos CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    // await connection.query(`USE controle_gastos`);
    
    console.log('📋 Usando database configurado:', connection.config.database || 'railway');
    
    // Criar tabela users
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT(11) NOT NULL AUTO_INCREMENT,
        username VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    
  // Criar tabela expenses
    await connection.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INT(11) NOT NULL AUTO_INCREMENT,
        user_id INT(11) NOT NULL,
        transaction_date DATE NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        description VARCHAR(255) NOT NULL,
        category VARCHAR(255) DEFAULT NULL,
    account ENUM('Nu Bank Ketlyn','Nu Vainer','Ourocard Ketlyn','PicPay Vainer','PIX','Boleto','PIX/Boleto') NOT NULL,
        is_business_expense TINYINT(1) DEFAULT 0,
        account_plan_code INT(11) DEFAULT NULL,
        has_invoice TINYINT(1) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        invoice_path VARCHAR(255) DEFAULT NULL,
        total_purchase_amount DECIMAL(10,2) DEFAULT NULL,
        installment_number INT(11) DEFAULT NULL,
        total_installments INT(11) DEFAULT NULL,
        is_recurring_expense TINYINT(1) DEFAULT 0,
        recurring_expense_id INT(11) DEFAULT NULL,
        PRIMARY KEY (id),
        KEY user_id (user_id),
        KEY recurring_expense_id (recurring_expense_id),
        CONSTRAINT expenses_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    
    // Criar tabela recurring_expenses
    await connection.query(`
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id INT(11) NOT NULL AUTO_INCREMENT,
        user_id INT(11) NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        account ENUM('Nu Bank Ketlyn','Nu Vainer','Ourocard Ketlyn','PicPay Vainer','PIX','Boleto','PIX/Boleto') NOT NULL,
        category VARCHAR(255) DEFAULT NULL,
        account_plan_code INT(11) DEFAULT NULL,
        is_business_expense TINYINT(1) DEFAULT 0,
        day_of_month INT(2) DEFAULT 1,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY user_id (user_id),
        CONSTRAINT recurring_expenses_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    // Garantir que bases existentes aceitem 'PIX/Boleto' no ENUM (sem remover os antigos para não quebrar)
    try {
      await connection.query(`ALTER TABLE expenses 
        MODIFY COLUMN account ENUM('Nu Bank Ketlyn','Nu Vainer','Ourocard Ketlyn','PicPay Vainer','PIX','Boleto','PIX/Boleto') NOT NULL`);
      await connection.query(`ALTER TABLE recurring_expenses 
        MODIFY COLUMN account ENUM('Nu Bank Ketlyn','Nu Vainer','Ourocard Ketlyn','PicPay Vainer','PIX','Boleto','PIX/Boleto') NOT NULL`);
      console.log('✓ ENUM de account atualizado para incluir PIX/Boleto');
    } catch (e) {
      console.log('⚠️  Aviso ao alterar ENUM de account:', e.message);
    }

    // Garantir colunas novas em bancos existentes (sem IF NOT EXISTS, usando INFORMATION_SCHEMA)
    await ensureColumn(connection, 'recurring_expenses', 'category', 'VARCHAR(255) NULL');
    await ensureColumn(connection, 'expenses', 'category', 'VARCHAR(255) NULL');
    await ensureColumn(connection, 'expenses', 'recurring_expense_id', 'INT(11) NULL');
    
    // Criar tabela recurring_expense_processing
    await connection.query(`
      CREATE TABLE IF NOT EXISTS recurring_expense_processing (
        id INT(11) NOT NULL AUTO_INCREMENT,
        recurring_expense_id INT(11) NOT NULL,
        processed_month VARCHAR(7) NOT NULL,
        expense_id INT(11) NOT NULL,
        processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_processing (recurring_expense_id, processed_month),
        KEY recurring_expense_id (recurring_expense_id),
        KEY expense_id (expense_id),
        CONSTRAINT recurring_processing_ibfk_1 FOREIGN KEY (recurring_expense_id) REFERENCES recurring_expenses (id) ON DELETE CASCADE,
        CONSTRAINT recurring_processing_ibfk_2 FOREIGN KEY (expense_id) REFERENCES expenses (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    
    // Criar índices (verificar se já existem primeiro)
    try {
      // Verificar se índices já existem
      const [existingIndexes] = await connection.query(`
        SELECT DISTINCT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'expenses'
      `);
      
      const indexNames = existingIndexes.map(row => row.INDEX_NAME);
      
      if (!indexNames.includes('idx_expenses_recurring')) {
        await connection.query(`CREATE INDEX idx_expenses_recurring ON expenses(is_recurring_expense)`);
      }
      
      if (!indexNames.includes('idx_expenses_account_date')) {
        await connection.query(`CREATE INDEX idx_expenses_account_date ON expenses(account, transaction_date)`);
      }
      // Índice para o relacionamento de despesas recorrentes
      await ensureIndex(connection, 'expenses', 'idx_expenses_recurring_id', 'recurring_expense_id');
      
      // Para recurring_expenses
      const [recurringIndexes] = await connection.query(`
        SELECT DISTINCT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'recurring_expenses'
      `);
      
      const recurringIndexNames = recurringIndexes.map(row => row.INDEX_NAME);
      
      if (!recurringIndexNames.includes('idx_recurring_active')) {
        await connection.query(`CREATE INDEX idx_recurring_active ON recurring_expenses(is_active)`);
      }
      
    } catch (error) {
      // Ignorar erros de índices
      console.log('⚠️  Aviso ao criar índices:', error.message);
    }
    
    connection.release();
    console.log('✓ Migração do banco de dados concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante a migração:', error.message);
    throw error;
  }
}

// Função para testar se as tabelas existem
async function checkTables() {
  try {
    const connection = await pool.getConnection();
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    
    connection.release();
    
    const tableNames = tables.map(row => row.TABLE_NAME);
    console.log('📋 Tabelas encontradas:', tableNames);
    
    const requiredTables = ['users', 'expenses', 'recurring_expenses', 'recurring_expense_processing'];
    const missingTables = requiredTables.filter(table => !tableNames.includes(table));
    
    if (missingTables.length > 0) {
      console.log('⚠️  Tabelas faltando:', missingTables);
      return false;
    }
    
    console.log('✓ Todas as tabelas necessárias estão presentes');
    return true;
  } catch (error) {
    console.error('Erro ao verificar tabelas:', error.message);
    return false;
  }
}

module.exports = {
  createDatabase,
  executeSQLFile,
  checkTables
};
