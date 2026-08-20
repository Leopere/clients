//! Source B: running **packaged** apps, via the documented WinRT `AppDiagnosticInfo` API.
//!
//! Complements window enumeration (Source A): packaged apps that are running but keep no real
//! top-level window when backgrounded (Teams, Copilot) have no Source-A signal, but they *do*
//! appear here. This module both *acquires* the raw list ([`running_packaged_apps`]) and
//! *folds* it into the window-derived set ([`merge_packaged_apps`]).
//!
//! `AppDiagnosticInfo` lists *all* running packaged apps, including system shell surface
//! (Start, Search, Widgets, …). We tag each with whether it is `registered` (present in the
//! AppsFolder registry) and leave the keep/drop decision to the [`super::super::filter`]
//! pipeline — collection stays inclusive.

use std::collections::HashMap;
use std::path::PathBuf;

use windows::System::{AppDiagnosticInfo, DiagnosticAccessStatus};

use super::{AppRegistry, RunningApp, process_image_path};

/// A running packaged app: identity (AUMID), friendly name, and the PIDs of its processes
/// (used to merge with window-derived entries).
pub(super) struct RunningPackagedApp {
    aumid: String,
    display_name: String,
    pids: Vec<u32>,
}

/// Source of running packaged apps plus PID→executable-path resolution. Abstracts the WinRT/Win32
/// FFI so the merge logic can be unit-tested with a fixed list.
#[cfg_attr(test, mockall::automock)]
pub(super) trait PackagedSource {
    fn running_packaged_apps(&self) -> Vec<RunningPackagedApp>;
    fn image_path(&self, pid: u32) -> Option<PathBuf>;
}

/// Production [`PackagedSource`]: the WinRT `AppDiagnosticInfo` enumeration and real process paths.
pub(super) struct Win32PackagedSource;

impl PackagedSource for Win32PackagedSource {
    /// Never panics; returns empty on denial or any WinRT error (callers then rely on window
    /// enumeration alone).
    fn running_packaged_apps(&self) -> Vec<RunningPackagedApp> {
        enumerate().unwrap_or_default()
    }

    fn image_path(&self, pid: u32) -> Option<PathBuf> {
        process_image_path(pid)
    }
}

/// Fold running packaged apps into the window-derived set. Each is tagged `registered`
/// (present in the AppsFolder registry) and merged **by PID**: if a window entry already
/// represents one of its processes, enrich that entry; otherwise add it as a windowless
/// candidate (no visible window). Whether a windowless/unregistered entry survives is left to
/// the filter pipeline (collection stays inclusive).
///
/// Pure over the data from `source` (no FFI), so the PID-merge and tagging logic is unit-testable.
pub(super) fn merge_packaged_apps<P: PackagedSource>(
    source: &P,
    registry: &AppRegistry,
    by_key: &mut HashMap<String, RunningApp>,
) {
    for app in source.running_packaged_apps() {
        let aumid_key = app.aumid.to_ascii_lowercase();
        let registered = registry.contains_key(&aumid_key);

        // Merge by PID into an existing window-derived entry, if any.
        let matched = by_key
            .iter()
            .find(|(_, c)| app.pids.contains(&c.pid))
            .map(|(k, _)| k.clone());
        if let Some(k) = matched {
            if let Some(c) = by_key.get_mut(&k) {
                if c.display_name.is_none() {
                    c.display_name = Some(app.display_name.clone());
                }
                c.registered |= registered;
            }
            continue;
        }

        // Windowless packaged app — running but backgrounded (no visible window).
        let pid = app.pids.first().copied().unwrap_or(0);
        by_key.insert(
            format!("aumid:{aumid_key}"),
            RunningApp {
                pid,
                name: app.display_name.clone(),
                exe_path: source.image_path(pid),
                display_name: Some(app.display_name),
                has_window: false,
                registered,
            },
        );
    }
}

