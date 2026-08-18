//! Source A: running apps discovered from **top-level windows** (`EnumWindows`).
//!
//! A window qualifies as an app window if it is titled, unowned, not a tool window, and has a
//! real title bar (`WS_CAPTION` + `WS_SYSMENU`). Both visible and hidden/cloaked windows are
//! kept (tray apps hide their window); cloaking never gates inclusion — it only marks whether a
//! window is currently visible, which is used to pick the representative process. Packaged apps
//! hosted by `ApplicationFrameHost` are followed to their real child process.

use std::collections::{HashMap, HashSet};
use std::ffi::c_void;
use std::path::{Path, PathBuf};

use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute};
use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PropVariantToStringAlloc};
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, EnumWindows, GW_OWNER, GWL_EXSTYLE, GWL_STYLE, GetWindow, GetWindowLongW,
    GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible, WS_CAPTION, WS_EX_TOOLWINDOW,
    WS_SYSMENU,
};
use windows::core::{BOOL, PCWSTR};

use super::{AppRegistry, PKEY_APP_USER_MODEL_ID, RunningApp, process_image_path};

/// A qualifying top-level window found during enumeration.
struct WindowHit {
    hwnd: HWND,
    /// Visible AND not cloaked — i.e. currently shown on screen.
    visible: bool,
}

pub(super) fn collect_windows(registry: &AppRegistry, by_key: &mut HashMap<String, RunningApp>) {
    let mut hits: Vec<WindowHit> = Vec::new();
    // SAFETY: `hits` outlives the enumeration; the callback only pushes into it.
    unsafe {
        let _ = EnumWindows(Some(enum_windows_proc), LPARAM(&mut hits as *mut Vec<WindowHit> as isize));
    }

    // Keys whose representative pid already comes from a visible window. Collection-local: it
    // only guides which pid we keep, and is not needed once collection is done.
    let mut has_visible_representative: HashSet<String> = HashSet::new();

    for hit in &hits {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hit.hwnd, Some(&mut pid)) };
        if pid == 0 {
            continue;
        }

        let mut exe_path = process_image_path(pid);
        let mut name = exe_path.as_deref().and_then(file_name_of).unwrap_or_default();

        // Packaged/UWP apps: the frame window belongs to ApplicationFrameHost; the real
        // app is a child window in a different process (e.g. ms-teams.exe, Netflix).
        if name.eq_ignore_ascii_case("applicationframehost.exe") {
            if let Some(child) = child_pid(hit.hwnd, pid) {
                pid = child;
                exe_path = process_image_path(pid);
                name = exe_path.as_deref().and_then(file_name_of).unwrap_or_default();
            }
        }

        let aumid = window_aumid(hit.hwnd);
        let (display_name, key, registered) = identity(aumid.as_deref(), &exe_path, &name, registry);

        let entry = by_key.entry(key.clone()).or_insert_with(|| RunningApp {
            pid,
            name: name.clone(),
            exe_path: exe_path.clone(),
            display_name: display_name.clone(),
            has_window: true,
            registered,
        });

        // Prefer a pid that owns a visible window as the representative. `insert` returns true
        // only for the first visible window seen for this key, so we upgrade at most once.
        if hit.visible && has_visible_representative.insert(key) {
            entry.pid = pid;
            entry.exe_path = exe_path.clone();
        }
    }
}

/// Compute `(display_name, dedupe_key, registered)` for a window.
///
/// If the window's AUMID **resolves** in the AppsFolder registry, use that registration: a
/// stable key (the AUMID) so distinct apps — including distinct PWAs like Netflix — stay
/// separate, plus the registry's real display name. No browser special-casing: a regular
/// browser window resolves to the browser's own registration, a PWA window to its own.
/// Otherwise fall back to the exe's version-info product name (then exe path, then file name),
/// and mark it unregistered.
///
/// The `aumid:{key}` key format is a shared contract: [`super::packaged_source`] builds the
/// same key so a windowless packaged app dedupes against its window-derived entry.
fn identity(
    aumid: Option<&str>,
    exe_path: &Option<PathBuf>,
    name: &str,
    registry: &AppRegistry,
) -> (Option<String>, String, bool) {
    if let Some(aumid) = aumid {
        let key = aumid.to_ascii_lowercase();
        if let Some(reg) = registry.get(&key) {
            return (Some(reg.display_name.clone()), format!("aumid:{key}"), true);
        }
    }
    let product = exe_path.as_deref().and_then(read_product_name);
    let key = product
        .clone()
        .or_else(|| exe_path.as_ref().map(|p| p.display().to_string()))
        .unwrap_or_else(|| name.to_string());
    (product, key, false)
}

