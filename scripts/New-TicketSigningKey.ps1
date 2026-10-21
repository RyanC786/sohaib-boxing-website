# Run this yourself in PowerShell, then paste into Netlify's protected Production
# RINGSIDE_TICKET_KEY value. This does not save or print the generated secret.
$ticketKeyBytes = New-Object byte[] 32
$ticketKeyGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $ticketKeyGenerator.GetBytes($ticketKeyBytes)
    $ticketKeyHex = -join ($ticketKeyBytes | ForEach-Object { $_.ToString('x2') })
    Set-Clipboard -Value $ticketKeyHex
    Write-Host 'A new ticket signing key is copied to your clipboard. Paste it only into Netlify, then retain it securely. Do not replace an existing ticket key.'
} finally {
    [Array]::Clear($ticketKeyBytes, 0, $ticketKeyBytes.Length)
    $ticketKeyGenerator.Dispose()
    $ticketKeyHex = $null
}