fn enumerate() -> windows::core::Result<Vec<RunningPackagedApp>> {
    if AppDiagnosticInfo::RequestAccessAsync()?.join()? != DiagnosticAccessStatus::Allowed {
        return Ok(Vec::new());
    }

    let infos = AppDiagnosticInfo::RequestInfoAsync()?.join()?;
    let mut out = Vec::new();
    for info in infos {
        let Ok(app) = info.AppInfo() else { continue };
        let aumid = app.AppUserModelId().map(|s| s.to_string()).unwrap_or_default();
        if aumid.is_empty() {
            continue;
        }
        let display_name = app
            .DisplayInfo()
            .and_then(|d| d.DisplayName())
            .map(|s| s.to_string())
            .unwrap_or_default();

        out.push(RunningPackagedApp {
            aumid,
            display_name,
            pids: pids_of(&info),
        });
    }
    Ok(out)
}

/// The PIDs backing an app, via its resource groups' process diagnostic infos.
fn pids_of(info: &AppDiagnosticInfo) -> Vec<u32> {
    let mut pids = Vec::new();
    if let Ok(groups) = info.GetResourceGroups() {
        for group in groups {
            if let Ok(procs) = group.GetProcessDiagnosticInfos() {
                for proc in procs {
                    if let Ok(pid) = proc.ProcessId() {
                        pids.push(pid);
                    }
                }
            }
        }
    }
    pids
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_data::running_apps::windows::AppRegistration;
    use mockall::predicate;

    fn registry(aumids: &[&str]) -> AppRegistry {
        aumids
            .iter()
            .map(|a| (a.to_string(), AppRegistration { display_name: String::new() }))
            .collect()
    }

    fn packaged(aumid: &str, display: &str, pids: Vec<u32>) -> RunningPackagedApp {
        RunningPackagedApp { aumid: aumid.to_string(), display_name: display.to_string(), pids }
    }

    fn window_entry(pid: u32) -> RunningApp {
        RunningApp {
            pid,
            name: "host.exe".to_string(),
            exe_path: None,
            display_name: None,
            has_window: true,
            registered: false,
        }
    }

    #[test]
    fn merge_enriches_existing_entry_by_pid() {
        let mut by_key = HashMap::new();
        by_key.insert("aumid:teams.app".to_string(), window_entry(500));

        let mut source = MockPackagedSource::new();
        source
            .expect_running_packaged_apps()
            .once()
            .returning(|| vec![packaged("Teams.App", "Microsoft Teams", vec![500])]);
        source.expect_image_path().never(); // PID matched → no windowless insert

        merge_packaged_apps(&source, &registry(&["teams.app"]), &mut by_key);

        assert_eq!(by_key.len(), 1);
        let c = by_key.get("aumid:teams.app").expect("entry");
        assert_eq!(c.display_name.as_deref(), Some("Microsoft Teams"));
        assert!(c.registered);
    }

    #[test]
    fn merge_inserts_windowless_entry_when_no_pid_match() {
        let mut by_key = HashMap::new();

        let mut source = MockPackagedSource::new();
        source
            .expect_running_packaged_apps()
            .once()
            .returning(|| vec![packaged("Copilot.App", "Copilot", vec![777])]);
        source
            .expect_image_path()
            .once()
            .with(predicate::eq(777u32))
            .returning(|_| Some(PathBuf::from("C:\\Copilot.exe")));

        merge_packaged_apps(&source, &registry(&["copilot.app"]), &mut by_key);

        assert_eq!(by_key.len(), 1);
        let c = by_key.get("aumid:copilot.app").expect("entry");
        assert!(!c.has_window);
        assert!(c.registered);
        assert_eq!(c.display_name.as_deref(), Some("Copilot"));
        assert_eq!(c.exe_path, Some(PathBuf::from("C:\\Copilot.exe")));
    }

    #[test]
    fn merge_tags_unregistered_when_absent_from_registry() {
        let mut by_key = HashMap::new();
        let mut source = MockPackagedSource::new();
        source
            .expect_running_packaged_apps()
            .once()
            .returning(|| vec![packaged("Unknown.App", "Unknown", vec![888])]);
        source.expect_image_path().returning(|_| None);

        merge_packaged_apps(&source, &registry(&[]), &mut by_key);

        assert!(!by_key.get("aumid:unknown.app").expect("entry").registered);
    }
}
