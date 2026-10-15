-- Auto-provisioned by Empery Hands for asm_prod_acc_20261006100320
SELECT 'CREATE DATABASE asm_prod_acc_20261006100320'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asm_prod_acc_20261006100320')\gexec
GRANT ALL PRIVILEGES ON DATABASE asm_prod_acc_20261006100320 TO eworld;
