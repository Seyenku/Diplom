-- =========================================
-- БД: Галактика Призвания (Stellar Vocation)
-- СУБД: Microsoft SQL Server
-- =========================================

-- 1. СИСТЕМНЫЕ ТАБЛИЦЫ И НАСТРОЙКИ

-- Таблица администраторов
CREATE TABLE Admins (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Login NVARCHAR(255) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL
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


-- 2. ИГРОВОЙ ЛОР (Справочник Галактики)

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
    CONSTRAINT FK_Planets_Clusters FOREIGN KEY (ClusterId) REFERENCES Clusters(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Planets_Textures FOREIGN KEY (TextureId) REFERENCES Textures(Id) ON DELETE SET NULL
);
GO

-- Детальное описание профессий (Связь 1 к 1 с Planets)
CREATE TABLE PlanetDetails (
    PlanetId INT PRIMARY KEY,
    Description NVARCHAR(MAX),
    HardSkills NVARCHAR(MAX),
    SoftSkills NVARCHAR(MAX),
    Risks NVARCHAR(MAX),
    CONSTRAINT FK_PlanetDetails_Planets FOREIGN KEY (PlanetId) REFERENCES Planets(Id) ON DELETE CASCADE
);
GO


-- 3. ДАННЫЕ ВУЗА (СГУ им. Питирима Сорокина)

-- Формы обучения
CREATE TABLE EduForms (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL -- Очная, Заочная, Очно-заочная
);
GO

-- Классические направления подготовки
CREATE TABLE Specializations (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Code NVARCHAR(50) NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    FormId INT NOT NULL,
    YearsEduc FLOAT NOT NULL,
    Description NVARCHAR(MAX),
    Exams NVARCHAR(MAX),
    KeyWords NVARCHAR(MAX),
    CONSTRAINT FK_Specializations_EduForms FOREIGN KEY (FormId) REFERENCES EduForms(Id)
);
GO

-- Статистика приема по годам, цены и проходные баллы
CREATE TABLE AdmissionStats (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    SpecId INT NOT NULL,
    Year INT NOT NULL,
    Price DECIMAL(10,2) NOT NULL DEFAULT 0,
    BudgetPlaces INT NOT NULL DEFAULT 0,
    MinScore INT NOT NULL DEFAULT 0,
    CONSTRAINT FK_AdmissionStats_Specializations FOREIGN KEY (SpecId) REFERENCES Specializations(Id) ON DELETE CASCADE
);
GO


-- 4. СВЯЗУЮЩЕЕ ЗВЕНО (Профориентация)

-- Таблица связи: Игровая профессия (Планета) <-> Реальное направление (Специализация)
-- Реализует связь "Многие-ко-многим"
CREATE TABLE Spec_Planet_Map (
    SpecId INT NOT NULL,
    PlanetId INT NOT NULL,
    PRIMARY KEY (SpecId, PlanetId),
    CONSTRAINT FK_Map_Specializations FOREIGN KEY (SpecId) REFERENCES Specializations(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Map_Planets FOREIGN KEY (PlanetId) REFERENCES Planets(Id) ON DELETE CASCADE
);
GO