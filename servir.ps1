$root = $PSScriptRoot
$port = 8080
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "========================================================"
Write-Host " Racha do Lolo rodando em: http://localhost:$port"
Write-Host " Para instalar no celular, use HTTPS (GitHub Pages/Netlify)"
Write-Host " ou um tunel. Pressione Ctrl+C para parar."
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
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes('404 - Not found')
    $res.ContentLength64 = $msg.Length
    $res.OutputStream.Write($msg, 0, $msg.Length)
  }
  $res.Close()
}
