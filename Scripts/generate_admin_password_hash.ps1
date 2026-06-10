param(
    [Parameter(Mandatory = $true)]
    [string]$Password
)

$saltSize = 16
$hashSize = 32
$iterations = 600000

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

try {
    $salt = New-Object byte[] $saltSize
    $rng.GetBytes($salt)

    $passwordBytes = [System.Text.Encoding]::UTF8.GetBytes($Password)
    $derive = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
        $passwordBytes,
        $salt,
        $iterations,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256
    )

    try {
        $hash = $derive.GetBytes($hashSize)
        $result = New-Object byte[] ($saltSize + $hashSize)
        [Buffer]::BlockCopy($salt, 0, $result, 0, $saltSize)
        [Buffer]::BlockCopy($hash, 0, $result, $saltSize, $hashSize)
        [Convert]::ToBase64String($result)
    }
    finally {
        $derive.Dispose()
    }
}
finally {
    $rng.Dispose()
}
