# Turns your own recordings of the counts into the clips the Lens calls on each beat:
# media/voice/1.wav … 8.wav (any format ffmpeg reads) -> DanceCoachLens/Assets/Audio/Counts/count1.wav …
# Each clip is trimmed to the word so it lands on the beat, brought to the same peak level,
# and sped up a little if it's longer than a count at 150 bpm (0.4 s), so it doesn't run into the next.
# Needs ffmpeg on the PATH. Re-run after re-recording; scripts/makeCountVoice.ps1 makes a robot voice instead.
#
#   powershell -ExecutionPolicy Bypass -File scripts/importCountVoice.ps1

param(
  [string]$InDir = (Join-Path $PSScriptRoot "..\media\voice"),
  [double]$MaxSec = 0.38,
  [double]$PeakDb = -3
)

$outDir = Join-Path $PSScriptRoot "..\DanceCoachLens\Assets\Audio\Counts"
New-Item -ItemType Directory -Force $outDir | Out-Null
$trim = "silenceremove=start_periods=1:start_threshold=-40dB,areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "count_trim.wav"

for ($n = 1; $n -le 8; $n++) {
  $in = Get-ChildItem $InDir -Filter "$n.*" | Select-Object -First 1
  if (-not $in) { throw "No $n.* in $InDir" }
  ffmpeg -v error -y -i $in.FullName -af $trim -ar 44100 -ac 1 $tmp
  $info = ffmpeg -hide_banner -i $tmp -af volumedetect -f null - 2>&1 | Out-String
  $max = [double]([regex]::Match($info, "max_volume: (-?[\d.]+) dB").Groups[1].Value)
  $sec = [double]([regex]::Match($info, "time=(\d+):(\d+):([\d.]+)").Groups[3].Value)
  $filters = @("volume=$($PeakDb - $max)dB")
  if ($sec -gt $MaxSec) { $filters += "atempo=$([Math]::Round($sec / $MaxSec, 3))" }
  # A few ms of fade-out so the cut at the end doesn't click.
  # (0.0, not 0: PowerShell would pick the integer overload and round the start to 0.)
  $fadeAt = [Math]::Max(0.0, [Math]::Min($sec, $MaxSec) - 0.02)
  $filters += "afade=t=out:st=${fadeAt}:d=0.02"
  $out = Join-Path $outDir "count$n.wav"
  ffmpeg -v error -y -i $tmp -af ($filters -join ",") -ar 44100 -ac 1 -c:a pcm_s16le $out
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed on count$n" }
  "count{0}.wav: {1:N0} ms (was {2:N0} ms)" -f $n, ([Math]::Min($sec, $MaxSec) * 1000), ($sec * 1000)
}
Remove-Item $tmp -ErrorAction SilentlyContinue
