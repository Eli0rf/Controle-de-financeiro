const path = require('path');
const { executeSQLFile } = require('./migrate');

(async () => {
  try {
    const file = path.join(__dirname, 'sql', '20251001_monthly_snapshots_bi.sql');
    console.log('Running SQL migration for monthly_snapshots (BI columns)...');
    await executeSQLFile(file);
    console.log('Migration finished successfully.');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  }
})();