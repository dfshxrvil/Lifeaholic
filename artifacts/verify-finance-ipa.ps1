$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$buildId = '34770976775'
$artifactDirectory = $PSScriptRoot
$archivePath = Join-Path $artifactDirectory "Lifeaholic-finance-$buildId.zip"
$metadata = Get-Content -LiteralPath (Join-Path $artifactDirectory "Lifeaholic-finance-$buildId.json") -Raw | ConvertFrom-Json
$artifactHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($metadata.digest -and $metadata.digest -ne "sha256:$artifactHash") { throw 'Downloaded artifact hash mismatch' }
$ipaPath = Join-Path $artifactDirectory 'Lifeaholic-finance-8697298.ipa'
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $entry = $archive.GetEntry('Lifeaholic-sideloadly.ipa')
  if (-not $entry) { throw 'IPA missing from workflow artifact' }
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $ipaPath, $true)
} finally { $archive.Dispose() }
$ipa = [System.IO.Compression.ZipFile]::OpenRead($ipaPath)
try {
  foreach ($required in @('Payload/Lifeaholic.app/Lifeaholic', 'Payload/Lifeaholic.app/Info.plist', 'Payload/Lifeaholic.app/main.jsbundle', 'Payload/Lifeaholic.app/PlugIns/ExpoWidgetsTarget.appex/Info.plist', 'Payload/Lifeaholic.app/_CodeSignature/CodeResources')) {
    $entry = $ipa.GetEntry($required)
    if (-not $entry -or $entry.Length -le 0) { throw "Missing or empty IPA component: $required" }
  }
  $stream = $ipa.GetEntry('Payload/Lifeaholic.app/main.jsbundle').Open()
  $memory = [System.IO.MemoryStream]::new()
  try {
    $stream.CopyTo($memory)
    $bundleText = [System.Text.Encoding]::UTF8.GetString($memory.ToArray())
    if (-not $bundleText.Contains('save_expense_ledger_v2')) { throw 'Atomic finance save RPC not found in compiled bundle' }
  } finally { $stream.Dispose(); $memory.Dispose() }
} finally { $ipa.Dispose() }
$hash = (Get-FileHash -LiteralPath $ipaPath -Algorithm SHA256).Hash
Set-Content -LiteralPath "$ipaPath.sha256" -Value "$hash  Lifeaholic-finance-8697298.ipa"
[pscustomobject]@{ Path = $ipaPath; SizeMB = [math]::Round((Get-Item -LiteralPath $ipaPath).Length / 1MB, 2); SHA256 = $hash; Commit = $metadata.sha; Verified = 'App, widget extension, signature resources, updated finance bundle, artifact digest' } | ConvertTo-Json
