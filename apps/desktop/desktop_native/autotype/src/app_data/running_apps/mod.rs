//! Enumerate the running user-facing applications a person could pair for Autotype.
//!
//! [`get_running_apps`] returns the kept apps as the simplified public
//! [`crate::app_data::AppData`] (display name + path). OS-specific collection and filtering —
//! including the richer internal working type — live in the private `windows` backend; only
//! Windows is implemented.

use anyhow::Result;

use crate::app_data::AppData;

#[cfg(windows)]
mod windows;

/// Lists the running user-facing applications as [`AppData`] (display name + path).
///
/// # Errors
///
/// Currently infallible: the Windows backend degrades to an empty list on any OS-query failure
/// and always returns `Ok`. The fallible signature is kept for forward compatibility.
#[cfg(windows)]
pub fn get_running_apps() -> Result<Vec<AppData>> {
    Ok(windows::get_running_apps())
}

/// Lists the running user-facing applications as [`AppData`] (display name + path).
///
/// # Panics
///
/// Always panics — Autotype is not supported on non-Windows platforms.
#[cfg(not(windows))]
pub fn get_running_apps() -> Result<Vec<AppData>> {
    unimplemented!("Autotype is not supported on non-Windows platforms")
}
