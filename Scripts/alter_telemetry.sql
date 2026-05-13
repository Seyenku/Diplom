-- Этот скрипт необходимо выполнить для применения изменений в схеме БД
-- Изменение типа TargetId с INT на NVARCHAR для поддержки строковых идентификаторов (например 'main-menu')

ALTER TABLE ActionLogs 
ALTER COLUMN TargetId NVARCHAR(100);
GO
