-- ==============================================================================
-- МИГРАЦИЯ: Нормализация Programs.Disciplines / Programs.Spheres
-- Переход от NVARCHAR(MAX) CSV-строк к 1НФ:
--   Disciplines (справочник) + Program_Disciplines_Map (M:N)
--   Spheres     (справочник) + Program_Spheres_Map     (M:N)
-- Идемпотентный скрипт — можно запускать повторно без ошибок.
-- ==============================================================================

-- 1. Создание справочника дисциплин
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Disciplines')
BEGIN
    CREATE TABLE Disciplines (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL UNIQUE
    );
    PRINT N'Created table Disciplines';
END
GO

-- 2. Создание map-таблицы Programs <-> Disciplines
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Program_Disciplines_Map')
BEGIN
    CREATE TABLE Program_Disciplines_Map (
        ProgramId INT NOT NULL,
        DisciplineId INT NOT NULL,
        PRIMARY KEY (ProgramId, DisciplineId),
        CONSTRAINT FK_ProgDisc_Prog FOREIGN KEY (ProgramId) REFERENCES Programs(Id) ON DELETE CASCADE,
        CONSTRAINT FK_ProgDisc_Disc FOREIGN KEY (DisciplineId) REFERENCES Disciplines(Id) ON DELETE CASCADE
    );
    PRINT N'Created table Program_Disciplines_Map';
END
GO

-- 3. Создание справочника сфер трудоустройства
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Spheres')
BEGIN
    CREATE TABLE Spheres (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL UNIQUE
    );
    PRINT N'Created table Spheres';
END
GO

-- 4. Создание map-таблицы Programs <-> Spheres
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Program_Spheres_Map')
BEGIN
    CREATE TABLE Program_Spheres_Map (
        ProgramId INT NOT NULL,
        SphereId INT NOT NULL,
        PRIMARY KEY (ProgramId, SphereId),
        CONSTRAINT FK_ProgSph_Prog FOREIGN KEY (ProgramId) REFERENCES Programs(Id) ON DELETE CASCADE,
        CONSTRAINT FK_ProgSph_Sph FOREIGN KEY (SphereId) REFERENCES Spheres(Id) ON DELETE CASCADE
    );
    PRINT N'Created table Program_Spheres_Map';
END
GO

-- 5. Перенос данных из Programs.Disciplines (CSV) в нормализованные таблицы
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Programs' AND COLUMN_NAME = 'Disciplines'
)
BEGIN
    ;WITH Split AS (
        SELECT p.Id AS ProgramId, LTRIM(RTRIM(value)) AS Name
        FROM Programs p
        CROSS APPLY STRING_SPLIT(ISNULL(p.Disciplines, N''), N',')
        WHERE LTRIM(RTRIM(value)) <> N''
    )
    INSERT INTO Disciplines (Name)
    SELECT DISTINCT s.Name
    FROM Split s
    WHERE NOT EXISTS (SELECT 1 FROM Disciplines d WHERE d.Name = s.Name);

    ;WITH Split AS (
        SELECT p.Id AS ProgramId, LTRIM(RTRIM(value)) AS Name
        FROM Programs p
        CROSS APPLY STRING_SPLIT(ISNULL(p.Disciplines, N''), N',')
        WHERE LTRIM(RTRIM(value)) <> N''
    )
    INSERT INTO Program_Disciplines_Map (ProgramId, DisciplineId)
    SELECT DISTINCT s.ProgramId, d.Id
    FROM Split s
    JOIN Disciplines d ON d.Name = s.Name
    WHERE NOT EXISTS (
        SELECT 1 FROM Program_Disciplines_Map m
        WHERE m.ProgramId = s.ProgramId AND m.DisciplineId = d.Id
    );

    PRINT N'Migrated Programs.Disciplines into Disciplines + Program_Disciplines_Map';
END
GO

-- 6. Перенос данных из Programs.Spheres (CSV) в нормализованные таблицы
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Programs' AND COLUMN_NAME = 'Spheres'
)
BEGIN
    ;WITH Split AS (
        SELECT p.Id AS ProgramId, LTRIM(RTRIM(value)) AS Name
        FROM Programs p
        CROSS APPLY STRING_SPLIT(ISNULL(p.Spheres, N''), N',')
        WHERE LTRIM(RTRIM(value)) <> N''
    )
    INSERT INTO Spheres (Name)
    SELECT DISTINCT s.Name
    FROM Split s
    WHERE NOT EXISTS (SELECT 1 FROM Spheres sp WHERE sp.Name = s.Name);

    ;WITH Split AS (
        SELECT p.Id AS ProgramId, LTRIM(RTRIM(value)) AS Name
        FROM Programs p
        CROSS APPLY STRING_SPLIT(ISNULL(p.Spheres, N''), N',')
        WHERE LTRIM(RTRIM(value)) <> N''
    )
    INSERT INTO Program_Spheres_Map (ProgramId, SphereId)
    SELECT DISTINCT s.ProgramId, sp.Id
    FROM Split s
    JOIN Spheres sp ON sp.Name = s.Name
    WHERE NOT EXISTS (
        SELECT 1 FROM Program_Spheres_Map m
        WHERE m.ProgramId = s.ProgramId AND m.SphereId = sp.Id
    );

    PRINT N'Migrated Programs.Spheres into Spheres + Program_Spheres_Map';
END
GO

-- 7. Удаление старых денормализованных колонок
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Programs' AND COLUMN_NAME = 'Disciplines'
)
BEGIN
    ALTER TABLE Programs DROP COLUMN Disciplines;
    PRINT N'Dropped Programs.Disciplines';
END
GO

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Programs' AND COLUMN_NAME = 'Spheres'
)
BEGIN
    ALTER TABLE Programs DROP COLUMN Spheres;
    PRINT N'Dropped Programs.Spheres';
END
GO

PRINT N'Migration complete: Disciplines & Spheres normalized to 1NF.';
GO
