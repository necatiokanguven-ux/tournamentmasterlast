; Tournament Master — Inno Setup script (Phase 11b)
; Build: packaging\installer\build-installer.ps1

#ifndef AppVersion
#define AppVersion "1.0.11"
#endif

#define AppName "Tournament Master"
#define AppPublisher "PokerClup"
#define AppURL "https://pokerclup.com"
#define AppExeName "TourMasterLauncher.bat"
#define DefaultInstallDir "C:\Tournament Master"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={#DefaultInstallDir}
UsePreviousAppDir=yes
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\..\release\installer
OutputBaseFilename=TourMasterSetup_{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
WizardImageFile=assets\setup-image.bmp
WizardSmallImageFile=assets\wizard-small.bmp
SetupIconFile=assets\logoexe.ico
UninstallDisplayIcon={app}\assets\logoexe.ico
AppMutex=TournamentMasterAppMutex
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: checkedonce

[Dirs]
Name: "{app}\Updates"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\data"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\data\config"; Permissions: users-modify; Flags: uninsneveruninstall

[Files]
Source: "..\..\release\TourMasterSetup-staging\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "data\*,Updates\*,Updates\*"
Source: "..\..\public\logo.png"; DestDir: "{app}\dist"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\logoexe.ico"
Name: "{group}\Start Server (Console)"; Filename: "{app}\start.bat"; WorkingDir: "{app}"
Name: "{group}\Stop Server"; Filename: "{app}\stop.bat"; WorkingDir: "{app}"
Name: "{group}\Restart Server"; Filename: "{app}\restart-server.bat"; WorkingDir: "{app}"
Name: "{group}\Backup Data"; Filename: "{app}\backup.bat"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; WorkingDir: "{app}"; IconFilename: "{app}\assets\logoexe.ico"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall runasoriginaluser

[Code]
procedure InitializeWizard;
begin
  WizardForm.DirEdit.Text := ExpandConstant('{#DefaultInstallDir}');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  MarkerPath: String;
  DataRoot: String;
  LicensePath: String;
begin
  if CurStep = ssInstall then
  begin
    DataRoot := ExpandConstant('{app}\data');
    LicensePath := DataRoot + '\config\license.json';
    if FileExists(LicensePath) then
    begin
      Log('Preserving existing license at: ' + LicensePath);
    end;
    if DirExists(DataRoot) then
    begin
      Log('Preserving tournament data at: ' + DataRoot);
    end;
  end;

  if CurStep = ssPostInstall then
  begin
    MarkerPath := ExpandConstant('{app}\.installed');
    SaveStringToFile(MarkerPath, 'installed', False);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataRoot: String;
  UpdatesRoot: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    DataRoot := ExpandConstant('{app}\data');
    UpdatesRoot := ExpandConstant('{app}\Updates');
    if DirExists(DataRoot) then
    begin
      Log('Preserving tournament data at: ' + DataRoot);
    end;
    if DirExists(UpdatesRoot) then
    begin
      Log('Preserving update artifacts at: ' + UpdatesRoot);
    end;
  end;
end;
