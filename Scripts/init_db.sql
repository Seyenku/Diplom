-- ============================================================
--  init_db.sql — Инициализация БД «Stellar Vocation»
--  Назначение: DROP старых таблиц + CREATE новых + INSERT данных
--  БД: kosmoc | MSSQL
--
--  Запуск: sqlcmd -S . -d kosmoc -i Scripts\init_db.sql
--         или выполнить в SSMS с активным контекстом kosmoc
-- ============================================================

USE kosmoc;
GO

-- ============================================================
--  1. DROP старых таблиц (если существуют)
-- ============================================================
IF OBJECT_ID('dbo.spec_skill',       'U') IS NOT NULL DROP TABLE dbo.spec_skill;
IF OBJECT_ID('dbo.years_and_price',  'U') IS NOT NULL DROP TABLE dbo.years_and_price;
IF OBJECT_ID('dbo.spec',             'U') IS NOT NULL DROP TABLE dbo.spec;
IF OBJECT_ID('dbo.planets',          'U') IS NOT NULL DROP TABLE dbo.planets;
IF OBJECT_ID('dbo.sozvezd',          'U') IS NOT NULL DROP TABLE dbo.sozvezd;
IF OBJECT_ID('dbo.galaxy',           'U') IS NOT NULL DROP TABLE dbo.galaxy;
IF OBJECT_ID('dbo.img',              'U') IS NOT NULL DROP TABLE dbo.img;
IF OBJECT_ID('dbo.from_educ',        'U') IS NOT NULL DROP TABLE dbo.from_educ;
-- users оставляем последними — могут иметь FK
IF OBJECT_ID('dbo.game_saves',       'U') IS NOT NULL DROP TABLE dbo.game_saves;
IF OBJECT_ID('dbo.ship_upgrades',    'U') IS NOT NULL DROP TABLE dbo.ship_upgrades;

-- Если таблица users уже существует — сохраняем её структуру
-- (обновляем только колонки)
GO

-- ============================================================
--  2. Таблица users
-- ============================================================
IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.users
    (
        id        INT            IDENTITY(1,1) PRIMARY KEY,
        login     NVARCHAR(255)  NOT NULL UNIQUE,
        pass_hash NVARCHAR(255)  NOT NULL,       -- HMAC-SHA256 hex
        role      INT            NOT NULL DEFAULT 0  -- 0=нет, 1=admin
    );
END
ELSE
BEGIN
    -- Если таблица существует, но колонка называется 'pass' — переименовываем
    IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'pass'
    )
    BEGIN
        EXEC sp_rename 'dbo.users.pass', 'pass_hash', 'COLUMN';
    END
END
GO

-- ============================================================
--  3. Таблица planets (профессии-планеты)
-- ============================================================
CREATE TABLE dbo.planets
(
    id                  INT             IDENTITY(1,1) PRIMARY KEY,
    system_id           NVARCHAR(64)    NOT NULL UNIQUE,   -- 'ai-architect'
    name                NVARCHAR(255)   NOT NULL,
    category            NVARCHAR(64)    NOT NULL,          -- 'technology','medicine'...
    description         NVARCHAR(MAX)   NOT NULL DEFAULT '',
    hard_skills         NVARCHAR(MAX)   NOT NULL DEFAULT '[]', -- JSON array
    soft_skills         NVARCHAR(MAX)   NOT NULL DEFAULT '[]',
    risks               NVARCHAR(MAX)   NOT NULL DEFAULT '[]',
    crystal_req_it      INT             NOT NULL DEFAULT 0,
    crystal_req_bio     INT             NOT NULL DEFAULT 0,
    crystal_req_math    INT             NOT NULL DEFAULT 0,
    crystal_req_eco     INT             NOT NULL DEFAULT 0,
    crystal_req_design  INT             NOT NULL DEFAULT 0,
    crystal_req_med     INT             NOT NULL DEFAULT 0,
    crystal_req_neuro   INT             NOT NULL DEFAULT 0,
    crystal_req_physics INT             NOT NULL DEFAULT 0,
    is_starter_visible  BIT             NOT NULL DEFAULT 0
);
GO

-- ============================================================
--  4. Таблица ship_upgrades (апгрейды корабля)
-- ============================================================
CREATE TABLE dbo.ship_upgrades
(
    id                  INT             IDENTITY(1,1) PRIMARY KEY,
    system_id           NVARCHAR(64)    NOT NULL UNIQUE,   -- 'engine-1'
    category            NVARCHAR(32)    NOT NULL,          -- 'engine','shield','scanner','capacity'
    name                NVARCHAR(255)   NOT NULL,
    description         NVARCHAR(MAX)   NOT NULL DEFAULT '',
    cost                INT             NOT NULL DEFAULT 0,
    effect_speed_bonus  INT             NOT NULL DEFAULT 0,
    effect_shield_bonus INT             NOT NULL DEFAULT 0,
    effect_scan_range   INT             NOT NULL DEFAULT 0,
    effect_capacity     INT             NOT NULL DEFAULT 0
);
GO

