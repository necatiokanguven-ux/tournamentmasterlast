; Tournament Master — Inno Setup script (Phase 11b)
; Build: packaging\installer\build-installer.ps1

#define AppName "Tournament Master"
#define AppVersion "1.0.8"
#define AppPublisher "PokerClup"
#define AppURL "https://pokerclup.com"
#define AppExeName "TourMasterLauncher.bat"
#define DefaultInstallDir "C:\Tournament Master"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={#DefaultInstallDir}
UsePreviousAppDir=no
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\..\release\installer
OutputBaseFilename=TourMasterSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
WizardImageFile=assets\setup-image.bmp
WizardSmallImageFile=assets\wizard-small.bmp
SetupIconFile=assets\logoexe.ico
UninstallDisplayIcon={app}\assets\logoexe.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: checkedonce

[Files]
Source: "..\..\release\TourMasterSetup-staging\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\public\logo.png"; DestDir: "{app}\dist"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\logoexe.ico"
Name: "{group}\Start Server (Console)"; Filename: "{app}\start.bat"; WorkingDir: "{app}"
Name: "{group}\Stop Server"; Filename: "{app}\stop.bat"; WorkingDir: "{app}"
Name: "{group}\Restart Server"; Filename: "{app}\restart-server.bat"; WorkingDir: "{app}"
Name: "{group}\Backup Data"; Filename: "{app}\backup.bat"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; WorkingDir: "{app}"; IconFilename: "{app}\assets\logoexe.ico"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
procedure InitializeWizard;
begin
  WizardForm.DirEdit.Text := ExpandConstant('{#DefaultInstallDir}');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  MarkerPath: String;
begin
  if CurStep = ssPostInstall then
  begin
    MarkerPath := ExpandConstant('{app}\.installed');
    SaveStringToFile(MarkerPath, 'installed', False);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataRoot: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    DataRoot := ExpandConstant('{app}\data');
    if DirExists(DataRoot) then
    begin
      Log('Preserving tournament data at: ' + DataRoot);
    end;
  end;
end;
