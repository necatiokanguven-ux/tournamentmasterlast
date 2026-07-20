# TourMasterSetup.exe build guide (Phase 11b)

## Prerequisites

1. **Inno Setup 6** — https://jrsoftware.org/isdl.php  
   Typical path: `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`
2. Production build passes: `npm run build`
3. Optional embedded runtimes in `packaging/runtime/` (see `runtime/README.txt`)

## Quick build

```powershell
# Staging + portable zip (no Inno Setup required)
npm run build:installer

# Staging + zip + winget Inno Setup + TourMasterSetup.exe
npm run build:installer:full

# Install Inno Setup only
npm run install:inno
```

Output:

- Staging: `release/TourMasterSetup-staging/`
- Portable zip: `release/installer/TourMasterSetup-portable.zip` (always)
- Installer exe: `release/installer/TourMasterSetup.exe` (when Inno Setup / ISCC found)

## Manual ISCC

```powershell
npm run build
powershell -File packaging/installer/build-installer.ps1 -SkipBuild
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\installer\TournamentMaster.iss
```

## Test staging without installer

```powershell
cd release\TourMasterSetup-staging
echo installed> .installed
start.bat
```

Installed layout uses `C:\Tournament Master\` with tournament data in `C:\Tournament Master\data\`.

## Runtime binaries (not in git)

| File | Source |
|------|--------|
| `runtime/node.exe` | `npm run stage:runtime` or nodejs.org dist |
| `runtime/postgres/` | Portable PostgreSQL 15+ Windows zip |
| `runtime/redis/redis-server.exe` | Portable Redis Windows build |

Verify layout: `npm run verify:runtime`
