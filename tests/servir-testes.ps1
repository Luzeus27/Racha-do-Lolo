# Servidor local somente leitura para rodar tests/mp-flows.test.html.
# Navegadores bloqueiam fetch() em arquivos file://, por isso este servidor.
# Uso: powershell -ExecutionPolicy Bypass -File tests\servir-testes.ps1
$root = Split-Path -Parent $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://localhost:8765/')
$listener.Start()
Write-Output 'Abra http://localhost:8765/tests/mp-flows.test.html'
Write-Output 'Pressione Ctrl+C para encerrar.'
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if (-not $rel) { $rel = 'index.html' }
      $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $rel))
      if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        $ctx.Response.StatusCode = 403
      } elseif (-not [System.IO.File]::Exists($full)) {
        $ctx.Response.StatusCode = 404
      } else {
        $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
        $type = switch ($ext) {
          '.html' { 'text/html; charset=utf-8' }
          '.js'   { 'text/javascript; charset=utf-8' }
          '.mjs'  { 'text/javascript; charset=utf-8' }
          '.css'  { 'text/css; charset=utf-8' }
          '.json' { 'application/json; charset=utf-8' }
          default { 'application/octet-stream' }
        }
        $ctx.Response.ContentType = $type
        $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
        $ctx.Response.Headers.Add('Cache-Control', 'no-store')
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } catch {
      try { $ctx.Response.StatusCode = 500 } catch {}
    } finally {
      try { $ctx.Response.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
