# Makes the spoken counts the Lens calls on each beat: count1.wav … count8.wav in
# DanceCoachLens/Assets/Audio/Counts. Uses a Windows speech voice, sped up so "seven"
# fits in a count at 150 bpm, with the silence before and after each word cut off
# so the number lands on the beat.
#
#   powershell -ExecutionPolicy Bypass -File scripts/makeCountVoice.ps1

param(
  [string]$Voice = "Microsoft Zira Desktop",
  # 5 keeps every word under a count (0.4 s) at 150 bpm.
  [int]$Rate = 5
)

Add-Type -AssemblyName System.Speech
$outDir = Join-Path $PSScriptRoot "..\DanceCoachLens\Assets\Audio\Counts"
New-Item -ItemType Directory -Force $outDir | Out-Null

$words = "one", "two", "three", "four", "five", "six", "seven", "eight"
$sampleRate = 44100
# Quieter than this (out of 32767) counts as silence.
$threshold = 600

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo($sampleRate, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

for ($i = 0; $i -lt $words.Length; $i++) {
  $stream = New-Object System.IO.MemoryStream
  $synth.SetOutputToAudioStream($stream, $format)
  $synth.Speak($words[$i])
  $synth.SetOutputToNull()
  $pcm = $stream.ToArray()

  $n = $pcm.Length / 2
  $first = 0
  while ($first -lt $n -and [Math]::Abs([BitConverter]::ToInt16($pcm, $first * 2)) -lt $threshold) { $first++ }
  $last = $n - 1
  while ($last -gt $first -and [Math]::Abs([BitConverter]::ToInt16($pcm, $last * 2)) -lt $threshold) { $last-- }
  # Keep a few ms either side so the word doesn't click in or out.
  $pad = [int]($sampleRate * 0.005)
  $first = [Math]::Max(0, $first - $pad)
  $last = [Math]::Min($n - 1, $last + $pad)
  $len = ($last - $first + 1) * 2
  $data = New-Object byte[] $len
  [Array]::Copy($pcm, $first * 2, $data, 0, $len)

  $path = Join-Path $outDir ("count{0}.wav" -f ($i + 1))
  $w = New-Object System.IO.BinaryWriter([System.IO.File]::Create($path))
  $w.Write([Text.Encoding]::ASCII.GetBytes("RIFF")); $w.Write([int](36 + $len)); $w.Write([Text.Encoding]::ASCII.GetBytes("WAVE"))
  $w.Write([Text.Encoding]::ASCII.GetBytes("fmt ")); $w.Write([int]16); $w.Write([int16]1); $w.Write([int16]1)
  $w.Write([int]$sampleRate); $w.Write([int]($sampleRate * 2)); $w.Write([int16]2); $w.Write([int16]16)
  $w.Write([Text.Encoding]::ASCII.GetBytes("data")); $w.Write([int]$len); $w.Write($data)
  $w.Close()
  "{0}: {1:N0} ms" -f (Split-Path $path -Leaf), ($len / 2 / $sampleRate * 1000)
}