-- ============================================================
--  5. Таблица game_saves (прогресс игроков)
-- ============================================================
CREATE TABLE dbo.game_saves
(
    id          INT             IDENTITY(1,1) PRIMARY KEY,
    save_key    NVARCHAR(64)    NOT NULL UNIQUE,   -- UUID из localStorage
    player_json NVARCHAR(MAX)   NOT NULL DEFAULT '{}',
    created_at  DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ============================================================
--  6. INSERT: admin-аккаунт
--
--  Пароль: admin123
--  Хэш: HMAC-SHA256(key='syktsu12', data='admin123')
--  Результат: 3ba9f22e8e26d63e2c98c1c24ddfbff0b40e01a5ee1985be942c27dc5c52abfd
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE login = N'admin')
BEGIN
    INSERT INTO dbo.users (login, pass_hash, role)
    VALUES (N'admin', N'3ba9f22e8e26d63e2c98c1c24ddfbff0b40e01a5ee1985be942c27dc5c52abfd', 1);
END
GO

-- ============================================================
--  7. INSERT: каталог планет-профессий (11 записей)
-- ============================================================
INSERT INTO dbo.planets
    (system_id, name, category, description, hard_skills, soft_skills, risks,
     crystal_req_it, crystal_req_bio, crystal_req_math, crystal_req_eco,
     crystal_req_design, crystal_req_med, crystal_req_neuro, crystal_req_physics,
     is_starter_visible)
VALUES
-- AI-архитектор
(N'ai-architect', N'AI-архитектор', N'technology',
 N'Проектирует архитектуры искусственного интеллекта, выбирает модели, оркестрирует ML-пайплайны и обеспечивает масштабируемость AI-систем.',
 N'["Machine Learning","System Design","Python/C++","MLOps"]',
 N'["Системное мышление","Коммуникация с командой","Управление неопределённостью"]',
 N'["Быстрое устаревание технологий","Высокая конкуренция"]',
 5,0,3,0,0,0,0,0, 1),

-- Big Data Analyst
(N'big-data-analyst', N'Big Data Analyst', N'technology',
 N'Анализирует огромные массивы данных, строит модели и выдаёт инсайты для бизнес-решений.',
 N'["SQL/NoSQL","Python/R","Spark","Визуализация данных"]',
 N'["Аналитическое мышление","Презентация результатов"]',
 N'["Автоматизация базовой аналитики AI-инструментами"]',
 4,0,4,0,0,0,0,0, 0),

-- ИТ-генетик
(N'it-geneticist', N'ИТ-генетик', N'biotech',
 N'Совмещает биоинформатику и программирование для анализа геномных данных и разработки персонализированных методов лечения.',
 N'["Биоинформатика","Python/R","CRISPR-аналитика","Геномика"]',
 N'["Этическое мышление","Межпрофессиональное взаимодействие"]',
 N'["Строгое регулирование отрасли","Длинный цикл исследований"]',
 3,5,0,0,0,0,0,0, 0),

-- Квантовый инженер
(N'quantum-engineer', N'Квантовый инженер', N'technology',
 N'Разрабатывает квантовые алгоритмы и аппаратные реализации квантовых вычислений.',
 N'["Квантовая физика","Qiskit/Cirq","Линейная алгебра","C++"]',
 N'["Абстрактное мышление","Терпение в исследованиях"]',
 N'["Технология на раннем этапе развития","Очень высокий порог входа"]',
 2,0,4,0,0,0,0,5, 0),

-- Куратор ИБ
(N'cybersecurity-curator', N'Куратор информационной безопасности', N'technology',
 N'Выстраивает политику ИБ организации, управляет рисками и реагирует на инциденты.',
 N'["Penetration Testing","SOC","ISO 27001","Сети и протоколы"]',
 N'["Управление рисками","Лидерство","Коммуникация"]',
 N'["Постоянное обновление угроз"]',
 4,0,0,0,0,0,0,0, 1),

-- UX-дизайнер
(N'ux-designer', N'Дизайнер интерфейсов', N'design',
 N'Проектирует пользовательский опыт цифровых продуктов: исследует потребности, создаёт прототипы и тестирует решения.',
 N'["Figma/Sketch","UX-исследования","Прототипирование","A/B тестирование"]',
 N'["Эмпатия","Критическое мышление","Презентация"]',
 N'["Автоматизация части задач AI-инструментами"]',
 2,0,0,0,5,0,0,0, 1),

