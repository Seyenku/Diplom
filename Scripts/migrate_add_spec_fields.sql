-- ==============================================================================
-- МИГРАЦИЯ: Добавление полей для страницы «Направления» (spec)
-- Идемпотентный скрипт — можно запускать повторно без ошибок.
-- ==============================================================================

-- 1. Programs.Disciplines (Читаемые дисциплины)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Programs' AND COLUMN_NAME = 'Disciplines'
)
BEGIN
    ALTER TABLE Programs ADD Disciplines NVARCHAR(MAX) NULL;
    PRINT N'Added Programs.Disciplines';
END
GO

-- 2. Programs.Spheres (Сферы трудоустройства)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Programs' AND COLUMN_NAME = 'Spheres'
)
BEGIN
    ALTER TABLE Programs ADD Spheres NVARCHAR(MAX) NULL;
    PRINT N'Added Programs.Spheres';
END
GO

-- 3. AdmissionStats.AvgEgeScore (Средний балл ЕГЭ)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'AdmissionStats' AND COLUMN_NAME = 'AvgEgeScore'
)
BEGIN
    ALTER TABLE AdmissionStats ADD AvgEgeScore FLOAT NULL;
    PRINT N'Added AdmissionStats.AvgEgeScore';
END
GO

PRINT N'Migration complete: spec fields added.';
GO
