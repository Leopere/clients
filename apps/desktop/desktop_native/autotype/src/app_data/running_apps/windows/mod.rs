//! Windows backend (window-first), organized as **collection → filtering**:
//!
//! - [`collect`] produces the *raw* list of running apps (from top-level windows and from
//!   running packaged apps), deduped and identity-resolved, with **no** exclusion policy — the
//!   inclusive "what's running" list.
//! - [`filter`] applies the exclusion policy (self, system paths, shell surface, background
//!   noise, unregistered background) to that raw list, returning the kept apps; the dropped
//!   candidates are logged via `tracing` (for debugging) rather than returned.
//!
//! The shared `PKEY_AppUserModel_ID` constant and the AppsFolder registry types (used by both
//! `collect` and `appsfolder`) also live here.

use std::collections::HashMap;
use std::path::PathBuf;

use windows::Win32::Foundation::{PROPERTYKEY, RPC_E_CHANGED_MODE};
use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize};
use windows::core::GUID;

use crate::app_data::AppData;

mod appsfolder;
mod collect;
mod filter;

/// `PKEY_AppUserModel_ID` (propkey.h): fmtid `{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}`, pid 5.
/// Not projected by the `windows` crate, so defined by hand. Shared by the window reader and
/// the AppsFolder enumeration.
///
/// <https://learn.microsoft.com/en-us/windows/win32/properties/props-system-appusermodel-id>
const PKEY_APP_USER_MODEL_ID: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0x9F4C2855_9F79_4B39_A8D0_E1D42DE1D5F3),
    pid: 5,
};

/// One registered application from the AppsFolder, as identity + friendly name. Produced by
/// [`appsfolder`] and consumed by [`collect`] to resolve window/process identity.
struct AppRegistration {
    display_name: String,
}

/// AppsFolder contents keyed on **lowercased** AUMID.
type AppRegistry = HashMap<String, AppRegistration>;

/// Internal working record for one running application — carries everything the collection
/// and filtering stages need (`has_window`/`registered` drive the policy). Reduced to the
/// public [`AppData`] before being returned. Lives here because every field and the way they
/// are populated is Windows-specific.
struct RunningApp {
    /// A representative process id for the app (apps may span many processes).
    pid: u32,
    /// Raw executable file name, e.g. `chrome.exe`.
    name: String,
    /// Full path to the executable, when it could be resolved.
    exe_path: Option<PathBuf>,
    /// Friendly name resolved from the AppsFolder registry or version info, if any.
    display_name: Option<String>,
    /// Came from a real top-level window (Source A) vs. packaged-only (Source B).
    has_window: bool,
    /// The app is registered/user-launchable (its AUMID is in the AppsFolder registry).
    registered: bool,
}

impl RunningApp {
    /// The best human-readable label available for this app.
    fn label(&self) -> &str {
        self.display_name.as_deref().unwrap_or(&self.name)
    }

    /// Reduce to the public [`AppData`] (display name + path) returned to consumers.
    fn into_app_data(self) -> AppData {
        let display_name = self.label().to_owned();
        AppData {
            display_name,
            path: self.exe_path,
        }
    }
}

/// Windows implementation of [`super::get_running_apps`]. Infallible — collection and
/// filtering degrade to empty/skip on any OS-query failure.
///
/// Reading window property stores / AppsFolder / AppDiagnosticInfo needs COM, so this
/// initializes a single-threaded apartment (STA) for the duration of the call and balances it
/// with a matching `CoUninitialize`. If the calling thread was already initialized in a
/// different apartment (`RPC_E_CHANGED_MODE`) COM stays usable in that apartment and no
/// reference is released; any other initialization failure leaves the shell/WinRT calls to
/// fail their `Result`s, degrading to an empty list.
pub(super) fn get_running_apps() -> Vec<AppData> {
    // S_OK / S_FALSE add an initialization reference on this thread that we own and must
    // release; RPC_E_CHANGED_MODE does not (the thread keeps its existing apartment).
    let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let owns_com = hr.is_ok();
    if !owns_com && hr != RPC_E_CHANGED_MODE {
        tracing::warn!(?hr, "CoInitializeEx failed; running-app enumeration may be empty");
    }

    let apps = enumerate();

    if owns_com {
        // SAFETY: paired one-for-one with the successful CoInitializeEx above.
        unsafe { CoUninitialize() };
    }
    apps
}

/// Collect → filter → sort → reduce to the public [`AppData`] shape. Assumes COM is initialized
/// by the caller ([`get_running_apps`]).
fn enumerate() -> Vec<AppData> {
    // The authoritative set of registered launchable apps, keyed by AUMID — the input that
    // lets collection resolve real identities and tag user-launchable apps.
    let registry = appsfolder::load();

    // 1. Collection — the raw, inclusive list of running apps.
    let raw = collect::collect(&registry);

    // 2. Filtering — apply the exclusion policy (dropped candidates are logged, not returned).
    let mut kept = filter::apply(raw);

    // Sort for stable output, then reduce to the public shape.
    kept.sort_by(|a, b| a.label().to_ascii_lowercase().cmp(&b.label().to_ascii_lowercase()));
    kept.into_iter().map(RunningApp::into_app_data).collect()
}
