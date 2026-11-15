-- V007 down · 删除调度分析订单台账表
BEGIN;
DROP TABLE IF EXISTS ops.analysis_order CASCADE;
COMMIT;
