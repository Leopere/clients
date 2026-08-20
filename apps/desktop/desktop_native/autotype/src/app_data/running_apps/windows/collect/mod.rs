//! Collection: build the **raw** list of running apps — inclusive, with no exclusion policy.
//!
//! Two sources are merged into one entry per app:
//! - [`window_source`] — **Source A: top-level windows** (`EnumWindows`).
//! - [`packaged_source`] — **Source B: running packaged apps** (`AppDiagnosticInfo`).
//!
//! [`collect`] runs Source A then folds Source B in (merging by PID). Both sources resolve an
//! app's identity (dedupe key + display name) against the AppsFolder registry — see
//! [`window_source::identity`] for the shared `aumid:{key}` keying contract. The only reader
//! shared by both sources, [`process_image_path`], lives here; source-specific readers live in
//! their respective source module. Collection itself makes no keep/drop decisions — the output
//! [`RunningApp`]s carry everything the [`super::filter`] pipeline needs.

use std::collections::HashMap;
use std::path::PathBuf;

use windows::Win32::Foundation::{CloseHandle, MAX_PATH};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::core::PWSTR;

use super::{AppRegistry, PKEY_APP_USER_MODEL_ID, RunningApp};

mod packaged_source;
mod window_source;

/// Build the raw list of running apps (Source A ∪ Source B), deduped and identity-resolved.
pub(super) fn collect(registry: &AppRegistry) -> Vec<RunningApp> {
    let mut by_key: HashMap<String, RunningApp> = HashMap::new();
    // Source A — top-level windows.
    window_source::collect_windows(&window_source::Win32WindowSource, registry, &mut by_key);
    // Source B — running packaged apps.
    packaged_source::merge_packaged_apps(&packaged_source::Win32PackagedSource, registry, &mut by_key);
    by_key.into_values().collect()
}

/// Resolve a process's full image path (best-effort; fails for protected processes). Shared:
/// both sources map a PID to its executable path.
fn process_image_path(pid: u32) -> Option<PathBuf> {
    // SAFETY: the handle from OpenProcess is closed exactly once below.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;

    let mut buf = [0u16; MAX_PATH as usize];
    // In/out char count: on input, the capacity of `buf` (MAX_PATH fits a u32).
    let mut size = buf.len() as u32;
    // SAFETY: `buf`/`size` outlive the call; the query only writes into `buf`.
    let result = unsafe {
        QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut size)
    };
    // SAFETY: `handle` is a live handle from OpenProcess, not used after this.
    let _ = unsafe { CloseHandle(handle) };

    result.ok()?;
    Some(PathBuf::from(String::from_utf16_lossy(&buf[..size as usize])))
}
