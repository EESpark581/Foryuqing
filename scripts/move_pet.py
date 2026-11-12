import ctypes
from ctypes import wintypes

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    pass

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
import ctypes.wintypes as wt

pid_list = set()

class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [("dwSize", wt.DWORD), ("cntUsage", wt.DWORD), ("th32ProcessID", wt.DWORD),
                ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)), ("th32ModuleID", wt.DWORD),
                ("cntThreads", wt.DWORD), ("th32ParentProcessID", wt.DWORD), ("pcPriClassBase", ctypes.c_long),
                ("dwFlags", wt.DWORD), ("szExeFile", ctypes.c_char * 260)]

snap = kernel32.CreateToolhelp32Snapshot(0x2, 0)
entry = PROCESSENTRY32(); entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
if kernel32.Process32First(snap, ctypes.byref(entry)):
    while True:
        if "electron" in entry.szExeFile.decode(errors="ignore").lower():
            pid_list.add(entry.th32ProcessID)
        if not kernel32.Process32Next(snap, ctypes.byref(entry)):
            break
kernel32.CloseHandle(snap)

targets = []
WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

def cb(hwnd, lparam):
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if pid.value in pid_list and user32.IsWindowVisible(hwnd):
        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        if buf.value == "星露灵猫":
            rect = wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            targets.append((hwnd, rect.right - rect.left, rect.bottom - rect.top))
    return True

user32.EnumWindows(WNDENUMPROC(cb), 0)

SWP_NOSIZE = 0x0001
SWP_NOZORDER = 0x0004
SWP_NOACTIVATE = 0x0010

sw, sh = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
for hwnd, w, h in targets:
    x = sw - w - 64
    y = sh - h - 96
    ok = user32.SetWindowPos(hwnd, 0, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
    print("moved hwnd=%s -> (%d,%d) size=%dx%d ok=%s" % (hwnd, x, y, w, h, bool(ok)))
    print("BBOX=%d,%d,%d,%d" % (x, y, x + w, y + h))
