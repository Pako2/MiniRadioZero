# Resetting the console to its default system state (black background)
$VER = "1.0.0"
$TXT = "exit"
$PartTable = "miniradiozero.csv"

function Pause
{
[Int32]$global:Countdown = 10
Write-Host "Press any key to $TXT or wait 10 seconds..."

while ($global:Countdown -gt 0 -and -not [Console]::KeyAvailable) {
    [Console]::Write([String]::Format("{0}Seconds remain: {1} ", [Char]13, $global:Countdown))
    Start-Sleep -Seconds 1
    $global:Countdown = $global:Countdown - 1
}

if ([Console]::KeyAvailable) {
    [Console]::ReadKey($true) | Out-Null
}
}

# Helper function for outputting text
function Write-Menu {
    param([string]$text, [string]$color = "White")
    Write-Host $text -ForegroundColor $color
}

# Searching for files
$radiofile = (Get-ChildItem ".\firmware\radio*.bin" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName

# Port autodetect feature
function Get-AutodetectedPort {
    Write-Menu "Detecting COM port, please wait..." -color "Yellow"
    
    # STEP 1: Attempt detection via Espressif Vendor ID (303A) or known converters
    $detected = Get-CimInstance Win32_PnPEntity | Where-Object { 
        $_.DeviceID -match 'VID_303A' -or  # Nativ ESP32-S3 / C3 / C6
        $_.Caption -match 'Silicon|CH340|USB-SERIAL|Prolific' # older converters
    } | ForEach-Object { 
        if ($_.Caption -match '\((COM\d+)\)') { $Matches[1] } 
    } | Select-Object -First 1

    # STEP 2: If Step 1 failed (e.g., due to a missing INF driver), we retrieve any active USB COM port.
    if (-not $detected) {
        $detected = Get-CimInstance Win32_PnPEntity -Filter "ClassGuid='{4d36e978-e325-11ce-bfc1-08002be10318}'" | 
                    Where-Object { $_.Caption -match '\((COM\d+)\)' } | 
                    ForEach-Object { $Matches[1] } | 
                    Select-Object -First 1
    }

    if ($detected) {
        Write-Menu "Autodetected port: $detected" -color "Yellow"
        return $detected
    } else {
        Write-Menu ""
        Write-Host "[ERROR] Could not autodetect any connected ESP32/ESP32-S3 device!" -ForegroundColor Red
        Write-Menu "        Please make sure the device is connected via USB."
        Write-Menu ""
        Write-Menu "Press any key to return to the menu..."
        [void]$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return $null
    }
}

# Function for loading a COM port with auto-detection
function Get-ComPort {
    $comInput = Read-Host "Enter COM Port eg. `"COM1`", `"COM2`" or `"COM7`" [or press Enter for Autodetect]"
    if ([string]::IsNullOrWhiteSpace($comInput)) {
        return Get-AutodetectedPort
    }
    return $comInput.ToUpper()
}

function Get-IPaddress {
    $ipInput = Read-Host "Enter IP Address eg. `"192.168.1.100`""
    
    # We remove any spaces at the beginning and end
    $ipInput = $ipInput.Trim()

    # A regular expression to check the format of an IPv4 address
    $ipRegex = "^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"

    if ([string]::IsNullOrWhiteSpace($ipInput) -or $ipInput -notmatch $ipRegex) {
        Write-Host "`n[ERROR] Invalid IP address format!" -ForegroundColor Red
        Write-Menu "Press any key to return to the menu..." -color "Yellow"
        [void]$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return $null
    }
    
    return $ipInput
}

function Download-And-Extract-LittleFS {
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  DOWNLOAD AND EXTRACT FILESYSTEM FROM ESP32-S3"    -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan

    # 1. Parameter Configuration
    $TargetPort = $com                   # A variable detected by the script
    $BaudRate   = "460800"               # Safe speed for downloading from a flash drive
    $Address    = $script:FS_Offset      # Offset from CSV
    $Size       = $script:FS_SizeDec     # Size from CSV
    
    $OutputFile = ".\downloaded_fs.bin"
    $UnpackDir  = ".\unpacked_fs"

    # Ensuring a clean target directory
    if (Test-Path $OutputFile) { Remove-Item $OutputFile -Force }
    if (Test-Path $UnpackDir) { Remove-Item $UnpackDir -Recurse -Force }
    New-Item -ItemType Directory -Path $UnpackDir | Out-Null

    # STEP 1: Downloading the binary block from flash memory via esptool.exe
    Write-Host "[1/2] Downloading file system from $Address..." -ForegroundColor Yellow
    
    & .\utilities\esptool.exe --chip esp32s3 --port $TargetPort --baud $BaudRate read-flash $Address $Size $OutputFile

    # Download success check
    if ($LASTEXITCODE -ne 0 -or !(Test-Path $OutputFile)) {
        Write-Host "Error: Failed to download data from the chip via esptool!" -ForegroundColor Red
        $TXT = "return to the menu "
        Pause
        # return $null
    }

    # STEP 2: Extracting the binary image into individual files using mklittlefs.exe
    Write-Host "[2/2] Extracting LittleFS image to a folder '$UnpackDir'..." -ForegroundColor Yellow
    
    # Important: we pass the downloaded size ($Size) so that the tool knows where the valid data ends.
    & .\utilities\mklittlefs.exe -p 256 -b 4096 -s $Size -u $UnpackDir $OutputFile

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: LittleFS extraction failed! Check whether LittleFS is actually present on the chip." -ForegroundColor Red
        $TXT = "return to the menu "
        Pause
        # return $null
    }

    # Deleting the downloaded .bin file (keeping only the resulting folder containing the files)
    if (Test-Path $OutputFile) { Remove-Item $OutputFile -Force }

    Write-Host "Success! All files have been extracted to: $UnpackDir" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Cyan
    $TXT = "return to the menu "
    Pause    
    # return "success"
}

