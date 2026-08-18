//! Filtering: apply the exclusion policy to the raw running-app list from [`super::collect`].
//!
//! Each rule is a self-contained [`FilterStep`]; they run in the order given by [`pipeline`].
//! Adding/removing/reordering a rule touches only that list — never the collection code. Only
//! the kept apps are returned; dropped candidates (and which step dropped them) are emitted at
//! `debug` level via `tracing`, so the filtering is auditable without being part of the API.

use std::path::{Path, PathBuf};

use tracing::debug;
use windows::Win32::System::Threading::GetCurrentProcessId;

use super::RunningApp;

/// One self-contained filtering rule. Returns `true` to KEEP the candidate.
trait FilterStep {
    fn name(&self) -> &'static str;
    fn keep(&self, candidate: &RunningApp) -> bool;
}

/// The ordered exclusion pipeline.
fn pipeline(self_pid: u32) -> Vec<Box<dyn FilterStep>> {
    vec![
        Box::new(ExcludeSelf { self_pid }),
        Box::new(ExcludeSystemPaths),
        Box::new(ExcludeShellSurface),
        Box::new(ExcludeUnregisteredBackground),
        Box::new(ExcludeBackgroundNoise), // <-- final, compartmentalized noise policy
    ]
}

/// Run every step in order and return the kept apps. Each dropped candidate is logged at
/// `debug` (with the step that dropped it), as are per-step counts — auditable, not returned.
pub(super) fn apply(candidates: Vec<RunningApp>) -> Vec<RunningApp> {
    let self_pid = unsafe { GetCurrentProcessId() };

    let mut kept = candidates;

    for step in &pipeline(self_pid) {
        let before = kept.len();
        let (pass, dropped): (Vec<RunningApp>, Vec<RunningApp>) =
            kept.into_iter().partition(|c| step.keep(c));
        for c in &dropped {
            debug!(step = step.name(), app = c.label(), "filtered out running app");
        }
        kept = pass;
        debug!(step = step.name(), before, after = kept.len(), "filter step");
    }

    kept
}

/// Drop our own process.
struct ExcludeSelf {
    self_pid: u32,
}
impl FilterStep for ExcludeSelf {
    fn name(&self) -> &'static str {
        "exclude-self"
    }
    fn keep(&self, c: &RunningApp) -> bool {
        c.pid != self.self_pid
    }
}

/// Drop executables under `%SystemRoot%` (Task Manager, system UI, File Explorer, etc.).
struct ExcludeSystemPaths;
impl FilterStep for ExcludeSystemPaths {
    fn name(&self) -> &'static str {
        "exclude-system-paths"
    }
    fn keep(&self, c: &RunningApp) -> bool {
        match &c.exe_path {
            Some(p) => !is_under_system_root(p),
            None => true,
        }
    }
}

/// Drop OS shell surface that owns titled top-level windows but is not a user app
/// (Explorer/Progman, Start, Search, the packaged-app host, Widgets, …). Mostly redundant
/// with `ExcludeSystemPaths`, but catches shell surface under `Program Files\WindowsApps`.
struct ExcludeShellSurface;
impl FilterStep for ExcludeShellSurface {
    fn name(&self) -> &'static str {
        "exclude-shell-surface"
    }
    fn keep(&self, c: &RunningApp) -> bool {
        const SHELL_SURFACE: &[&str] = &[
            "explorer.exe",             // Progman ("Program Manager")
            "applicationframehost.exe", // fallback if child-PID resolution fails
            "searchhost.exe",
            "startmenuexperiencehost.exe",
            "shellexperiencehost.exe",
            "textinputhost.exe",
            "widgets.exe",
        ];
        !name_matches(&c.name, SHELL_SURFACE)
    }
}

/// Drop windowless candidates that aren't registered/user-launchable. This removes the system
/// shell surface that `AppDiagnosticInfo` returns (Start, Search, Shell Experience Host,
/// Widgets, WinGet COM Server, …) while keeping windowless *registered* apps (Teams, Copilot)
/// and every window-backed app (which is exempt regardless of registration).
struct ExcludeUnregisteredBackground;
impl FilterStep for ExcludeUnregisteredBackground {
    fn name(&self) -> &'static str {
        "exclude-unregistered-background"
    }
    fn keep(&self, c: &RunningApp) -> bool {
        c.has_window || c.registered
    }
}

/// FINAL STEP — the single place to tune "app vs. background noise".
///
/// User-installed background helpers/telemetry that *do* present a real window but are never
/// autotype/pairing targets. Listed explicitly. Longer term, a UI-Automation tray-icon signal
/// (real apps have a tray icon; these helpers do not) would slot in as exactly this one step,
/// leaving everything upstream untouched.
struct ExcludeBackgroundNoise;
impl FilterStep for ExcludeBackgroundNoise {
    fn name(&self) -> &'static str {
        "exclude-background-noise"
    }
    fn keep(&self, c: &RunningApp) -> bool {
        const BACKGROUND_NOISE: &[&str] = &[
            "vctip.exe",                       // Visual C++ telemetry uploader
            "onedrive.sync.service.exe",       // OneDrive sync helper (folds into OneDrive)
            "windowspackagemanagerserver.exe", // WinGet COM server (WingetMessageOnlyWindow)
        ];
        !name_matches(&c.name, BACKGROUND_NOISE)
    }
}

fn name_matches(name: &str, list: &[&str]) -> bool {
    let lc = name.to_ascii_lowercase();
    list.contains(&lc.as_str())
}

/// Is the executable under `%SystemRoot%` (typically `C:\Windows`)?
fn is_under_system_root(path: &Path) -> bool {
    let Some(system_root) = std::env::var_os("SystemRoot").or_else(|| std::env::var_os("windir"))
    else {
        return false;
    };
    // Compare on component boundaries so a sibling like `C:\Windows.old\…` does NOT match
    // `C:\Windows`, and lowercase both sides first since Windows paths are case-insensitive
    // (`Path::starts_with` itself is case-sensitive).
    let root = PathBuf::from(system_root.to_string_lossy().to_ascii_lowercase());
    let path = PathBuf::from(path.to_string_lossy().to_ascii_lowercase());
    path.starts_with(&root)
}
