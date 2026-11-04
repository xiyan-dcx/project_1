#!/usr/bin/env python3
"""Package an explicit source allowlist and the tested portal build, without credentials."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

PROJECT = Path(__file__).resolve().parents[2]
PLATFORM = PROJECT / 'research-platform'
WEB = PLATFORM / 'apps/scheduler-display/dist-portal'
NGINX = PLATFORM / 'dist/portal-config/scheduler-display.conf'
CONTRACT = PLATFORM / 'packages/config/portal_contract.json'
README = PROJECT / 'docs/portal-integration.md'
SOURCE_ROOTS = ('research-platform', 'server', 'k8s', 'docs', 'deploy')
SOURCE_FILES = ('.gitignore', 'README.md', 'deploy-frontend.sh', 'deploy-server.sh', 'deploy-to-node.sh')
EXCLUDED_DIRS = {'.git', '.idea', '.vscode', '.ssh', 'node_modules', 'dist', 'dist-portal',
                 '__pycache__', '.cache', 'runtime', '.runtime', 'coverage'}


def safe_file(path):
    name = path.name.lower()
    return (not path.is_symlink() and path.is_file()
            and not name.startswith(('.env', 'kubeconfig', 'id_rsa', 'id_ed25519', 'codex_remote'))
            and name not in {'.ds_store', '.npmrc', '.pnpmfile.cjs', 'credentials', 'token', 'password'}
            and not name.endswith(('.log', '.pem', '.key', '.p12', '.pfx', '.tsbuildinfo', '.pyc')))


def files_under(root):
    for child in sorted(root.iterdir()):
        if child.is_symlink():
            continue
        if child.is_dir() and child.name not in EXCLUDED_DIRS:
            yield from files_under(child)
        elif safe_file(child):
            yield child


def main():
    if not (WEB / 'index.html').is_file() or not NGINX.is_file():
        sys.exit('Run pnpm build:scheduler:portal before packaging')
    version = json.loads((PLATFORM / 'apps/scheduler-display/package.json').read_text(encoding='utf-8'))['version']
    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    html = (WEB / 'index.html').read_text(encoding='utf-8')
    if f'{contract["pageBasePath"]}assets/' not in html:
        sys.exit('Refusing to package a build with the wrong resource base path')
    scripts = list((WEB / 'assets').glob('*.js'))
    if not any(contract['apiBasePath'] in script.read_text(encoding='utf-8') for script in scripts):
        sys.exit('Refusing to package a build with the wrong API base path')

    entries = {}
    def add(path, name):
        if not safe_file(path):
            raise ValueError(f'Unsafe handoff input: {path}')
        # Source files must not contain inline private keys or kubeconfig data.
        data = path.read_bytes()
        if b'PRIVATE ' + b'KEY-----' in data or b'client-' + b'key-data:' in data:
            raise ValueError(f'Credential material found in {path.relative_to(PROJECT)}')
        entries[name] = (path, hashlib.sha256(data).hexdigest())

    add(README, 'README.md')
    add(CONTRACT, 'integration.json')
    add(PROJECT / 'docs/k8s-backend-contract.md', 'docs/k8s-backend-contract.md')
    add(PROJECT / 'docs/portal-verification.md', 'docs/portal-verification.md')
    add(NGINX, 'nginx/scheduler-display.conf')
    for path in files_under(WEB):
        add(path, 'web/' + path.relative_to(WEB).as_posix())
    for root_name in SOURCE_ROOTS:
        for path in files_under(PROJECT / root_name):
            add(path, 'source/' + path.relative_to(PROJECT).as_posix())
    for name in SOURCE_FILES:
        add(PROJECT / name, 'source/' + name)

    prefix = 'scheduler-display-portal/'
    output = PROJECT / 'dist/handoff'
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'scheduler-display-portal-{version}.zip'
    checksums = '\n'.join(f'{digest}  {name}' for name, (_, digest) in sorted(entries.items())) + '\n'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name, (path, _) in sorted(entries.items()):
            bundle.write(path, prefix + name)
        bundle.writestr(prefix + 'SHA256SUMS', checksums)
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
    print(f'Handoff: {archive}')
    print(f'Included {len(entries)} files; SHA256 {checksum}')


if __name__ == '__main__':
    main()
