# Racha do Lolo - checagem de seguranca somente leitura.
# Nao envia POST, nao testa senhas, nao altera dados.

$site = 'https://rachadololo.netlify.app'
$oldSite = 'https://teal-griffin-a37fbe.netlify.app/'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$report = Join-Path $rootDir 'relatorio-seguranca.txt'

function Fetch($url) {
  $out = @{ Code = 0; Body = ''; Headers = $null }
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25 -ErrorAction Stop
    $out.Code = [int]$r.StatusCode
    $out.Body = [string]$r.Content
    $out.Headers = $r.Headers
  } catch {
    $resp = $_.Exception.Response
    if ($null -ne $resp) {
      $out.Code = [int]$resp.StatusCode
      $out.Headers = $resp.Headers
      try {
        $stream = $resp.GetResponseStream()
        if ($null -ne $stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $out.Body = $reader.ReadToEnd()
          $reader.Dispose()
        }
      } catch { }
    }
  }
  return $out
}

function HeaderValue($r, $name) {
  if ($null -eq $r.Headers) { return '' }
  try { return [string]$r.Headers[$name] } catch { return '' }
}

$checks = New-Object System.Collections.ArrayList
function AddCheck($name, $ok, $detail) {
  [void]$script:checks.Add([pscustomobject]@{ Name = $name; Ok = [bool]$ok; Detail = $detail })
}

# Guarda: so grava relatorio quando o novo deploy estiver no ar.
$homePage = Fetch ($site + '/')
if ($homePage.Code -ne 200) { exit }
$viewPage = Fetch ($site + '/visualizar.html')
if ($viewPage.Code -ne 200) { exit }
$playerPage = Fetch ($site + '/jogador.html')
if ($playerPage.Code -ne 200) { exit }
$livePage = Fetch ($site + '/ao-vivo.html')
if ($livePage.Code -ne 200) { exit }

AddCheck 'Home' ($homePage.Code -eq 200) ("HTTP " + $homePage.Code)
AddCheck 'visualizar.html' ($viewPage.Code -eq 200) ("HTTP " + $viewPage.Code)
AddCheck 'jogador.html' ($playerPage.Code -eq 200) ("HTTP " + $playerPage.Code)
AddCheck 'ao-vivo.html' ($livePage.Code -eq 200) ("HTTP " + $livePage.Code)

$headerNames = @('Content-Security-Policy','Strict-Transport-Security','X-Frame-Options','Referrer-Policy','Permissions-Policy','X-Content-Type-Options')
foreach ($h in $headerNames) {
  $value = HeaderValue $homePage $h
  AddCheck ("Header " + $h) ($value.Length -gt 0) $(if ($value.Length -gt 0) { 'presente' } else { 'ausente' })
}

$markers = @('contacts','reminderTexts','"phone"','VP-','pixKey','APP_USR-')
$badView = Fetch ($site + '/.netlify/functions/get-view?token=INVALID0000000000')
$leakedView = @()
foreach ($m in $markers) { if ($badView.Body -like ('*' + $m + '*')) { $leakedView += $m } }
AddCheck 'get-view com token invalido' (($badView.Code -eq 404) -and ($leakedView.Count -eq 0)) ("HTTP " + $badView.Code + "; vazou: " + ($leakedView -join ','))

$badPlayer = Fetch ($site + '/.netlify/functions/get-player-view?v=INVALID0000000000&p=INVALID0000000000')
$leakedPlayer = @()
foreach ($m in $markers) { if ($badPlayer.Body -like ('*' + $m + '*')) { $leakedPlayer += $m } }
AddCheck 'get-player-view com token invalido' (($badPlayer.Code -in @(400,404,410)) -and ($leakedPlayer.Count -eq 0)) ("HTTP " + $badPlayer.Code + "; vazou: " + ($leakedPlayer -join ','))

$appCode = Fetch ($site + '/app.js')
$subCode = Fetch ($site + '/subscription.js')
$allCode = $appCode.Body + $subCode.Body
$secretMarkers = @('APP_USR-','MP_ACCESS_TOKEN','MP_WEBHOOK_SECRET','2c72fe0c')
$foundSecrets = @()
foreach ($m in $secretMarkers) { if ($allCode -like ('*' + $m + '*')) { $foundSecrets += $m } }
AddCheck 'Chaves fora do codigo publico' ($foundSecrets.Count -eq 0) ("encontrado: " + ($foundSecrets -join ','))

$old = Fetch $oldSite
AddCheck 'Dominio antigo fora do ar' ($old.Code -ne 200) ("HTTP " + $old.Code)

$lines = @('Racha do Lolo - checagem de seguranca (somente leitura)', ('Data: ' + (Get-Date).ToString('dd/MM/yyyy HH:mm:ss')), '')
foreach ($c in $checks) {
  $tag = if ($c.Ok) { 'PASS ' } else { 'FALHA' }
  $lines += ($tag + ' | ' + $c.Name + ' | ' + $c.Detail)
}
$lines += @('', 'Obs.: isto nao substitui revisao manual nem o teste com Strix, que fica para depois.')
Set-Content -Path $report -Value $lines -Encoding UTF8
