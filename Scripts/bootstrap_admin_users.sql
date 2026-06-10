/*
    Bootstrap initial admin users for the kosmoc database.

    1. Generate password hashes:
       powershell -ExecutionPolicy Bypass -File .\Scripts\generate_admin_password_hash.ps1 -Password "your-superadmin-password"
       powershell -ExecutionPolicy Bypass -File .\Scripts\generate_admin_password_hash.ps1 -Password "your-admin-password"

    2. Paste the generated hashes into the variables below.
    3. Run this script against the current project database.
*/

USE [kosmoc];
GO

SET NOCOUNT ON;

DECLARE @SuperAdminLogin NVARCHAR(255) = N'superadmin';
DECLARE @SuperAdminPasswordHash NVARCHAR(255) = N'<PASTE_SUPERADMIN_HASH>';

DECLARE @AdminLogin NVARCHAR(255) = N'admin';
DECLARE @AdminPasswordHash NVARCHAR(255) = N'<PASTE_ADMIN_HASH>';

IF @SuperAdminPasswordHash LIKE N'<PASTE_%' OR @AdminPasswordHash LIKE N'<PASTE_%'
    THROW 50001, 'Paste generated password hashes before running this script.', 1;

MERGE dbo.AdminRoles WITH (HOLDLOCK) AS target
USING (VALUES
    (1, N'SuperAdmin'),
    (2, N'Admin')
) AS source (Id, RoleName)
ON target.Id = source.Id
WHEN MATCHED THEN
    UPDATE SET RoleName = source.RoleName
WHEN NOT MATCHED THEN
    INSERT (Id, RoleName)
    VALUES (source.Id, source.RoleName);

MERGE dbo.Admins WITH (HOLDLOCK) AS target
USING (VALUES
    (@SuperAdminLogin, @SuperAdminPasswordHash, 1),
    (@AdminLogin, @AdminPasswordHash, 2)
) AS source (Login, PasswordHash, RoleId)
ON target.Login = source.Login
WHEN MATCHED THEN
    UPDATE SET
        PasswordHash = source.PasswordHash,
        RoleId = source.RoleId
WHEN NOT MATCHED THEN
    INSERT (Login, PasswordHash, RoleId)
    VALUES (source.Login, source.PasswordHash, source.RoleId);

SELECT a.Id, a.Login, r.RoleName
FROM dbo.Admins a
JOIN dbo.AdminRoles r ON r.Id = a.RoleId
WHERE a.Login IN (@SuperAdminLogin, @AdminLogin)
ORDER BY a.Id;
