-- ==============================================================================
-- БД: Галактика Призвания (Stellar Vocation)
-- СУБД: Microsoft SQL Server
-- Состояние: 3 Нормальная Форма (3NF) + Аналитика
-- ==============================================================================

-- ==============================================================================
-- 1. СИСТЕМНЫЕ ТАБЛИЦЫ И НАСТРОЙКИ
-- ==============================================================================

-- Таблица ролей администраторов
CREATE TABLE AdminRoles (
    Id INT PRIMARY KEY,
    RoleName NVARCHAR(50) NOT NULL -- 'SuperAdmin', 'Admin'
);
GO

-- Базовое наполнение ролей
INSERT INTO AdminRoles (Id, RoleName) VALUES 
(1, 'SuperAdmin'), 
(2, 'Admin');
GO

-- Таблица администраторов
CREATE TABLE Admins (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Login NVARCHAR(255) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    RoleId INT NOT NULL,
    CONSTRAINT FK_Admins_Roles FOREIGN KEY (RoleId) REFERENCES AdminRoles(Id)
);
GO

-- Таблица глобальных настроек игры (LiveOps)
CREATE TABLE GameSettings (
    KeyName NVARCHAR(100) PRIMARY KEY,
    Value NVARCHAR(255) NOT NULL,
    Description NVARCHAR(255)
);
GO

-- Справочник текстур/ассетов для 3D-движка
CREATE TABLE Textures (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    FileName NVARCHAR(255) NOT NULL,
    AssetType NVARCHAR(50) NOT NULL -- Например: 'Planet', 'Asteroid'
);
GO


-- ==============================================================================
-- 2. ИГРОВОЙ ЛОР (Справочник Галактики)
-- ==============================================================================

-- Астероидные пояса (Образовательные направления)
CREATE TABLE Clusters (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX)
);
GO

-- Планеты (Профессии будущего)
CREATE TABLE Planets (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    ClusterId INT NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    TextureId INT,
    ScanCost INT NOT NULL DEFAULT 0,
    Description NVARCHAR(MAX),
    CONSTRAINT FK_Planets_Clusters FOREIGN KEY (ClusterId) REFERENCES Clusters(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Planets_Textures FOREIGN KEY (TextureId) REFERENCES Textures(Id) ON DELETE SET NULL
);
GO

-- Справочник навыков
CREATE TABLE Skills (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL UNIQUE,
    SkillType NVARCHAR(20) -- Например: 'Hard', 'Soft'. (Опционально можно добавить CHECK (SkillType IN ('Hard', 'Soft')))
);
GO

-- Связь: Планеты <-> Навыки (Многие-ко-многим)
CREATE TABLE Planet_Skills_Map (
    PlanetId INT NOT NULL,
    SkillId INT NOT NULL,
    PRIMARY KEY (PlanetId, SkillId),
    CONSTRAINT FK_PS_Planet FOREIGN KEY (PlanetId) REFERENCES Planets(Id) ON DELETE CASCADE,
    CONSTRAINT FK_PS_Skill FOREIGN KEY (SkillId) REFERENCES Skills(Id) ON DELETE CASCADE
);
GO

-- Справочник рисков профессий (Угроза автоматизации, выгорание и т.д.)
CREATE TABLE Risks (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX)
);
GO

-- Связь: Планеты <-> Риски (Многие-ко-многим)
CREATE TABLE Planet_Risks_Map (
    PlanetId INT NOT NULL,
    RiskId INT NOT NULL,
    PRIMARY KEY (PlanetId, RiskId),
    CONSTRAINT FK_PR_Planet FOREIGN KEY (PlanetId) REFERENCES Planets(Id) ON DELETE CASCADE,
    CONSTRAINT FK_PR_Risk FOREIGN KEY (RiskId) REFERENCES Risks(Id) ON DELETE CASCADE
);
GO


-- ==============================================================================
-- 3. ДАННЫЕ ВУЗА (Образовательный блок)
-- ==============================================================================

-- Формы обучения (Очная, Заочная и т.д.)
CREATE TABLE EduForms (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL
);
GO

-- Базовые направления подготовки (Справочник кодов)
CREATE TABLE BaseSpecializations (
    Code NVARCHAR(50) PRIMARY KEY, -- Например '09.03.03'
    Title NVARCHAR(255) NOT NULL
);
GO

