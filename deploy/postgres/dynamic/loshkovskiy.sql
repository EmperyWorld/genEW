-- Auto-provisioned by Empery Hands for loshkovskiy
SELECT 'CREATE DATABASE loshkovskiy'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'loshkovskiy')\gexec
GRANT ALL PRIVILEGES ON DATABASE loshkovskiy TO eworld;
