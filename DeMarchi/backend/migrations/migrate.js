const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

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
          await connection.execute(command);
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
    
    // Criar database se não existir
    await connection.execute(`CREATE DATABASE IF NOT EXISTS controle_gastos CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await connection.execute(`USE controle_gastos`);
    
    // Criar tabela users
    await connection.execute(`
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
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INT(11) NOT NULL AUTO_INCREMENT,
        user_id INT(11) NOT NULL,
        transaction_date DATE NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        description VARCHAR(255) NOT NULL,
        account ENUM('Nu Bank Ketlyn','Nu Vainer','Ourocard Ketlyn','PicPay Vainer','PIX','Boleto') NOT NULL,
        is_business_expense TINYINT(1) DEFAULT 0,
        account_plan_code INT(11) DEFAULT NULL,
        has_invoice TINYINT(1) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        invoice_path VARCHAR(255) DEFAULT NULL,
        total_purchase_amount DECIMAL(10,2) DEFAULT NULL,
        installment_number INT(11) DEFAULT NULL,
        total_installments INT(11) DEFAULT NULL,
        is_recurring_expense TINYINT(1) DEFAULT 0,
        PRIMARY KEY (id),
        KEY user_id (user_id),
        CONSTRAINT expenses_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    
    // Criar tabela recurring_expenses
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id INT(11) NOT NULL AUTO_INCREMENT,
        user_id INT(11) NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        account ENUM('Nu Bank Ketlyn','Nu Vainer','Ourocard Ketlyn','PicPay Vainer','PIX','Boleto') NOT NULL,
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
    
    // Criar tabela recurring_expense_processing
    await connection.execute(`
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
    
    // Criar índices
    try {
      await connection.execute(`CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(is_recurring_expense)`);
      await connection.execute(`CREATE INDEX IF NOT EXISTS idx_expenses_account_date ON expenses(account, transaction_date)`);
      await connection.execute(`CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_expenses(is_active)`);
    } catch (error) {
      // Ignorar erros de índices que já existem
      if (!error.message.includes('already exists')) {
        console.error('Erro ao criar índices:', error.message);
      }
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
    const [tables] = await connection.execute(`
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