function ParsePartitionTable
{
Clear-Host
Write-Host "Parsing the partition table ..."  -ForegroundColor Cyan
# Getting the path to the folder where the script is running
$ScriptDir = $PSScriptRoot
$ParentDir = Split-Path -Parent $ScriptDir
$FirmwareDir = Join-Path $ParentDir "firmware"
$PartitionFile = Join-Path $FirmwareDir $PartTable

if (Test-Path $PartitionFile) {
    # Loading content and removing comments/empty lines
    $Lines = Get-Content $PartitionFile | Where-Object { $_ -and -not $_.StartsWith("#") }
    
    # Locating the line for littlefs or spiffs
    $TargetLine = $Lines | Where-Object { $_ -match 'littlefs' -or $_ -match 'spiffs' }

    if ($TargetLine) {
        # Splitting a line by commas and removing spaces
        $Fields = $TargetLine.Split(',') | ForEach-Object { $_.Trim() }
        
        # We assume a standard CSV format: Name, Type, SubType, Offset, Size
        $script:FS_Offset = $Fields[3] # E.g. "0x310000"
        $script:FS_SizeHex = $Fields[4] # E.g. "0x0E0000"
        
        # Conversion of a hexadecimal size to a decimal number for mklittlefs
        $script:FS_SizeDec = [Convert]::ToInt32($script:FS_SizeHex, 16)
        
        Write-Host "Configuration for littlefs found in $PartTable :" -ForegroundColor Green
        Write-Host "  Offset: $script:FS_Offset"
        Write-Host "  Size:   $script:FS_SizeHex ($script:FS_SizeDec bytes)"
    } else {
        Write-Host "[WARNING] Neither the 'littlefs' nor the 'spiffs' region was found in $PartTable" -ForegroundColor Yellow
        $TXT = "exit"
        Pause
        Exit
    }
    # Locating the row for app0
    $TargetLine = $Lines | Where-Object { $_ -match 'app0'}

    if ($TargetLine) {
        # Splitting a line by commas and removing spaces
        $Fields = $TargetLine.Split(',') | ForEach-Object { $_.Trim() }
        
        # We assume a standard CSV format: Name, Type, SubType, Offset, Size
        $script:APP0_Offset = $Fields[3] # E.g. "0x10000"
        $script:APP0_SizeHex = $Fields[4] # E.g. "0x300000"
        
        # Conversion of a hexadecimal size to a decimal number
        $script:APP0_SizeDec = [Convert]::ToInt32($script:APP0_SizeHex, 16)
        
        Write-Host "Configuration for app0 found in $PartTable :" -ForegroundColor Green
        Write-Host "  Offset: $script:APP0_Offset"
        Write-Host "  Size:   $script:APP0_SizeHex ($script:APP0_SizeDec bytes)"
    } else {
        Write-Host "[WARNING] The 'app0' region was not found in $PartTable" -ForegroundColor Yellow
        $TXT = "exit"
        Pause
        Exit
    }
} else {
    Write-Host "[WARNING] The file $PartTable was not found." -ForegroundColor Yellow
    $TXT = "exit"
    Pause
    Exit
    # Here, you can set hardcoded fallback values for cases where the file is missing.
    # $script:FS_Offset = "0x310000"
    # $script:FS_SizeDec = 917504
    # $script:APP0_Offset = "0x10000"
    # $script:APP0_SizeDec = 3145728
}
}

ParsePartitionTable

