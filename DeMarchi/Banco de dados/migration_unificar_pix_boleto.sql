-- Migration para unificar contas PIX e Boleto em 'PIX/Boleto'
USE controle_gastos;

-- 1. Ajustar ENUM em expenses
SET @alter_expenses = (SELECT IF(
  LOCATE('PIX/Boleto', COLUMN_TYPE)=0,
  'ALTER TABLE expenses MODIFY COLUMN `account` ENUM(\'Nu Bank Ketlyn\',\'Nu Vainer\',\'Ourocard Ketlyn\',\'PicPay Vainer\',\'PIX/Boleto\') NOT NULL',
  'SELECT "ENUM já atualizado em expenses"'));
PREPARE stmt FROM @alter_expenses; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Atualizar registros existentes
UPDATE expenses SET account = 'PIX/Boleto' WHERE account IN ('PIX','Boleto');

-- 3. Ajustar tabela recurring_expenses se existir
SET @has_recurring = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='controle_gastos' AND table_name='recurring_expenses');
IF @has_recurring > 0 THEN
  SET @alter_recurring = (SELECT IF(
    (SELECT LOCATE('PIX/Boleto', COLUMN_TYPE) FROM information_schema.columns WHERE table_schema='controle_gastos' AND table_name='recurring_expenses' AND column_name='account')=0,
    'ALTER TABLE recurring_expenses MODIFY COLUMN `account` ENUM(\'Nu Bank Ketlyn\',\'Nu Vainer\',\'Ourocard Ketlyn\',\'PicPay Vainer\',\'PIX/Boleto\') NOT NULL',
    'SELECT "ENUM já atualizado em recurring_expenses"'));
  PREPARE stmt2 FROM @alter_recurring; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
  UPDATE recurring_expenses SET account = 'PIX/Boleto' WHERE account IN ('PIX','Boleto');
END IF;

-- 4. Recriar view de resumo recorrente se existir dependência
DROP VIEW IF EXISTS v_recurring_expenses_summary;
CREATE VIEW v_recurring_expenses_summary AS
SELECT 
    re.id,
    re.user_id,
    re.description,
    re.amount,
    re.account,
    re.account_plan_code,
    re.is_business_expense,
    re.day_of_month,
    re.is_active,
    COUNT(rep.id) as times_processed,
    MAX(rep.processed_at) as last_processed,
    SUM(e.amount) as total_processed_amount
FROM recurring_expenses re
LEFT JOIN recurring_expense_processing rep ON re.id = rep.recurring_expense_id
LEFT JOIN expenses e ON rep.expense_id = e.id
WHERE re.is_active = 1
GROUP BY re.id;

-- 5. Log
CREATE TABLE IF NOT EXISTS migration_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('SUCCESS','FAILED','PARTIAL') NOT NULL DEFAULT 'SUCCESS',
  notes TEXT
);
INSERT INTO migration_log (migration_name,status) VALUES ('unificar_pix_boleto', 'SUCCESS');
