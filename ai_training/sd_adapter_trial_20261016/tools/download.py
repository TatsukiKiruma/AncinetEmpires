import urllib.request, pathlib, hashlib, json

p = pathlib.Path(__file__).parent
items = [('ecj.jar', 'https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.26.0/ecj-3.26.0.jar'),
         ('dx.jar', 'https://repo.maven.apache.org/maven2/com/google/android/tools/dx/1.7/dx-1.7.jar')]
r = []
for name, url in items:
    data = urllib.request.urlopen(url, timeout=30).read()
    expected = urllib.request.urlopen(url + '.sha1', timeout=30).read().decode().split()[0]
    assert hashlib.sha1(data).hexdigest() == expected
    (p / name).write_bytes(data)
    r.append(dict(path=name, url=url, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), publishedSha1=expected))
(p / 'downloads.json').write_text(json.dumps(r, indent=2))
print(json.dumps(r))