-- Тканевый инженер
(N'tissue-engineer', N'Тканевый инженер', N'medicine',
 N'Создаёт биоискусственные ткани и органы для трансплантологии и регенеративной медицины.',
 N'["Клеточная биология","3D-биопечать","Биоматериалы","Регенеративная медицина"]',
 N'["Внимание к деталям","Работа в лаборатории","Этика"]',
 N'["Строгие регуляторные требования","Долгий путь к применению"]',
 0,6,0,0,0,0,0,0, 0),

-- ГМО-агроном
(N'gmo-agronomist', N'ГМО-агроном', N'ecology',
 N'Разрабатывает и внедряет генетически модифицированные культуры для устойчивого сельского хозяйства.',
 N'["Генетика растений","CRISPR","Агрономия","Экология"]',
 N'["Системное мышление","Работа с данными полевых экспериментов"]',
 N'["Общественное недоверие","Правовые ограничения в ряде стран"]',
 0,4,0,3,0,0,0,0, 0),

-- Врач персонифицированной медицины
(N'personalized-medicine-doctor', N'Врач персонифицированной медицины', N'medicine',
 N'Разрабатывает индивидуальные схемы лечения на основе генетического профиля и данных биомаркеров пациента.',
 N'["Геномика","Клиническая медицина","Биоинформатика","Фармакогеномика"]',
 N'["Эмпатия","Принятие решений в условиях неопределённости"]',
 N'["Доступность дорогостоящих технологий"]',
 0,5,0,0,0,5,0,0, 0),

-- Нейроинформатик
(N'neuroinformatician', N'Нейроинформатик', N'neuroscience',
 N'Обрабатывает и интерпретирует данные нейровизуализации (fMRI, ЭЭГ) для понимания работы мозга.',
 N'["Python/MATLAB","Нейровизуализация","Статистика","ML"]',
 N'["Терпеливость","Аналитическое мышление"]',
 N'["Узкая специализация","Зависимость от грантового финансирования"]',
 3,0,3,0,0,0,5,0, 0),

-- Инженер данных
(N'data-engineer', N'Инженер данных (Data Engineer)', N'technology',
 N'Строит и обслуживает инфраструктуру для сбора, хранения и обработки больших объёмов данных.',
 N'["Apache Spark/Kafka","SQL/NoSQL","Cloud (AWS/GCP/Azure)","Python"]',
 N'["Надёжность","Документирование","Коммуникация с аналитиками"]',
 N'["Быстрое изменение технологического ландшафта"]',
 5,0,2,0,0,0,0,0, 0);
GO

-- ============================================================
--  8. INSERT: апгрейды корабля (11 записей)
-- ============================================================
INSERT INTO dbo.ship_upgrades
    (system_id, category, name, description, cost,
     effect_speed_bonus, effect_shield_bonus, effect_scan_range, effect_capacity)
VALUES
(N'engine-1',    N'engine',   N'Форсаж I',              N'Скорость корабля +20%.',                                       5,  20, 0, 0, 0),
(N'engine-2',    N'engine',   N'Форсаж II',             N'Скорость +40%. Открывает дальние области пояса.',            15,  40, 0, 0, 0),
(N'engine-3',    N'engine',   N'Квантовый двигатель',   N'Скорость +70%. Быстрое переключение между поясами.',         35,  70, 0, 0, 0),
(N'shield-1',    N'shield',   N'Щит I',                 N'Защита +15%. Меньше урона от космического мусора.',           5,   0,15, 0, 0),
(N'shield-2',    N'shield',   N'Щит II',                N'Защита +35%. Выживание при двух столкновениях.',             15,   0,35, 0, 0),
(N'shield-3',    N'shield',   N'Голографический барьер',N'Защита +60%. Первое смертельное столкновение — автоотражение.',35, 0,60, 0, 0),
(N'scanner-1',  N'scanner',  N'Сканер I',               N'Дальность сканирования +1 туманность.',                       8,   0, 0, 1, 0),
(N'scanner-2',  N'scanner',  N'Сканер II',              N'Дальность сканирования +2.',                                 20,   0, 0, 2, 0),
(N'scanner-3',  N'scanner',  N'Нейросканер',            N'Дальность +4. Открывает все скрытые туманности.',            45,   0, 0, 4, 0),
(N'capacity-1', N'capacity', N'Расширитель трюма I',    N'Максимальный запас кристаллов +20.',                          6,   0, 0, 0,20),
(N'capacity-2', N'capacity', N'Расширитель трюма II',   N'Максимальный запас кристаллов +50.',                         18,   0, 0, 0,50);
GO

-- ============================================================
--  Проверка результата
-- ============================================================
SELECT N'users'         AS [Table], COUNT(*) AS [Rows] FROM dbo.users
UNION ALL
SELECT N'planets',        COUNT(*) FROM dbo.planets
UNION ALL
SELECT N'ship_upgrades',  COUNT(*) FROM dbo.ship_upgrades
UNION ALL
SELECT N'game_saves',     COUNT(*) FROM dbo.game_saves;
GO
