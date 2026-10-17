"""重建内置多语言回退字体。使用隔离环境安装 fonttools[woff]==4.60.1、brotli==1.1.0。"""
import concurrent.futures
import base64
import hashlib
import json
from pathlib import Path
from shutil import which
import subprocess
import tempfile
import sys
from urllib.parse import quote, unquote

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1] / 'assets/creator-subtitle-fonts'
COMMIT = 'bf7c667ae010c0ffb39944ae85097021478cb91d'
# Full script fonts: no sample-only subsetting; shaping tables remain intact.
FAMILIES = [
    ('NotoSans', ['Latn', 'Grek', 'Cyrl'], 'U+0000-052F,U+1E00-1FFF,U+2C60-2C7F,U+A640-A69F,U+A720-A7FF', 'Tiếng Việt Ελληνικά Українська'),
    ('NotoSansArabic', ['Arab'], 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF', 'العَرَبِيَّة فارسی اردو'),
    ('NotoSansHebrew', ['Hebr'], 'U+0590-05FF,U+FB1D-FB4F', 'עברית שָׁלוֹם'),
    ('NotoSansDevanagari', ['Deva'], 'U+0900-097F,U+A8E0-A8FF', 'क्षि हिन्दी मराठी नेपाली'),
    ('NotoSansBengali', ['Beng'], 'U+0980-09FF', 'বাংলা'),
    ('NotoSansGurmukhi', ['Guru'], 'U+0A00-0A7F', 'ਪੰਜਾਬੀ'),
    ('NotoSansGujarati', ['Gujr'], 'U+0A80-0AFF', 'ગુજરાતી'),
    ('NotoSansTamil', ['Taml'], 'U+0B80-0BFF', 'தமிழ்'),
    ('NotoSansTelugu', ['Telu'], 'U+0C00-0C7F', 'తెలుగు'),
    ('NotoSansThai', ['Thai'], 'U+0E00-0E7F', 'ภาษาไทย'),
    ('NotoSansMyanmar', ['Mymr'], 'U+1000-109F,U+A9E0-A9FF,U+AA60-AA7F', 'မြန်မာ'),
    ('NotoSansKhmer', ['Khmr'], 'U+1780-17FF,U+19E0-19FF', 'ភាសាខ្មែរ'),
    ('NotoSansLao', ['Laoo'], 'U+0E80-0EFF', 'ພາສາລາວ'),
    ('NanumGothic', ['Hang'], 'U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7FF', '한국어 문장입니다'),
    ('NotoSansEthiopic', ['Ethi'], 'U+1200-139F,U+2D80-2DDF,U+AB00-AB2F', 'አማርኛ'),
    ('NotoSansJavanese', ['Java'], 'U+A980-A9DF', 'ꦧꦱꦗꦮ'),
    ('NotoSansMalayalam', ['Mlym'], 'U+0D00-0D7F', 'മലയാളം'),
    ('NotoSansKannada', ['Knda'], 'U+0C80-0CFF', 'ಕನ್ನಡ'),
    ('NotoSansOriya', ['Orya'], 'U+0B00-0B7F', 'ଓଡ଼ିଆ'),
    ('NotoSansGeorgian', ['Geor'], 'U+10A0-10FF,U+1C90-1CBF,U+2D00-2D2F', 'ქართული'),
    ('NotoSansArmenian', ['Armn'], 'U+0530-058F,U+FB13-FB17', 'Հայերեն'),
    ('NotoSansSinhala', ['Sinh'], 'U+0D80-0DFF,U+111E0-111FF', 'සිංහල'),
    ('NotoSerifTibetan', ['Tibt'], 'U+0F00-0FFF', 'བོད་སྐད་'),
]
STATIC_NOTO_FAMILIES = {
    'NotoSans', 'NotoSansEthiopic', 'NotoSansJavanese', 'NotoSansMalayalam',
    'NotoSansKannada', 'NotoSansOriya', 'NotoSansGeorgian', 'NotoSansArmenian',
    'NotoSansSinhala', 'NotoSerifTibetan',
}


def fetch(url):
    cache = ROOT.parents[1] / '.tmp/creator-font-sources'
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / hashlib.sha256(url.encode()).hexdigest()
    if not target.exists():
        temporary = target.with_suffix('.download')
        candidates = [url]
        if url.startswith('https://raw.githubusercontent.com/'):
            owner, repo, commit, path = url.removeprefix('https://raw.githubusercontent.com/').split('/', 3)
            if which('gh'):
                # The API can remain reachable when raw/CDN downloads fail.
                api_path = f'repos/{owner}/{repo}/contents/{quote(unquote(path), safe="/")}?ref={commit}'
                try:
                    result = subprocess.run(['gh', 'api', api_path], capture_output=True, timeout=60)
                    if result.returncode == 0:
                        content = json.loads(result.stdout)
                        if content.get('encoding') == 'base64':
                            data = base64.b64decode(content['content'], validate=False)
                            blob_hash = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
                            if blob_hash != content['sha']:
                                raise ValueError(f'GitHub font asset hash mismatch: {url}')
                            temporary.write_bytes(data)
                            temporary.replace(target)
                            return data
                except subprocess.TimeoutExpired:
                    pass
            candidates.insert(0, f'https://cdn.jsdelivr.net/gh/{owner}/{repo}@{commit}/{path}')
        for candidate in candidates:
            result = subprocess.run(['curl', '--fail', '--location', '--retry', '2', '--max-time', '90', '--silent', '--show-error', '--output', str(temporary), candidate])
            if result.returncode == 0:
                break
        else:
            raise RuntimeError(f'Cannot download pinned font asset: {url}')
        temporary.replace(target)
    return target.read_bytes()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def prepare(item):
    name, scripts, ranges, sample = item
    directory = name.lower()
    font_commit = COMMIT
    filename = f'{name}[wdth,wght].ttf'
    base = f'https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl/{directory}/'
    license_url = base + 'OFL.txt'
    if name in STATIC_NOTO_FAMILIES:
        font_commit = 'ffebf8c1ee449e544955a7e813c54f9b73848eac'
        filename = f'{name}-Regular.ttf'
        base = f'https://raw.githubusercontent.com/notofonts/noto-fonts/{font_commit}/hinted/ttf/{name}/'
        license_url = f'https://raw.githubusercontent.com/notofonts/noto-fonts/{font_commit}/LICENSE'
    elif name == 'NanumGothic':
        filename = 'NanumGothic-Regular.ttf'
    source_url = base + quote(filename)
    if name == 'NanumGothic':
        source_url = 'https://fonts.gstatic.com/s/nanumgothic/v26/PN_3Rfi-oW3hYwmKDpxS7F_D89jb.ttf'

    source_hash = None
    desktop = f'desktop/{name}-Regular.ttf'
    web = f'web/{name}-Regular.woff2'
    license_path = f'licenses/OFL-{name}.txt'
    if '--reuse-prepared' in sys.argv and (ROOT / desktop).exists() and TTFont(ROOT / desktop)['OS/2'].usWeightClass == 400 and (ROOT / web).exists() and (ROOT / license_path).exists():
        # These assets were already built from the pinned upstream; validate them below.
        source = (ROOT / desktop).read_bytes()
        license_data = (ROOT / license_path).read_bytes()
        cached_source = ROOT.parents[1] / '.tmp/creator-font-sources' / hashlib.sha256(source_url.encode()).hexdigest()
        if cached_source.exists():
            source_hash = sha(cached_source.read_bytes())
        else:
            previous_fonts = json.loads((ROOT / 'manifest.json').read_text()).get('fallbackFonts', [])
            previous = next((font for font in previous_fonts if font['desktopFile'] == desktop and font['desktopSha256'] == sha(source)), None)
            if previous and previous['source']['url'] == source_url:
                source_hash = previous['source'].get('sha256')
    else:
        source = fetch(source_url)
        source_hash = sha(source)
        license_data = fetch(license_url).replace(b'\r\n', b'\n')
    with tempfile.NamedTemporaryFile(suffix='.ttf') as temp:
        temp.write(source)
        temp.flush()
        font = TTFont(temp.name, recalcTimestamp=False)
        if 'fvar' in font:
            font = instantiateVariableFont(font, {axis.axisTag: 400 if axis.axisTag == 'wght' else axis.defaultValue for axis in font['fvar'].axes}, inplace=True, updateFontNames=True)
        family = font['name'].getDebugName(1)
        full = font['name'].getDebugName(4)
        font_version = font['name'].getDebugName(5)
        cmap = font.getBestCmap()
        missing = [char for char in sample if not char.isspace() and ord(char) not in cmap]
        if missing or (name != 'NanumGothic' and ('GSUB' not in font or 'GPOS' not in font)):
            raise ValueError(f'{name}: missing glyphs/shaping tables: {missing}')
        desktop = f'desktop/{name}-Regular.ttf'
        web = f'web/{name}-Regular.woff2'
        font.save(ROOT / desktop)
        font.flavor = 'woff2'
        font.save(ROOT / web)
    license_path = f'licenses/OFL-{name}.txt'
    (ROOT / license_path).write_bytes(license_data)
    return {
        'family': family, 'fullName': full, 'weight': 'regular', 'weightValue': 400,
        'scripts': scripts, 'unicodeRange': ranges, 'sample': sample,
        'desktopFile': desktop, 'desktopSha256': sha((ROOT / desktop).read_bytes()),
        'webFile': web, 'webSha256': sha((ROOT / web).read_bytes()),
        'license': license_path,
        'source': {'url': source_url, **({'commit': font_commit} if 'raw.githubusercontent.com' in source_url else {'licenseCommit': font_commit}), **({'sha256': source_hash} if source_hash else {}), 'fontVersion': font_version, 'license': 'OFL-1.1'},
    }, {'file': license_path, 'sha256': sha(license_data)}


if __name__ == '__main__':
    manifest_path = ROOT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(prepare, FAMILIES))
    manifest['version'] = 2
    manifest['fallbackFonts'] = [entry for entry, _ in results]
    old_licenses = {item['file']: item for item in manifest['licenses']}
    old_licenses.update({item['file']: item for _, item in results})
    manifest['licenses'] = list(old_licenses.values())
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    families = ', '.join(f'"{font["family"]}"' for font in manifest['fallbackFonts'])
    css = f':root {{ --creator-subtitle-fallback-families: {families}; }}\n'
    css += '\n'.join(f'@font-face {{ font-family: "{font["family"]}"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/opencreator/{Path(font["webFile"]).name}") format("woff2"); unicode-range: {font["unicodeRange"]}; }}' for font in manifest['fallbackFonts'])
    (ROOT / 'fallback-fonts.css').write_text(css + '\n')
    print(f'Prepared {len(results)} fallback families')
