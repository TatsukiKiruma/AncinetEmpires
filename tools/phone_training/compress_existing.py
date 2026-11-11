import gzip,hashlib,json,pathlib,shutil,tarfile,time

# 原始归档保留；逐包校验解压字节摘要和每个训练文件摘要。
p=pathlib.Path('C:/code/AncinetEmpires/captures/phone-storage-1000-20261015')
expected=json.loads((p/'transfer-validation.json').read_text(encoding='utf8'))['sha256']
rows=[];checked={};start=time.monotonic()
for src in sorted(p.glob('phone-storage-1000-20261015-batch-*.tar')):
 dst=src.with_suffix('.tar.gz')
 original=hashlib.file_digest(src.open('rb'),'sha256').hexdigest()
 if not dst.exists():
  partial=dst.with_suffix('.gz.partial')
  with src.open('rb') as r,gzip.open(partial,'wb',compresslevel=1) as w:shutil.copyfileobj(r,w,4*1024**2)
  partial.rename(dst)
 with gzip.open(dst,'rb') as r:decoded=hashlib.file_digest(r,'sha256').hexdigest()
 if decoded!=original:raise RuntimeError('解压摘要不一致 '+src.name)
 with tarfile.open(dst,'r:gz') as t:
  for m in t:
   if m.isfile():
    digest=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest()
    if digest!=expected[m.name]:raise RuntimeError('成员摘要不一致 '+m.name)
    checked[m.name]=digest
 row={'file':dst.name,'raw_bytes':src.stat().st_size,'compressed_bytes':dst.stat().st_size,'raw_sha256':original,'decompressed_sha256':decoded,'gzip_sha256':hashlib.file_digest(dst.open('rb'),'sha256').hexdigest()}
 rows.append(row);print(json.dumps(row),flush=True)
 report={'all_equal':len(checked)==len(expected),'files_checked':len(checked),'expected_files':len(expected),'seconds':time.monotonic()-start,'archives':rows,'originals_retained':True}
 (p/'lossless-compression-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8')
if not report['all_equal']:raise RuntimeError('归档成员数量不一致')
