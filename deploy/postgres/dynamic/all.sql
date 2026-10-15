-- Merged dynamic DB provisions (Hands). Applied at runtime via provision_service_database; also safe to feed to psql on empty volumes.

-- Auto-provisioned by Empery Hands for asm_c7_ops_20261006070638
SELECT 'CREATE DATABASE asm_c7_ops_20261006070638'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asm_c7_ops_20261006070638')\gexec
GRANT ALL PRIVILEGES ON DATABASE asm_c7_ops_20261006070638 TO eworld;

-- Auto-provisioned by Empery Hands for asm_prod_acc_20261006100320
SELECT 'CREATE DATABASE asm_prod_acc_20261006100320'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asm_prod_acc_20261006100320')\gexec
GRANT ALL PRIVILEGES ON DATABASE asm_prod_acc_20261006100320 TO eworld;

-- Auto-provisioned by Empery Hands for asm_prod_acc_20261006110325
SELECT 'CREATE DATABASE asm_prod_acc_20261006110325'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asm_prod_acc_20261006110325')\gexec
GRANT ALL PRIVILEGES ON DATABASE asm_prod_acc_20261006110325 TO eworld;

-- Auto-provisioned by Empery Hands for loshkovskiy
SELECT 'CREATE DATABASE loshkovskiy'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'loshkovskiy')\gexec
GRANT ALL PRIVILEGES ON DATABASE loshkovskiy TO eworld;
