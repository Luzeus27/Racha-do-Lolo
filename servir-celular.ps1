# Serve o app na rede local para testar no celular.
# Precisa executar como Administrador (o .bat faz isso automaticamente).

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$port = 8080
$ruleName = 'Racha do Lolo 8080'

# Reserva a URL para o usuario atual (necessario para HttpListener em http://+)
$user = "$env:USERDOMAIN\$env:USERNAME"
netsh http add urlacl url="http://+:$port/" user="$user" 2>$null | Out-Null

# Libera a porta no Firewall do Windows
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
}

# Encerra o servidor antigo (localhost-only), se estiver rodando
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*servir.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://+:$port/")
$listener.Start()

$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress

Write-Host "========================================================"
Write-Host " Racha do Lolo - modo CELULAR"
Write-Host " No PC:      http://localhost:$port"
Write-Host " No celular: http://$ip`:$port  (mesmo Wi-Fi)"
Write-Host " Pressione Ctrl+C para parar."
Write-Host "========================================================"

$mimes = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
  if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
  $file = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $rel))
  if (-not $file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    $res.StatusCode = 403
    $res.Close()
    continue
  }
  if (Test-Path $file -PathType Leaf) {
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    $res.ContentType = if ($mimes.ContainsKey($ext)) { $mimes[$ext] } else { 'application/octet-stream' }
    $res.ContentLength64 = $bytes.Length
    $res.AddHeader('Cache-Control', 'no-store')
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes('404 - Not found')
    $res.ContentLength64 = $msg.Length
    $res.OutputStream.Write($msg, 0, $msg.Length)
  }
  $res.Close()
}
