; Inno Setup Script for TransFiler
; 适用于 Inno Setup 6+ 编译标准企业级安装包

#define MyAppName "TransFiler"
#define MyAppVersion "1.2.6"
#define MyAppPublisher "TransFiler Team"
#define MyAppExeName "TransFiler.exe"

[Setup]
AppId={{D828F79B-67E2-4C91-9F05-E93C5BF79F12}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist_installer
OutputBaseFilename=TransFiler_v{#MyAppVersion}_InnoSetup
SetupIconFile=..\app_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
PrivilegesRequired=lowest

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\TransFiler.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\app_icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\更新日志.md"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
