-- Auto-provisioned by Empery Hands for asm_prod_acc_20261006110325
SELECT 'CREATE DATABASE asm_prod_acc_20261006110325'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asm_prod_acc_20261006110325')\gexec
GRANT ALL PRIVILEGES ON DATABASE asm_prod_acc_20261006110325 TO eworld;
