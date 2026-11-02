#[cfg(target_os = "linux")]
mod watch;

#[cfg(target_os = "linux")]
#[tauri::command]
fn get_capabilities(
    state: tauri::State<'_, std::sync::Arc<watch::WatchState>>,
) -> serde_json::Value {
    serde_json::json!({"readTelemetry": state.checkpoint().is_ok(), "writeDpi": false})
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn get_capabilities() -> serde_json::Value {
    serde_json::json!({"readTelemetry": false, "writeDpi": false})
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn read_mt760(
    state: tauri::State<'_, std::sync::Arc<watch::WatchState>>,
) -> Result<serde_json::Value, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        watch::protected_read(&state, rapoo_native_core::linux::read_isolated)
    })
    .await
    .map_err(|error| format!("Falha no processo de leitura: {error}"))?
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn read_mt760() -> Result<serde_json::Value, String> {
    Err("A leitura nativa está disponível somente no Linux.".into())
}

fn main() {
    #[cfg(target_os = "linux")]
    if std::env::args().skip(1).collect::<Vec<_>>() == [rapoo_native_core::linux::WORKER_ARG] {
        match rapoo_native_core::linux::read_worker() {
            Ok(snapshot) => println!("{snapshot}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }

    let builder = tauri::Builder::default();
    #[cfg(target_os = "linux")]
    let builder = builder.setup(|app| {
        use tauri::Manager;
        let state = std::sync::Arc::new(watch::WatchState::new());
        if let Err(error) = watch::start(app.handle().clone(), state.clone()) {
            eprintln!("Observação de dispositivos indisponível: {error}");
        }
        app.manage(state);
        Ok(())
    });
    let app = builder
        .invoke_handler(tauri::generate_handler![read_mt760, get_capabilities])
        .build(tauri::generate_context!())
        .expect("Falha ao executar o Rapoo Mouse");
    app.run(|app, event| {
        #[cfg(target_os = "linux")]
        if matches!(event, tauri::RunEvent::Exit) {
            use tauri::Manager;
            app.state::<std::sync::Arc<watch::WatchState>>().stop();
        }
        #[cfg(not(target_os = "linux"))]
        let _ = (app, event);
    });
}
