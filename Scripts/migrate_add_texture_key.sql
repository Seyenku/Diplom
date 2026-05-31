-- ==============================================================================
-- MIGRATION: Planets.TextureKey
-- Добавляет колонку TextureKey для привязки планет к текстурам.
-- Заполняет значения для всех 31 планеты согласно маппингу из плана.
-- ==============================================================================

-- 1. Добавление колонки (идемпотентно)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = N'TextureKey' AND Object_ID = Object_ID(N'dbo.Planets')
)
BEGIN
    ALTER TABLE dbo.Planets ADD TextureKey NVARCHAR(64) NULL;
END
GO

-- 2. Заполнение TextureKey для существующих планет

-- ──────────────────────────────────────────────────────────────────────────────
-- Кластер 1: Программирование (id 1–14) — техно/синтетика/космос
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE dbo.Planets SET TextureKey = 'neptune'        WHERE Id = 1;   -- AI-архитектор
UPDATE dbo.Planets SET TextureKey = 'gasgiant-blue'  WHERE Id = 2;   -- Big Data Analyst
UPDATE dbo.Planets SET TextureKey = 'metall'         WHERE Id = 3;   -- Архитектор ИС
UPDATE dbo.Planets SET TextureKey = 'glass'          WHERE Id = 4;   -- Дизайнер интерфейсов
UPDATE dbo.Planets SET TextureKey = 'met2'           WHERE Id = 5;   -- ИТ-аудитор
UPDATE dbo.Planets SET TextureKey = 'zks'            WHERE Id = 6;   -- Инженер данных
UPDATE dbo.Planets SET TextureKey = 'vortex'         WHERE Id = 7;   -- Инженер IoT
UPDATE dbo.Planets SET TextureKey = 'uvbluesun'      WHERE Id = 8;   -- Квантовый инженер
UPDATE dbo.Planets SET TextureKey = 'iceworld2'      WHERE Id = 9;   -- Кибернетик
UPDATE dbo.Planets SET TextureKey = 'ice'            WHERE Id = 10;  -- Куратор инфобеза
UPDATE dbo.Planets SET TextureKey = 'mh'             WHERE Id = 11;  -- Разраб. диспетчеризации
UPDATE dbo.Planets SET TextureKey = 'hs'             WHERE Id = 12;  -- Разраб. моделей Big Data
UPDATE dbo.Planets SET TextureKey = 'gasgiant-blue'  WHERE Id = 13;  -- Специалист по ИИ
UPDATE dbo.Planets SET TextureKey = 'vortex'         WHERE Id = 14;  -- Компьютерное зрение

-- ──────────────────────────────────────────────────────────────────────────────
-- Кластер 2: Медицина (id 15–26) — тёплые/органические/газовые
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE dbo.Planets SET TextureKey = 'dgnyre'                       WHERE Id = 15;  -- Врач персон. медицины
UPDATE dbo.Planets SET TextureKey = 'ertaale'                      WHERE Id = 16;  -- Генетический консультант
UPDATE dbo.Planets SET TextureKey = 'gas_yellow'                   WHERE Id = 17;  -- Геронтолог
UPDATE dbo.Planets SET TextureKey = 'jupiter'                      WHERE Id = 18;  -- Молекулярный диетолог
UPDATE dbo.Planets SET TextureKey = 'venmap'                       WHERE Id = 19;  -- Неонатолог
UPDATE dbo.Planets SET TextureKey = 'mars2'                        WHERE Id = 20;  -- Оператор медроботов
UPDATE dbo.Planets SET TextureKey = 'ertaale_ast_2006036_lrg'      WHERE Id = 21;  -- Тканевый инженер
UPDATE dbo.Planets SET TextureKey = 'hst_saturn_nicmos'            WHERE Id = 22;  -- Биоинформатик
UPDATE dbo.Planets SET TextureKey = 'jupiter'                      WHERE Id = 23;  -- ИТ-генетик
UPDATE dbo.Planets SET TextureKey = 'mars'                         WHERE Id = 24;  -- Клин. биоинформатик
UPDATE dbo.Planets SET TextureKey = 'hs'                           WHERE Id = 25;  -- Нейроинформатик
UPDATE dbo.Planets SET TextureKey = 'mh'                           WHERE Id = 26;  -- Спец. по нейромоделированию

-- ──────────────────────────────────────────────────────────────────────────────
-- Кластер 3: Геология (id 27–31) — каменные/земные
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE dbo.Planets SET TextureKey = 'earth'    WHERE Id = 27;  -- ГМО-агроном
UPDATE dbo.Planets SET TextureKey = 'mercury'  WHERE Id = 28;  -- Эко-безопасность
UPDATE dbo.Planets SET TextureKey = 'moon34'   WHERE Id = 29;  -- Кибертехник умных сред
UPDATE dbo.Planets SET TextureKey = 'moon'     WHERE Id = 30;  -- Спец. киберфиз.систем
UPDATE dbo.Planets SET TextureKey = 'pluto'    WHERE Id = 31;  -- Спец. виртуального прототипирования
GO

PRINT N'TextureKey migration completed: 31 planets updated';
GO
