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

results = []
WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

def cb(hwnd, lparam):
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if pid.value in pid_list:
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        w = rect.right - rect.left
        h = rect.bottom - rect.top
        visible = user32.IsWindowVisible(hwnd)
        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        if w > 0 and h > 0:
            results.append((pid.value, bool(visible), rect.left, rect.top, rect.right, rect.bottom, w, h, buf.value))
    return True

user32.EnumWindows(WNDENUMPROC(cb), 0)

screen = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
print("screen(px): %dx%d" % screen)
for r in results:
    print("PID=%d VIS=%s RECT=(%d,%d)-(%d,%d) SIZE=%dx%d TITLE='%s'" % r)
