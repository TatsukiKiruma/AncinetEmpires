param([switch]$Execute)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath('C:\code\AncinetEmpires\ai_training').TrimEnd('\')
$audit=$PSScriptRoot
# 按物理文件标识与分配字节统计，避免把硬链接重复计作释放空间。
Add-Type @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public class HistoricalFileStat {
 [StructLayout(LayoutKind.Sequential)] struct Info { public uint attr; public System.Runtime.InteropServices.ComTypes.FILETIME c,a,w; public uint vol,hi,lo,links,idhi,idlo; }
 [StructLayout(LayoutKind.Sequential)] struct Standard { public long allocated,length; public uint links; public byte pending,dir; }
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int cls,out Standard i,uint size);
 public string id; public long allocated; public long bytes; public uint links;
 public static HistoricalFileStat Read(string path) {
  using(var h=File.OpenHandle(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)) {
   Info i; Standard s;
   if(!GetFileInformationByHandle(h,out i)||!GetFileInformationByHandleEx(h,1,out s,(uint)Marshal.SizeOf<Standard>())) throw new System.ComponentModel.Win32Exception();
   return new HistoricalFileStat { id=i.vol.ToString("X8")+":"+i.idhi.ToString("X8")+i.idlo.ToString("X8"),allocated=s.allocated,bytes=s.length,links=s.links };
  }
 }
}
'@
function Check-Path([string]$p){
 $full=[IO.Path]::GetFullPath($p)
 if(-not $full.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw "路径越界: $full"}
 $item=Get-Item -LiteralPath $full -Force
 while($null -ne $item -and $item.FullName.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "不对链接路径直接删除: $($item.FullName)"}
  $item=if($item.PSIsContainer){$item.Parent}else{$item.Directory}
 }
 return $full
}
function Files-In([string]$folder){
 $entry=Get-Item -LiteralPath $folder -Force
 if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){
  $resolved=$entry.ResolveLinkTarget($true).FullName
  if(-not $resolved.StartsWith($root+'\archive\model_retirement_20261014\payload\',[StringComparison]::OrdinalIgnoreCase)){throw '非已知归档链接'}
  $folder=Check-Path $resolved
 }
 foreach($item in Get-ChildItem -LiteralPath $folder -Force){
  if($item.PSIsContainer){Files-In $item.FullName}else{[void](Check-Path $item.FullName);$item}
 }
}
function Weight-File($file){
 if($file.Extension -eq '.pt'){return $true}
 if($file.Extension -ne '.json'){return $false}
 $v=Get-Content -LiteralPath $file.FullName -Raw|ConvertFrom-Json
 return ($null -ne $v.stem.weights -and $null -ne $v.polDense1.weights)
}
function Row([string]$path){
 $p=Check-Path $path;$s=[HistoricalFileStat]::Read($p)
 [pscustomobject]@{path=$p;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant();id=$s.id;bytes=$s.bytes;allocatedBytes=$s.allocated;links=$s.links}
}
$representatives=@(
 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json',
 'r7_training_stage_20261014_083500/artifacts/models/theta1_baseline.json',
 'r8_pure_policy_stage_20261014_125300/checkpoints/r1_warm/best.json'
) | ForEach-Object {[IO.Path]::GetFullPath((Join-Path $root $_))}
$modelRoots=@('v16/out/v16_20260926_core/experiments/P1','v19/out/run_20260929_v19_02/experiments/ppo_w1','r6_model_training_20261014_063500/artifacts/models','r7_training_stage_20261014_083500/artifacts/models','r8_pure_policy_stage_20261014_125300/checkpoints')
if(-not $Execute){
 if(Test-Path -LiteralPath (Join-Path $audit 'plan.json')){throw '计划已存在'}
 $files=@(foreach($rel in $modelRoots){Files-In (Join-Path $root $rel)})
 $weights=@($files|Where-Object {Weight-File $_})
 $selected=@{};foreach($file in $weights){$selected[$file.FullName]=$true}
 # 相同物理权重的额外名字也是重复副本；仅纳入训练树中的权重文件。
 $linkEvidence=@()
 foreach($file in $weights){
  $s=[HistoricalFileStat]::Read($file.FullName)
  if($s.links -gt 1){
   $names=@(& fsutil hardlink list $file.FullName)
   if($LASTEXITCODE -ne 0){throw '读取硬链接失败'}
   foreach($name in $names){
    $p='C:'+$name.Trim()
    $p=Check-Path $p
    if(-not (Weight-File (Get-Item -LiteralPath $p))){throw '硬链接目标不是权重'}
    if(([HistoricalFileStat]::Read($p)).id -ne $s.id){throw '硬链接身份不符'}
    $selected[$p]=$true
    $linkEvidence+=[pscustomobject]@{original=$file.FullName;alias=$p;id=$s.id}
   }
  }
 }
 $delete=@(foreach($p in $selected.Keys|Sort-Object){if($p -notin $representatives){Row $p}})
 $preserve=@(foreach($file in $files){if($file.FullName -notin $delete.path){Row $file.FullName}})
 # 当前模型、其训练数据/战术特征及战报整体校验；不改原始清单。
 foreach($rel in @('sd64x3_phone_20261016','sd64x3_phone_battles_20261016','sd32_phone_20261016')){
  foreach($file in Files-In (Join-Path $root $rel)){$preserve+=Row $file.FullName}
 }
 $groups=@($delete|Group-Object id|ForEach-Object{
  $first=$_.Group[0]
  [pscustomobject]@{id=$_.Name;selectedLinks=$_.Count;originalLinks=$first.links;bytes=$first.bytes;allocatedBytes=$first.allocatedBytes;reclaimable=($_.Count -eq $first.links)}
 })
 $plan=[ordered]@{at=(Get-Date).ToString('o');scope='P1、θ1、R6/R7/R8相关历史权重和其硬链接重复副本；不删除报告、配置、战报或其它不相关模型';representatives=@($representatives|ForEach-Object {Row $_});delete=$delete;preserved=$preserve;physicalGroups=$groups;hardlinks=$linkEvidence;estimatedFreedBytes=($groups|Where-Object reclaimable|Measure-Object allocatedBytes -Sum).Sum}
 $plan|ConvertTo-Json -Depth 9|Set-Content -LiteralPath (Join-Path $audit 'plan.json') -Encoding utf8
 [pscustomobject]@{deletePaths=$delete.Count;logicalMiB=[math]::Round(($delete|Measure-Object bytes -Sum).Sum/1MB,3);physicalFiles=@($groups|Where-Object reclaimable).Count;allocatedMiB=[math]::Round($plan.estimatedFreedBytes/1MB,3);preserved=$preserve.Count;representatives=$plan.representatives}|ConvertTo-Json -Depth 5
 exit
}
$plan=Get-Content -LiteralPath (Join-Path $audit 'plan.json') -Raw|ConvertFrom-Json
$journal=Join-Path $audit 'deleted.jsonl'
if(Test-Path -LiteralPath $journal){throw '拒绝重复删除'}
foreach($entry in $plan.delete){
 $now=Row $entry.path
 if($entry.path -in $representatives -or $now.id -ne $entry.id -or $now.sha256 -ne $entry.sha256 -or $now.links -ne $entry.links -or $now.allocatedBytes -ne $entry.allocatedBytes){throw "计划后身份变化: $($entry.path)"}
 $h=[IO.File]::Open($entry.path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None);$h.Dispose()
}
$freeBefore=([IO.DriveInfo]::new('C')).AvailableFreeSpace
$events=@()
foreach($entry in $plan.delete){
 [void](Check-Path $entry.path)
 $before=[HistoricalFileStat]::Read($entry.path)
 if($before.id -ne $entry.id){throw '删除前文件身份变化'}
 Remove-Item -LiteralPath $entry.path -Force
 $event=[pscustomobject]@{path=$entry.path;id=$entry.id;sha256=$entry.sha256;bytes=$entry.bytes;linksBefore=$before.links;releasedAllocationBytes=$(if($before.links -eq 1){$before.allocated}else{0});at=(Get-Date).ToString('o')}
 $event|ConvertTo-Json -Compress|Add-Content -LiteralPath $journal -Encoding utf8
 $events+=$event
}
$freeAfter=([IO.DriveInfo]::new('C')).AvailableFreeSpace
$changed=@(foreach($entry in $plan.preserved){if(-not(Test-Path -LiteralPath $entry.path)){ $entry.path }elseif((Get-FileHash -LiteralPath $entry.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){$entry.path}})
$remaining=@($plan.delete|Where-Object {Test-Path -LiteralPath $_.path})
$kept=@($plan.representatives|ForEach-Object {Row $_.path})
$summary=[ordered]@{at=(Get-Date).ToString('o');deletedPaths=$events.Count;deletedPhysicalFiles=@($events|Where-Object releasedAllocationBytes -gt 0).Count;logicalBytes=($events|Measure-Object bytes -Sum).Sum;releasedAllocationBytes=($events|Measure-Object releasedAllocationBytes -Sum).Sum;diskFreeBefore=$freeBefore;diskFreeAfter=$freeAfter;diskFreeDelta=($freeAfter-$freeBefore);diskDeltaCaveat='其它任务并行写盘，整盘空闲差值不是本次清理单独贡献';preservedChecked=$plan.preserved.Count;changedPreserved=$changed;remainingDeletedPaths=$remaining.path;representatives=$kept}
$summary|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $audit 'summary.json') -Encoding utf8
$summary|ConvertTo-Json -Depth 6
if($changed.Count -or $remaining.Count){throw '清理后校验未通过'}
