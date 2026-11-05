-- severity: warn
-- descricao: fonte cuja ultima execucao falhou
SELECT source_id, last_error_code, last_message FROM ops.source_last WHERE last_status = 'error'