do {
Clear-Host
$valid = $true


Write-Menu "MiniRadioZero-$VER flash utility" -color "Yellow"
Write-Menu "==================================================" -color "Yellow"
Write-Menu "- [0] Perform Chip Erase on SPI flash"
Write-Menu "- [1] Flash Complete Firmware via USB"
Write-Menu "- [2] Flash Firmware Update via USB"
Write-Menu "- [3] Build Filesystem Image"
Write-Menu "- [4] Flash Filesystem Image via USB"
Write-Menu "- [5] Build and Flash Filesystem Image via USB"
Write-Menu "- [6] Flash Filesystem Image via OTA"
Write-Menu "- [7] Build and Flash Filesystem Image via OTA"
Write-Menu "- [8] Download and extract Filesystem via USB"
Write-Menu "- [Q] Quit / Exit"
Write-Menu "==================================================" -color "Yellow"
Write-Menu ""

# Reading user input
$opt = Read-Host "Please choose an option (eg. 2) and press Enter"


# Handling termination via Q
if ($opt.ToUpper() -eq "Q") {
    Write-Menu "`nExiting utility..."
    Start-Sleep -Seconds 1
    Exit
}

# Handling a choice using the Switch construct
switch ($opt) {
    "0" {
        Write-Menu "----------------------------------------------`n`nChip Erase" -color "Yellow"
        $com = Get-ComPort
        if ($com) {
        & .\utilities\esptool.exe --chip esp32s3 --port "$com" --baud 460800 --before default-reset --after hard-reset erase-flash
                } else {
          $valid = $false
        }
    }
    "1" {
        Write-Menu "--------------------------------------------------`n`nFlash Firmware via USB" -color "Yellow"
        $com = Get-ComPort
        if ($com) {
         & .\utilities\esptool.exe --chip esp32s3 --port "$com" --baud 460800 --before default-reset --after hard-reset write-flash -z --flash-mode dio --flash-freq 80m --flash-size 4MB 0x0000 .\firmware\bootloader.bin 0x8000 .\firmware\partitions.bin 0xe000 .\firmware\boot_app0.bin $script:APP0_Offset "$radiofile"
                } else {
          $valid = $false
        }
    }
    "2" {
        Write-Menu "--------------------------------------------------`n`nFlash Firmware via USB" -color "Yellow"
        $com = Get-ComPort
        if ($com) {
        & .\utilities\esptool.exe --chip esp32s3 --port "$com" --baud 460800 --before default-reset --after hard-reset write-flash -z --flash-mode dio --flash-freq 80m --flash-size 4MB $script:APP0_Offset "$radiofile"
                } else {
          $valid = $false
        }
    }
    "3" {
        Write-Menu "--------------------------------------------------`n`nBuild Filesystem Image" -color "Yellow"
        & .\utilities\mklittlefs -c .\filesystem -b 4096 -p 256 -s $script:FS_SizeDec .\firmware\littlefs.bin
    }
    "4" {
        Write-Menu "--------------------------------------------------`n`nFlash Filesystem Image via USB" -color "Yellow"
        $com = Get-ComPort
        if ($com) {
        & .\utilities\esptool.exe --chip esp32s3 --port "$com" --baud 460800 --before default-reset --after hard-reset write-flash -z --flash-mode dio --flash-freq 80m --flash-size 4MB  $script:FS_Offset .\firmware\littlefs.bin
                } else {
          $valid = $false
        }
    }
    "5" {
        Write-Menu "--------------------------------------------------`n`nBuild and Flash Filesystem Image via USB" -color "Yellow"
        $com = Get-ComPort
        if ($com) {
        & .\utilities\mklittlefs -c .\filesystem -b 4096 -p 256 -s $script:FS_SizeDec .\firmware\littlefs.bin
        & .\utilities\esptool.exe --chip esp32s3 --port "$com" --baud 460800 --before default-reset --after hard-reset write-flash -z --flash-mode dio --flash-freq 80m --flash-size 4MB  $script:FS_Offset .\firmware\littlefs.bin
                } else {
          $valid = $false
        }
    }
    "6" {
        Write-Menu "--------------------------------------------------`n`nFlash Filesystem Image via OTA" -color "Yellow"
        $ip = Get-IPaddress
        if ($ip) {
        & .\utilities\espota.exe -i "$ip" -p 3232 -s -f .\firmware\littlefs.bin
                } else {
          $valid = $false
        }
    }
    "7" {
        Write-Menu "--------------------------------------------------`n`nBuild and Flash Filesystem Image via OTA" -color "Yellow"
        $ip = Get-IPaddress
        if ($ip) {
        & .\utilities\mklittlefs -c .\filesystem -b 4096 -p 256 -s $script:FS_SizeDec .\firmware\littlefs.bin
        & .\utilities\espota.exe -i "$ip" -p 3232 -s -f .\firmware\littlefs.bin
        } else {
            $valid = $false
        }        
    }
    "8" {
        Write-Menu "--------------------------------------------------`n`nDownload and extract Filesystem via USB" -color "Yellow"
        $com = Get-ComPort
        if ($com)
        {
          Download-And-Extract-LittleFS
        }
        $valid = $false
    }
    Default {
        Write-Host "Unknown option `"$opt`"" -ForegroundColor Red
        Write-Menu "Press any key to return to the menu..."
        [void]$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return
    }
}

if ($valid -ne $false) {
# A shared conclusion for successful cases
Write-Menu "`nDone !"
$TXT = "return to the menu "
Pause
}
} while ($true)