/// `EnumWindows`/`EnumChildWindows` callback: return TRUE (nonzero) to continue enumeration,
/// FALSE (zero) to stop. <https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows>
unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let hits = &mut *(lparam.0 as *mut Vec<WindowHit>);
    // Non-app windows (untitled, owned, tool-window, no-titlebar) are the bulk of top-level
    // windows and are pure structural noise; they are simply not app-window candidates.
    if let WindowVerdict::Accept { visible } = classify_window(hwnd) {
        hits.push(WindowHit { hwnd, visible });
    }
    BOOL(1) // keep enumerating
}

enum WindowVerdict {
    Accept { visible: bool },
    Reject,
}

/// Classify a top-level window. A "real app window" has a title, is unowned, is not a tool
/// window, and carries a real title bar (`WS_CAPTION` + `WS_SYSMENU`). Visibility (and DWM
/// cloaking) does NOT gate acceptance — it only sets the returned `visible` flag, so hidden
/// (Electron tray apps) and cloaked (minimized Store/UWP apps) windows are still kept.
///
/// The title-bar requirement separates genuine app windows from the many titled *helper*
/// windows a process spawns (DDE servers, broadcast/GDI hook windows, Firefox's
/// `Battery Watcher`/`WinEventWindow`, OneDrive's tray helpers): those set `WS_CAPTION` at
/// most but not `WS_SYSMENU`. Every real main window (incl. hidden Electron tray windows and
/// OneDrive's non-resizable window) has both.
fn classify_window(hwnd: HWND) -> WindowVerdict {
    // SAFETY (each call below): these APIs only query the given window handle; a stale/invalid
    // handle yields zero/error rather than UB.
    if unsafe { GetWindowTextLengthW(hwnd) } == 0 {
        return WindowVerdict::Reject; // untitled
    }
    // An owned window is a dialog/child-of-app, not the app's main window.
    if let Ok(owner) = unsafe { GetWindow(hwnd, GW_OWNER) } {
        if !owner.0.is_null() {
            return WindowVerdict::Reject;
        }
    }
    let ex_style = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
    if ex_style & WS_EX_TOOLWINDOW.0 != 0 {
        return WindowVerdict::Reject; // tool window
    }
    // Require a real title bar with window controls (not just a caption).
    let style = unsafe { GetWindowLongW(hwnd, GWL_STYLE) } as u32;
    if style & WS_CAPTION.0 == 0 || style & WS_SYSMENU.0 == 0 {
        return WindowVerdict::Reject; // no title bar
    }
    let visible = unsafe { IsWindowVisible(hwnd) }.as_bool() && !is_cloaked(hwnd);
    WindowVerdict::Accept { visible }
}

/// Context for the `EnumChildWindows` pass that resolves a packaged app's real PID.
struct FrameCtx {
    frame_pid: u32,
    found: u32,
}

/// For an `ApplicationFrameHost` frame window, find the PID of the hosted app (the first
/// child window owned by a different process).
fn child_pid(parent: HWND, frame_pid: u32) -> Option<u32> {
    let mut ctx = FrameCtx { frame_pid, found: 0 };
    // SAFETY: `ctx` outlives the enumeration; `child_proc` only writes into it via the lparam.
    let _ = unsafe {
        EnumChildWindows(Some(parent), Some(child_proc), LPARAM(&mut ctx as *mut FrameCtx as isize))
    };
    (ctx.found != 0).then_some(ctx.found)
}

/// `EnumChildWindows` callback; same TRUE=continue / FALSE=stop contract as [`enum_windows_proc`].
unsafe extern "system" fn child_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &mut *(lparam.0 as *mut FrameCtx);
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid != 0 && pid != ctx.frame_pid {
        ctx.found = pid;
        return BOOL(0); // found it — stop enumerating
    }
    BOOL(1)
}

// ---------------------------------------------------------------------------
// Source-A-only Win32/shell readers
// ---------------------------------------------------------------------------

/// Read a window's explicit AppUserModelID from its property store, if any. Resolved against
/// the AppsFolder registry (see [`identity`]) to identify the app behind the window.
fn window_aumid(hwnd: HWND) -> Option<String> {
    // SAFETY: all calls operate on the window's own property store; the PWSTR from
    // PropVariantToStringAlloc is freed with CoTaskMemFree, and the PROPVARIANT is always cleared.
    unsafe {
        let store: IPropertyStore = SHGetPropertyStoreForWindow(hwnd).ok()?;
        let mut prop = store.GetValue(&PKEY_APP_USER_MODEL_ID).ok()?;
        let value = match PropVariantToStringAlloc(&prop) {
            Ok(pw) => {
                let s = pw.to_string().ok();
                CoTaskMemFree(Some(pw.0 as *const c_void));
                s
            }
            Err(_) => None,
        };
        let _ = PropVariantClear(&mut prop);
        value.filter(|s| !s.is_empty())
    }
}

