import shutil
import os
Import("env")

version="UNKNOWN"
for item in env["BUILD_FLAGS"]:
    ix = item.find("VERSION=")
    if ix > 0:
        version = item[ix+8:]
        break
firmware_source = os.path.join(env.subst("$BUILD_DIR"), "firmware.bin")
partitions_source = os.path.join(env.subst("$BUILD_DIR"), "partitions.bin")
bootloader_source = os.path.join(env.subst("$BUILD_DIR"), "bootloader.bin")
fs_source = os.path.join(env.subst("$BUILD_DIR"), "littlefs.bin")
current_env = env.subst("$PIOENV")
prefixes = {"miniradiozero":"radio"}
target_dir = os.path.join('tool', 'firmware')
if not os.path.exists(target_dir):
    os.makedirs(target_dir)
filename = os.path.join(target_dir, '%s_v%s.bin' % (prefixes[current_env], version))
partname = os.path.join(target_dir, 'partitions.bin')
bootname = os.path.join(target_dir, 'bootloader.bin')
fsname = os.path.join(target_dir, 'littlefs.bin')


def after_build(source, target, env):
    shutil.copy(firmware_source, filename)
    shutil.copy(partitions_source, partname)
    shutil.copy(bootloader_source, bootname)
    print(f"\n>>>>>>>>>>>>>>>> [DEPLOY] Binary successfully copied to: {filename} <<<<<<<<<<<<<<<<\n")

def after_build_filesystem(source, target, env):
    shutil.copy(fs_source, fsname)
    print(f"\n>>>>>>>>>> [DEPLOY] Filesystem binary successfully copied to: {fsname} <<<<<<<<<<\n")

env.AddPostAction(firmware_source, after_build)

# custom action after building SPIFFS image
env.AddPostAction("$BUILD_DIR/littlefs.bin", after_build_filesystem)