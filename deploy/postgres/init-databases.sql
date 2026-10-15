-- Per-service databases (runs once on empty pgdata volume).
CREATE DATABASE core_auth;
CREATE DATABASE analytics;
CREATE DATABASE identity;
CREATE DATABASE task_orchestrator;
CREATE DATABASE intelligence;
CREATE DATABASE eic;
CREATE DATABASE ai_chat;
CREATE DATABASE desktop_shell;
CREATE DATABASE dedmoroz;

GRANT ALL PRIVILEGES ON DATABASE core_auth TO eworld;
GRANT ALL PRIVILEGES ON DATABASE analytics TO eworld;
GRANT ALL PRIVILEGES ON DATABASE identity TO eworld;
GRANT ALL PRIVILEGES ON DATABASE task_orchestrator TO eworld;
GRANT ALL PRIVILEGES ON DATABASE intelligence TO eworld;
GRANT ALL PRIVILEGES ON DATABASE eic TO eworld;
GRANT ALL PRIVILEGES ON DATABASE ai_chat TO eworld;
GRANT ALL PRIVILEGES ON DATABASE desktop_shell TO eworld;
GRANT ALL PRIVILEGES ON DATABASE dedmoroz TO eworld;
