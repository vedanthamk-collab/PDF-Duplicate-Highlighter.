param([string]$ExtensionId='hgaoaphlcmoekjldaakdieblkhondmla',[string]$NodePath=(Get-Command node -ErrorAction Stop).Source)
$ErrorActionPreference='Stop'
if([int]((& $NodePath --version).TrimStart('v').Split('.')[0]) -lt 22){throw 'Node.js 22 or newer is required.'}
if($ExtensionId -notmatch '^[a-p]{32}$'){throw 'Use the extension ID shown at chrome://extensions.'}
$repoPath=Split-Path -Parent $PSScriptRoot
$readerPath=Join-Path $repoPath 'tmp\local-vision'
New-Item -ItemType Directory -Force $readerPath | Out-Null
$revision='1cd86afb9a95c410a6038ab3b40d8b578c892266'
$assets=@(
 @{name='model.gguf';file='Qwen3VL-4B-Instruct-Q4_K_M.gguf';hash='66358CB18BB6B3B1B6675AA412C7A88EF01D228F481184D13668E5201C730A0A'},
 @{name='vision.gguf';file='mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf';hash='30BA2C7DD3127A4561B6CBA9D13D0F711C91BDB38742E2F56D73C8CB596BD06D'}
)
foreach($asset in $assets){
 $target=Join-Path $readerPath $asset.name
 if(!(Test-Path -LiteralPath $target)){
  & curl.exe --fail --location --retry 2 --output ($target+'.part') "https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/$revision/$($asset.file)"
  if($LASTEXITCODE -ne 0){throw 'Model download failed'}
  Move-Item -LiteralPath ($target+'.part') -Destination $target
 }
 if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $asset.hash){throw "Model checksum mismatch: $($asset.name)"}
}
$runtimeZip=Join-Path $readerPath 'runtime.zip'
if(!(Test-Path -LiteralPath (Join-Path $readerPath 'runtime\llama-server.exe'))){
 & curl.exe --fail --location --retry 2 --output $runtimeZip 'https://github.com/ggml-org/llama.cpp/releases/download/b11669/llama-b11669-bin-win-cpu-x64.zip'
 if($LASTEXITCODE -ne 0){throw 'Runtime download failed'}
 if((Get-FileHash -LiteralPath $runtimeZip).Hash -ne '37B3EFCF962847CA869745FD4CCF7F5E7E8DACFEFF9FA3523B4CA8CDC66D632B'){throw 'Runtime checksum mismatch'}
 Expand-Archive -LiteralPath $runtimeZip -DestinationPath (Join-Path $readerPath 'runtime') -Force
}
foreach($asset in @('runtime\llama-server.exe','model.gguf','vision.gguf')){
 if(!(Test-Path -LiteralPath (Join-Path $readerPath $asset))){throw "Missing local model asset: $asset. See README provisioning instructions."}
}
$launcherPath=Join-Path $readerPath 'host.cmd'
$hostScript=Join-Path $PSScriptRoot 'local-reader-host.mjs'
Set-Content -LiteralPath $launcherPath -Encoding ascii -Value ('@echo off'+[Environment]::NewLine+'"'+$NodePath+'" "'+$hostScript+'"')
$manifestPath=Join-Path $readerPath 'com.pdfclaims.reader.json'
$manifest=@{name='com.pdfclaims.reader';description='Local bill image reader';path=$launcherPath;type='stdio';allowed_origins=@("chrome-extension://$ExtensionId/")} | ConvertTo-Json
[System.IO.File]::WriteAllText($manifestPath,$manifest,[System.Text.UTF8Encoding]::new($false))
$registryPath='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.pdfclaims.reader'
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath
Write-Output 'Local reader registered for this Chrome extension. Reload the extension and open a fresh viewer.'
