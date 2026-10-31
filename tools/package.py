"""Create a source archive from an explicit allowlist; never include user databases."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / 'dsh-friends-source-0.8.2.zip'
files = [root / name for name in ['package.json', 'README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'PUBLIC-INSTANCE.md', 'Dockerfile', 'compose.yaml', '.gitignore', '.dockerignore']]
for folder in ['server', 'plugin', 'test', 'tools', '.github', 'docs']:
    for path in (root / folder).rglob('*'):
        if path.is_file() and not any(part in {'node_modules', '__pycache__', '.git'} for part in path.relative_to(root).parts) and path.suffix not in {'.tgz', '.zip', '.sqlite', '.pyc'}:
            files.append(path)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, Path('dsh-friends') / path.relative_to(root))
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any('/data/' in name or name.endswith(('.sqlite', '.tgz')) for name in archive.namelist())
print(f'Created {output.name}: {len(files)} source files; no identity database or credentials')

# Validate the separate npm artifact against current source without extracting paths.
import tarfile
artifact = root / 'dsh-friends-plugin-0.8.2.tgz'
if artifact.is_file():
    with tarfile.open(artifact, 'r:gz') as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            assert member.name.startswith('package/') and '..' not in Path(member.name).parts
            original = root / 'plugin' / member.name.removeprefix('package/')
            assert archive.extractfile(member).read() == original.read_bytes(), f'Stale npm artifact: {member.name}'
    print('Verified npm tarball: all shipped files match current plugin sources')
