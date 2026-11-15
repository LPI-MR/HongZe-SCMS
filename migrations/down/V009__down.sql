-- V009 回滚：删除破坏性删除审计表
DROP TABLE IF EXISTS audit.destructive_log;
DROP SCHEMA IF EXISTS audit;