/// A cloaked window is composed but not currently shown (minimized, or a suspended packaged
/// app). Counted as not currently visible, so a cloaked-only window isn't chosen as the
/// representative visible window.
fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    // SAFETY: the out-buffer is `cloaked`, whose size is passed explicitly.
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            (&mut cloaked as *mut u32).cast::<c_void>(),
            std::mem::size_of_val(&cloaked) as u32,
        )
    };
    ok.is_ok() && cloaked != 0
}

fn file_name_of(path: &Path) -> Option<String> {
    path.file_name().map(|s| s.to_string_lossy().into_owned())
}

/// Read a friendly product/description name from the exe's version resource.
fn read_product_name(path: &Path) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();

    // SAFETY: `wide` is a NUL-terminated UTF-16 path that outlives the call.
    let size = unsafe { GetFileVersionInfoSizeW(PCWSTR(wide.as_ptr()), None) };
    if size == 0 {
        return None;
    }
    let mut block = vec![0u8; size as usize];
    // SAFETY: `wide` outlives the call; `block` has `size` bytes for the resource to fill.
    unsafe {
        GetFileVersionInfoW(PCWSTR(wide.as_ptr()), Some(0), size, block.as_mut_ptr().cast::<c_void>())
    }
    .ok()?;

    let (lang, codepage) = query_translation(&block)?;

    // Field names are the documented predefined version-info String keys:
    // <https://learn.microsoft.com/en-us/windows/win32/menurc/string-str>
    // Prefer FileDescription, fall back to ProductName.
    for field in ["FileDescription", "ProductName"] {
        // `\StringFileInfo\{lang}{codepage}\{name}` is the documented VerQueryValue sub-block
        // format: <https://learn.microsoft.com/en-us/windows/win32/api/winver/nf-winver-verqueryvaluew>
        let sub = format!("\\StringFileInfo\\{lang:04x}{codepage:04x}\\{field}");
        if let Some(value) = query_string(&block, &sub) {
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn query_translation(block: &[u8]) -> Option<(u16, u16)> {
    // `\VarFileInfo\Translation` is the documented VerQueryValue sub-block holding the
    // language/codepage pairs: <https://learn.microsoft.com/en-us/windows/win32/api/winver/nf-winver-verqueryvaluew>
    let sub: Vec<u16> =
        "\\VarFileInfo\\Translation".encode_utf16().chain(std::iter::once(0)).collect();
    let mut ptr: *mut c_void = std::ptr::null_mut();
    let mut len: u32 = 0;
    // SAFETY: `block`/`sub` outlive the call; on success VerQueryValueW points `ptr`/`len` into
    // `block`. Each entry is a {WORD language, WORD codepage} pair, so we require at least one
    // full pair before reading the first two u16s.
    unsafe {
        let ok =
            VerQueryValueW(block.as_ptr().cast::<c_void>(), PCWSTR(sub.as_ptr()), &mut ptr, &mut len);
        if !ok.as_bool() || ptr.is_null() || (len as usize) < std::mem::size_of::<[u16; 2]>() {
            return None;
        }
        // Take the first {language, codepage} pair.
        let lang = *(ptr.cast::<u16>());
        let codepage = *(ptr.cast::<u16>().add(1));
        Some((lang, codepage))
    }
}

fn query_string(block: &[u8], sub_block: &str) -> Option<String> {
    let sub: Vec<u16> = sub_block.encode_utf16().chain(std::iter::once(0)).collect();
    let mut ptr: *mut c_void = std::ptr::null_mut();
    let mut len: u32 = 0;
    // SAFETY: `block`/`sub` outlive the call; on success VerQueryValueW points `ptr`/`len` into
    // `block`, so the slice read below stays within it. `len` is in characters incl. the NUL.
    unsafe {
        let ok =
            VerQueryValueW(block.as_ptr().cast::<c_void>(), PCWSTR(sub.as_ptr()), &mut ptr, &mut len);
        if !ok.as_bool() || ptr.is_null() || len == 0 {
            return None;
        }
        let chars = std::slice::from_raw_parts(ptr.cast::<u16>(), len as usize);
        let s = String::from_utf16_lossy(chars);
        Some(s.trim_end_matches('\0').to_string())
    }
}
