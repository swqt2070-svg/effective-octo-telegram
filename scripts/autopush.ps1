param(
  [ValidateSet("all","tracked")][string]$Mode = "all",
  [string]$Message = ""
)
$git = "C:\Program Files\Git\cmd\git.exe"
if (!(Test-Path $git)) {
  Write-Host "git not found at $git"
  exit 1
}

if ($Mode -eq "all") {
  & $git add .
} else {
  & $git add -u
}

$staged = & $git diff --cached --name-only
if (!$staged) {
  Write-Host "No changes to commit."
  exit 0
}

if (!$Message) {
  $files = $staged -split "`n" | Where-Object { $_ -ne "" }
  $count = $files.Count
  $sample = ($files | Select-Object -First 4) -join ", "
  $Message = "auto: update $count file(s)" + ($(if ($sample) { " [$sample]" } else { "" }))
}

& $git commit -m $Message
& $git push