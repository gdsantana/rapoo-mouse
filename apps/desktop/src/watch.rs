use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct WatchState {
    generation: AtomicU64,
    available: AtomicBool,
    running: AtomicBool,
    instance_id: uuid::Uuid,
    revision: AtomicU64,
}

impl WatchState {
    pub fn new() -> Self {
        Self {
            generation: AtomicU64::new(0),
            available: AtomicBool::new(false),
            running: AtomicBool::new(true),
            instance_id: uuid::Uuid::new_v4(),
            revision: AtomicU64::new(0),
        }
    }

    pub fn checkpoint(&self) -> Result<u64, String> {
        if !self.available.load(Ordering::SeqCst) {
            return Err("Não foi possível acompanhar conexões HID. Reinicie o aplicativo e tente novamente.".into());
        }
        Ok(self.generation.load(Ordering::SeqCst))
    }

    pub fn confirm(&self, expected: u64) -> Result<u64, String> {
        let current = self.checkpoint()?;
        if current != expected {
            return Err("Uma conexão HID mudou durante a leitura. Tente novamente.".into());
        }
        Ok(current)
    }

    fn change(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }
    fn next_revision(&self) -> Result<u64, String> {
        let mut current = self.revision.load(Ordering::SeqCst);
        loop {
            let next = current
                .checked_add(1)
                .filter(|value| *value <= 9_007_199_254_740_991)
                .ok_or("Limite de revisões atingido. Reinicie o aplicativo.")?;
            match self.revision.compare_exchange_weak(
                current,
                next,
                Ordering::SeqCst,
                Ordering::SeqCst,
            ) {
                Ok(_) => return Ok(next),
                Err(observed) => current = observed,
            }
        }
    }
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

pub fn protected_read(
    state: &WatchState,
    read: impl FnOnce() -> Result<serde_json::Value, String>,
) -> Result<serde_json::Value, String> {
    let generation = state.checkpoint()?;
    let mut snapshot = read()?;
    let generation = state.confirm(generation)?;
    let object = snapshot
        .as_object_mut()
        .ok_or("Resposta inválida do núcleo")?;
    let revision = state.next_revision()?;
    state.confirm(generation)?;
    object.insert("eventGeneration".into(), serde_json::json!(generation));
    object.insert(
        "sessionId".into(),
        serde_json::json!(format!("{}:{generation}", state.instance_id)),
    );
    object.insert("revision".into(), serde_json::json!(revision));
    Ok(snapshot)
}

pub fn start(app: AppHandle, state: Arc<WatchState>) -> Result<(), String> {
    let (tx, rx) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("kmh-hid-watch".into())
        .spawn(move || {
            let result = udev::MonitorBuilder::new()
                .and_then(|builder| builder.match_subsystem("hidraw"))
                .and_then(|builder| builder.listen());
            let socket = match result {
                Ok(socket) => socket,
                Err(error) => {
                    let _ = tx.send(Err(error.to_string()));
                    return;
                }
            };
            state.available.store(true, Ordering::SeqCst);
            if tx.send(Ok(())).is_err() {
                state.available.store(false, Ordering::SeqCst);
                return;
            }
            use std::os::fd::AsRawFd;
            while state.running.load(Ordering::SeqCst) {
                let mut descriptor = libc::pollfd {
                    fd: socket.as_raw_fd(),
                    events: libc::POLLIN,
                    revents: 0,
                };
                // libudev exposes a nonblocking socket; poll waits without querying HID devices.
                let result = unsafe { libc::poll(&mut descriptor, 1, 500) };
                if result < 0 {
                    if std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted {
                        continue;
                    }
                    break;
                }
                if descriptor.revents & (libc::POLLERR | libc::POLLHUP | libc::POLLNVAL) != 0 {
                    break;
                }
                if descriptor.revents & libc::POLLIN != 0 {
                    for event in socket.iter() {
                        if matches!(
                            event.event_type(),
                            udev::EventType::Add | udev::EventType::Remove
                        ) {
                            let generation = state.change();
                            let _ = app.emit(
                                "kmh-hid-changed",
                                serde_json::json!({"generation": generation, "available": true}),
                            );
                        }
                    }
                }
            }
            state.available.store(false, Ordering::SeqCst);
            if state.running.load(Ordering::SeqCst) {
                let generation = state.change();
                let _ = app.emit(
                    "kmh-hid-changed",
                    serde_json::json!({"generation": generation, "available": false}),
                );
            }
        })
        .map_err(|error| error.to_string())?;
    rx.recv_timeout(Duration::from_secs(2))
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disconnect_invalidates_inflight_results_and_failed_monitor_fails_closed() {
        let state = WatchState::new();
        assert!(state.checkpoint().is_err());
        state.available.store(true, Ordering::SeqCst);
        let initial = state.checkpoint().unwrap();
        assert_eq!(state.confirm(initial).unwrap(), initial);
        state.change();
        assert!(state.confirm(initial).is_err());
        let next = state.checkpoint().unwrap();
        assert!(next > initial);
        state.available.store(false, Ordering::SeqCst);
        assert!(state.confirm(next).is_err());
    }

    #[test]
    fn protected_read_never_returns_a_result_from_before_a_change() {
        let state = WatchState::new();
        state.available.store(true, Ordering::SeqCst);
        let result = protected_read(&state, || {
            state.change();
            Ok(serde_json::json!({"batteryPercent": 37}))
        });
        assert!(result.is_err());
        let snapshot =
            protected_read(&state, || Ok(serde_json::json!({"batteryPercent": 37}))).unwrap();
        assert_eq!(snapshot["eventGeneration"], 1);
        assert_eq!(snapshot["revision"], 1);
        let repeated = protected_read(&state, || Ok(serde_json::json!({}))).unwrap();
        assert_eq!(repeated["sessionId"], snapshot["sessionId"]);
        assert_eq!(repeated["revision"], 2);
        state.change();
        let next_session = protected_read(&state, || Ok(serde_json::json!({}))).unwrap();
        assert_ne!(next_session["sessionId"], repeated["sessionId"]);
        assert_eq!(next_session["revision"], 3);
        state.available.store(false, Ordering::SeqCst);
        let mut called = false;
        assert!(protected_read(&state, || {
            called = true;
            Ok(serde_json::json!({}))
        })
        .is_err());
        assert!(!called);
    }

    #[test]
    fn different_app_instances_do_not_reuse_session_ids() {
        let first = WatchState::new();
        let second = WatchState::new();
        first.available.store(true, Ordering::SeqCst);
        second.available.store(true, Ordering::SeqCst);
        let first_snapshot = protected_read(&first, || Ok(serde_json::json!({}))).unwrap();
        let second_snapshot = protected_read(&second, || Ok(serde_json::json!({}))).unwrap();
        assert_ne!(first_snapshot["sessionId"], second_snapshot["sessionId"]);
        assert_eq!(first_snapshot["revision"], 1);
        assert_eq!(second_snapshot["revision"], 1);
    }
}