-- Конкретные программы обучения вуза
CREATE TABLE Programs (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    SpecCode NVARCHAR(50) NOT NULL,
    FormId INT NOT NULL,
    YearsEduc FLOAT NOT NULL,
    Description NVARCHAR(MAX),
    CONSTRAINT FK_Programs_BaseSpec FOREIGN KEY (SpecCode) REFERENCES BaseSpecializations(Code) ON DELETE CASCADE,
    CONSTRAINT FK_Programs_EduForms FOREIGN KEY (FormId) REFERENCES EduForms(Id)
);
GO

-- Справочник предметов ЕГЭ / Вступительных испытаний
CREATE TABLE Subjects (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL UNIQUE
);
GO

-- Связь: Программы <-> Предметы (Многие-ко-многим с указанием минимального балла)
CREATE TABLE Program_Subjects_Map (
    ProgramId INT NOT NULL,
    SubjectId INT NOT NULL,
    MinScore INT DEFAULT 0,
    PRIMARY KEY (ProgramId, SubjectId),
    CONSTRAINT FK_ProgSubj_Prog FOREIGN KEY (ProgramId) REFERENCES Programs(Id) ON DELETE CASCADE,
    CONSTRAINT FK_ProgSubj_Subj FOREIGN KEY (SubjectId) REFERENCES Subjects(Id) ON DELETE CASCADE
);
GO

-- Статистика приема (Композитный ключ ProgramId + Year гарантирует уникальность отчета за год)
CREATE TABLE AdmissionStats (
    ProgramId INT NOT NULL,
    Year INT NOT NULL,
    Price DECIMAL(10,2) NOT NULL DEFAULT 0,
    BudgetPlaces INT NOT NULL DEFAULT 0,
    MinPassingScore INT NOT NULL DEFAULT 0,
    PRIMARY KEY (ProgramId, Year),
    CONSTRAINT FK_Stats_Program FOREIGN KEY (ProgramId) REFERENCES Programs(Id) ON DELETE CASCADE
);
GO


-- ==============================================================================
-- 4. СВЯЗУЮЩЕЕ ЗВЕНО (Профориентация)
-- ==============================================================================

-- Связь: Игровая профессия (Планета) <-> Реальное направление (BaseSpecializations)
CREATE TABLE Spec_Planet_Map (
    SpecCode NVARCHAR(50) NOT NULL,
    PlanetId INT NOT NULL,
    PRIMARY KEY (SpecCode, PlanetId),
    CONSTRAINT FK_Map_BaseSpec FOREIGN KEY (SpecCode) REFERENCES BaseSpecializations(Code) ON DELETE CASCADE,
    CONSTRAINT FK_Map_Planets FOREIGN KEY (PlanetId) REFERENCES Planets(Id) ON DELETE CASCADE
);
GO


-- ==============================================================================
-- 5. АНАЛИТИКА И ТЕЛЕМЕТРИЯ (Логирование активности)
-- ==============================================================================

-- Игровые сессии
CREATE TABLE PlayerSessions (
    SessionId UNIQUEIDENTIFIER PRIMARY KEY, -- GUID генерируется клиентом
    StartTime DATETIME2 NOT NULL,
    EndTime DATETIME2,
    TotalPlayTimeSeconds INT DEFAULT 0,
    DeviceType NVARCHAR(100),
    ConstellationResult NVARCHAR(MAX) -- JSON с итоговыми результатами
);
GO

-- Логи действий внутри сессии
CREATE TABLE ActionLogs (
    Id BIGINT IDENTITY(1,1) PRIMARY KEY,
    SessionId UNIQUEIDENTIFIER NOT NULL,
    ActionType NVARCHAR(50) NOT NULL,
    TargetId INT, -- ID объекта (например, планеты). Не связываем жестким FK для сохранения истории
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    Details NVARCHAR(MAX), -- JSON с параметрами события
    CONSTRAINT FK_ActionLogs_Sessions FOREIGN KEY (SessionId) REFERENCES PlayerSessions(SessionId) ON DELETE CASCADE
);
GO

-- Индексы для ускорения выборок по аналитике
CREATE NONCLUSTERED INDEX IX_ActionLogs_SessionId ON ActionLogs(SessionId);
GO
CREATE NONCLUSTERED INDEX IX_ActionLogs_ActionType ON ActionLogs(ActionType);
GO