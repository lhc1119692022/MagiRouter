"""Create or verify a Docker source context, never a backup of the checkout."""
import argparse
import gzip
import hashlib
import io
import re
import subprocess
import tarfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {'.dockerignore', 'Dockerfile', 'LICENSE', 'NOTICE', 'THIRD-PARTY-LICENSES.md', 'VERSION', 'go.mod', 'go.sum', 'main.go'}
GO_DIRS = set('common constant controller dto i18n logger middleware model oauth pkg plugins relay relaykit router service setting tokenkit types'.split())
WEB_FILES = {'bun.lock', 'index.html', 'package.json', 'rsbuild.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json'}
PUBLIC = set('apple-touch-icon.png cc-switch-icon.png favicon-16.png favicon-32.png favicon-48.png favicon-mr.ico favicon.ico favicon.svg icon-192.png icon-512.png icon-maskable-512.png logo.png magirouter-logo.png magpie-icon.svg pay-apple.png pay-card.png pay-google.png site.webmanifest waffo-logo-dark.svg waffo-logo-light.svg'.split())
PRIVATE = {'local-state', 'node_modules', 'logs', 'backup', 'backups', 'secrets', 'credentials', 'accounts', '__tests__', 'testdata', '__mocks__'}
UNSAFE = re.compile(rb'host[.]docker[.]internal:\d+|(?:127[.]0[.]0[.]1|localhost):7890\b|-----BEGIN (?:\w+ )?PRIVATE KEY-----(?:\s|\\[nr])+[A-Z\d+/=]{24,}|(?<![\w-])(?:sk-(?:proj-|svcacct-)?[\w-]{32,}|ghp_[a-z\d]{36,}|AKIA[A-Z\d]{16})(?![\w-])', re.I)


def allowed(name):
    parts = PurePosixPath(name).parts
    if not parts or '/'.join(parts) != name or '\\' in name or ':' in name or name.startswith('/'):
        return False
    if name in ROOT_FILES:
        return True
    if any(part.startswith('.') or part.casefold() in PRIVATE for part in parts):
        return False
    path = PurePosixPath(name)
    if re.search(r'(?:^|[.-])(?:bak|backup|old|local)[.]', path.name, re.I) or re.search(r'\.(?:test|spec)\.[cm]?[jt]sx?$', path.name) or path.name.endswith('_test.go'):
        return False
    if parts[0] in GO_DIRS and path.suffix == '.go':
        return True
    if name in {'relaykit/go.mod', 'relaykit/go.sum', 'tokenkit/go.mod', 'tokenkit/go.sum', 'common/log_text.zh-CN.json', 'common/limiter/lua/rate_limit.lua'}:
        return True
    if re.fullmatch(r'i18n/locales/(?:en|zh-CN)\.yaml|plugins/tasks/[\w-]+/(?:plugin\.js|icon\.svg)', name):
        return True
    if len(parts) == 2 and parts[0] == 'web':
        return parts[1] in WEB_FILES
    if len(parts) == 3 and parts[:2] == ('web', 'public'):
        return parts[-1] in PUBLIC
    if parts[:2] != ('web', 'src'):
        return False
    return (path.suffix in {'.ts', '.tsx', '.css'} or name in {'web/src/assets/brand-icons/sglang.svg', 'web/src/assets/custom/wan.png'}
            or re.fullmatch(r'web/src/i18n/locales/(?:en|zh)\.json', name) is not None)


def check_bytes(name, data):
    if data.startswith((b'SQLite format 3\0', b'PK\x03\x04', b'\x1f\x8b')) or UNSAFE.search(data):
        raise ValueError(f'Refusing local endpoint, secret marker, database or nested archive in {name}')


def sources(root):
    listing = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    for name in sorted(set(listing.decode('utf-8').split('\0'))):
        if not allowed(name):
            continue
        path = root / name
        if path.resolve() != path or path.is_symlink():
            raise ValueError(f'Refusing linked build input: {name}')
        if path.is_file():
            yield name, path


def build(root, *, directory=None, bundle=None):
    if directory is not None:
        directory.mkdir(parents=True, exist_ok=True)
        if any(directory.iterdir()):
            raise ValueError('Staging directory must be empty')
    expected = {}
    for name, path in sources(root):
        data = path.read_bytes()
        check_bytes(name, data)
        if directory is not None:
            target = directory / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(data)
        if bundle is not None:
            member = tarfile.TarInfo(name)
            member.size = len(data)
            bundle.addfile(member, io.BytesIO(data))
        expected[name] = hashlib.sha256(data).digest()
    if not ROOT_FILES <= expected.keys() or not {'web/package.json', 'web/src/main.tsx', 'relaykit/go.mod', 'tokenkit/go.mod'} <= expected.keys():
        raise ValueError('Incomplete Docker build inputs')
    return expected


def verify(source):
    entries = {}
    with tarfile.open(source, 'r:gz') as archive:
        for member in archive:
            if not member.isfile() or not allowed(member.name) or member.name in entries or member.size > 32 * 1024**2:
                raise ValueError(f'Unexpected archive member: {member.name}')
            data = archive.extractfile(member).read()
            check_bytes(member.name, data)
            entries[member.name] = hashlib.sha256(data).digest()
    return entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['pack', 'stage', 'verify'])
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    if args.action == 'stage':
        checked = build(ROOT, directory=args.destination)
    elif args.action == 'verify':
        checked = verify(args.destination)
        if checked != build(ROOT):
            raise ValueError('Archive does not match the current release sources')
    else:
        checked = None
        with args.destination.open('xb') as output:
            try:
                with gzip.GzipFile(filename='', fileobj=output, mode='wb', compresslevel=4, mtime=0) as compressed, tarfile.open(fileobj=compressed, mode='w|') as archive:
                    checked = build(ROOT, bundle=archive)
                output.flush()
                if verify(args.destination) != checked:
                    raise ValueError('Archive failed its byte-for-byte manifest check')
            except BaseException:
                output.close()
                args.destination.unlink()
                raise
    fingerprint = hashlib.sha256(b''.join(name.encode() + b'\0' + value for name, value in sorted(checked.items()))).hexdigest()
    print(f'{len(checked)} reviewed build paths; manifest SHA-256 {fingerprint}')


if __name__ == '__main__':
    main()
