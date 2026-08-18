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

use windows::System::{AppDiagnosticInfo, DiagnosticAccessStatus};

use super::{AppRegistry, RunningApp, process_image_path};

/// Fold running packaged apps into the window-derived set. Each is tagged `registered`
/// (present in the AppsFolder registry) and merged **by PID**: if a window entry already
/// represents one of its processes, enrich that entry; otherwise add it as a windowless
/// candidate (no visible window). Whether a windowless/unregistered entry survives is left to
/// the filter pipeline (collection stays inclusive).
pub(super) fn merge_packaged_apps(
    registry: &AppRegistry,
    by_key: &mut HashMap<String, RunningApp>,
) {
    for app in running_packaged_apps() {
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
                exe_path: process_image_path(pid),
                display_name: Some(app.display_name),
                has_window: false,
                registered,
            },
        );
    }
}

/// A running packaged app: identity (AUMID), friendly name, and the PIDs of its processes
/// (used to merge with window-derived entries).
struct RunningPackagedApp {
    aumid: String,
    display_name: String,
    pids: Vec<u32>,
}

/// Enumerate running packaged apps. Never panics; returns empty on denial or any WinRT error
/// (callers then rely on window enumeration alone).
fn running_packaged_apps() -> Vec<RunningPackagedApp> {
    enumerate().unwrap_or_default()
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
