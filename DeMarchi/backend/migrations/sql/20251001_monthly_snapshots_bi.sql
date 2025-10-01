-- Ensure monthly_snapshots table exists with BI columns
CREATE TABLE IF NOT EXISTS monthly_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  total_business DECIMAL(12,2) NOT NULL,
  total_personal DECIMAL(12,2) NOT NULL,
  by_plan JSON,
  by_account JSON,
  projection DECIMAL(12,2) DEFAULT 0,
  hhi DECIMAL(10,5) DEFAULT 0,
  bi_insights JSON,
  recommendations JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_month (user_id, year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Try to add columns explicitly for older instances
ALTER TABLE monthly_snapshots ADD COLUMN bi_insights JSON;
ALTER TABLE monthly_snapshots ADD COLUMN recommendations JSON;