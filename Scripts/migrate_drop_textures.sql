-- ==============================================================================
-- МИГРАЦИЯ: Удаление таблицы Textures и связанной колонки Planets.TextureId
-- Таблица не используется на клиенте (текстуры подгружаются 3D-движком из
-- статических ассетов), поэтому справочник вырезается целиком.
-- Идемпотентный скрипт — можно запускать повторно без ошибок.
-- ==============================================================================

-- 1. Снять FK Planets -> Textures (имя FK задано в init_db.sql)
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Planets_Textures'
)
BEGIN
    ALTER TABLE Planets DROP CONSTRAINT FK_Planets_Textures;
    PRINT N'Dropped FK_Planets_Textures';
END
GO

-- 2. Удалить колонку Planets.TextureId
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Planets' AND COLUMN_NAME = 'TextureId'
)
BEGIN
    ALTER TABLE Planets DROP COLUMN TextureId;
    PRINT N'Dropped Planets.TextureId';
END
GO

-- 3. Удалить таблицу Textures
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Textures'
)
BEGIN
    DROP TABLE Textures;
    PRINT N'Dropped table Textures';
END
GO

PRINT N'Migration complete: Textures removed.';
GO
