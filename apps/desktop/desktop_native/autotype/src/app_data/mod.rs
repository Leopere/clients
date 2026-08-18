//! Data about applications used for autotype app pairing and verification.

use std::path::PathBuf;

pub mod path;
pub mod running_apps;

/// A running application, reduced to what a consumer needs for pairing: its display name and
/// executable path. This is the public shape returned by [`running_apps::get_running_apps`];
/// the richer internal record used to collect and filter apps lives in the private,
/// platform-specific backend and is not exposed.
#[derive(Debug, Clone)]
pub struct AppData {
    /// Best human-readable name for the app (e.g. `Google Chrome`, `Netflix`).
    pub display_name: String,
    /// Full path to the app's executable, when it could be resolved.
    pub path: Option<PathBuf>,
}

