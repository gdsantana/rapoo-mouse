use crate::{decode, Query};
use hidapi::HidApi;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    ffi::CString,
    fs,
    os::unix::fs::MetadataExt,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const DESCRIPTOR_HASH: &str = "d6316567a9545dd700ac3d5f2d2d23ff408e2ee1125c5ea385a7dae38aa34738";

fn candidates() -> Result<Vec<std::path::PathBuf>, String> {
    let mut paths = Vec::new();
    for entry in fs::read_dir("/sys/class/hidraw").map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let device = entry.path().join("device");
        let identity = fs::read_to_string(device.join("uevent")).map_err(|e| e.to_string())?;
        if !identity
            .lines()
            .any(|line| line == "HID_ID=0003:000024AE:00001870")
        {
            continue;
        }
        let descriptor = fs::read(device.join("report_descriptor")).map_err(|e| e.to_string())?;
        if format!("{:x}", Sha256::digest(&descriptor)) == DESCRIPTOR_HASH {
            paths.push(std::path::Path::new("/dev").join(entry.file_name()));
        }
    }
    Ok(paths)
}

pub fn read_worker() -> Result<serde_json::Value, String> {
    read_worker_observed(|_, _| {})
}

fn read_worker_observed(
    mut observe: impl FnMut(&[u8; 32], &[u8]),
) -> Result<serde_json::Value, String> {
    let paths = candidates()?;
    if paths.is_empty() {
        return Err(
            "Nenhum receptor compatível encontrado. Conecte o receptor e tente novamente.".into(),
        );
    }
    if paths.len() > 1 {
        return Err("Mais de um receptor compatível encontrado. Deixe apenas um conectado e tente novamente.".into());
    }
    let path = paths[0].to_str().ok_or("Caminho HID inválido")?;
    // shortcut: non-cooperating HID clients can still interfere until the protocol identifies transactions.
    let lock = lock_receiver(path)?;
    ensure_receiver_unchanged(&lock, path)?;
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let path_c = CString::new(path).map_err(|e| e.to_string())?;
    let device = api
        .open_path(&path_c)
        .map_err(|e| format!("Não foi possível abrir {path}: {e}"))?;
    let info = device.get_device_info().map_err(|e| e.to_string())?;
    if (info.vendor_id(), info.product_id()) != (0x24ae, 0x1870) {
        return Err("Identidade HID mudou ao abrir o dispositivo".into());
    }
    let mut descriptor = [0u8; 4096];
    let descriptor_len = device
        .get_report_descriptor(&mut descriptor)
        .map_err(|e| e.to_string())?;
    if format!("{:x}", Sha256::digest(&descriptor[..descriptor_len])) != DESCRIPTOR_HASH {
        return Err("Descritor HID mudou ao abrir o dispositivo".into());
    }
    let results = query_all(|packet| {
        ensure_receiver_unchanged(&lock, path)?;
        if device.write(packet).map_err(|e| e.to_string())? != packet.len() {
            return Err("Envio incompleto".into());
        }
        thread::sleep(Duration::from_millis(450));
        let mut response = [0u8; 32];
        response[0] = 0xba;
        let count = device
            .get_input_report(&mut response)
            .map_err(|e| e.to_string())?;
        thread::sleep(Duration::from_millis(150));
        let response = response[..count].to_vec();
        observe(packet, &response);
        Ok(response)
    })?;
    ensure_receiver_unchanged(&lock, path)?;
    let snapshot = decode(&results[0].2, &results[1].2, &results[2].2).map_err(str::to_owned)?;
    let raw: Vec<_> = results.iter().map(|(name, packet, response)| json!({"query":name,"requestHex":hex(packet),"responseHex":hex(response)})).collect();
    let captured_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    Ok(
        json!({"experimental":true,"capturedAtUnixMs":captured_at,"device":path,"batteryPercent":snapshot.battery_percent,"dpiValues":snapshot.dpi_values,"enabledStages":snapshot.enabled_stages,"activeIndex":snapshot.active_index,"activeDpi":snapshot.dpi_values[usize::from(snapshot.active_index)],"pollingRateCode":snapshot.polling_rate_code,"pollingRateHz":snapshot.polling_rate_hz,"queries":raw}),
    )
}

type Report = (&'static str, [u8; 32], Vec<u8>);

fn ensure_receiver_unchanged(lock: &fs::File, path: &str) -> Result<(), String> {
    let locked = lock.metadata().map_err(|e| e.to_string())?;
    let current = fs::metadata(path).map_err(|_| "Dispositivo desconectado durante a leitura")?;
    if (locked.dev(), locked.ino()) != (current.dev(), current.ino()) {
        return Err("Dispositivo reconectado durante a leitura; resultado descartado".into());
    }
    Ok(())
}

fn lock_receiver(path: &str) -> Result<fs::File, String> {
    let file = fs::File::open(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::PermissionDenied {
            format!(
                "Sem permissão para acessar {path}. Consulte as instruções de permissão do Linux."
            )
        } else {
            format!("Não foi possível abrir {path}: {error}")
        }
    })?;
    file.try_lock().map_err(|error| match error {
        std::fs::TryLockError::WouldBlock => {
            "Outra leitura está em andamento. Aguarde e tente novamente.".to_owned()
        }
        std::fs::TryLockError::Error(error) => format!("Não foi possível bloquear {path}: {error}"),
    })?;
    Ok(file)
}

fn query_all(
    mut exchange: impl FnMut(&[u8; 32]) -> Result<Vec<u8>, String>,
) -> Result<Vec<Report>, String> {
    let mut results = Vec::new();
    for (name, query, expected) in [
        ("battery", Query::Battery, 3),
        ("dpi-list", Query::Dpi, 28),
        ("polling-rate", Query::PollingRate, 28),
    ] {
        let packet = query.request();
        let response = exchange(&packet)?;
        if response.len() != expected || response.first() != Some(&1) {
            let label = match name {
                "battery" => "bateria",
                "dpi-list" => "DPI",
                _ => "polling rate",
            };
            return Err(format!("Resposta inválida de {label}. Verifique se o mouse está ativo e tente novamente. Dados: {}", hex(&response)));
        }
        results.push((name, packet, response));
    }
    Ok(results)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    static PROCESS_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn stops_after_transport_failure_or_invalid_response() {
        let mut calls = 0;
        let result = query_all(|_| {
            calls += 1;
            if calls == 1 {
                Ok(vec![1, 1, 34])
            } else {
                Err("desconectado".into())
            }
        });
        assert!(result.is_err());
        assert_eq!(calls, 2);
        let mut calls = 0;
        let result = query_all(|_| {
            calls += 1;
            Ok(vec![2, 0, 0])
        });
        assert!(result.is_err());
        assert_eq!(calls, 1);
    }

    #[test]
    fn exchanges_match_real_capture() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../research/captures/mt760-rust-python-20261101.json"
        ))
        .unwrap();
        let records = fixture["rust"]["queries"].as_array().unwrap();
        let mut index = 0;
        let result = query_all(|packet| {
            let record = &records[index];
            index += 1;
            assert_eq!(hex(packet), record["requestHex"].as_str().unwrap());
            let raw = record["responseHex"].as_str().unwrap();
            Ok((0..raw.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&raw[i..i + 2], 16).unwrap())
                .collect())
        })
        .unwrap();
        let snapshot = decode(&result[0].2, &result[1].2, &result[2].2).unwrap();
        assert_eq!(
            (
                snapshot.battery_percent,
                snapshot.dpi_values[0],
                snapshot.polling_rate_hz
            ),
            (34, 1000, Some(1000))
        );
    }

    #[test]
    fn lock_prevents_overlapping_readers_and_is_released() {
        let _guard = PROCESS_TEST_LOCK.lock().unwrap();
        let dir = std::env::temp_dir();
        let path = dir.join(format!("kmh-lock-test-{}", std::process::id()));
        fs::write(&path, b"").unwrap();
        let path_str = path.to_str().unwrap();
        let first = lock_receiver(path_str).unwrap();
        assert!(lock_receiver(path_str)
            .unwrap_err()
            .contains("Outra leitura"));
        drop(first);
        assert!(lock_receiver(path_str).is_ok());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn isolated_reader_reports_failure_and_stops_a_blocked_worker() {
        let _guard = PROCESS_TEST_LOCK.lock().unwrap();
        let mut failed = Command::new("sh");
        failed.args(["-c", "echo desconectado >&2; exit 1"]);
        assert_eq!(
            run_isolated(failed, Duration::from_secs(1)).unwrap_err(),
            "desconectado"
        );
        let mut blocked = Command::new("sh");
        blocked.args(["-c", "exec sleep 5"]);
        assert!(run_isolated(blocked, Duration::from_millis(50))
            .unwrap_err()
            .contains("Tempo limite"));
        let mut invalid = Command::new("sh");
        invalid.args(["-c", "printf invalid"]);
        assert!(run_isolated(invalid, Duration::from_secs(1))
            .unwrap_err()
            .contains("inválida"));
    }

    #[test]
    #[ignore = "teste físico interativo: exige receptor MT760 e permissão hidraw"]
    fn physical_disconnect_after_battery_reply() {
        if std::env::var("KMH_PHYSICAL_DISCONNECT_TEST").as_deref() != Ok("1") {
            panic!("Defina KMH_PHYSICAL_DISCONNECT_TEST=1 para executar o teste físico");
        }
        let mut first_reply_seen = false;
        let result = read_worker_observed(|request, response| {
            if !first_reply_seen && request[2] == 0xaa && response.len() == 3 && response[0] == 1 {
                first_reply_seen = true;
                println!(
                    "PRIMEIRA_RESPOSTA request={} response={}",
                    hex(request),
                    hex(response)
                );
                println!("AGUARDANDO_REMOCAO");
                let mut line = String::new();
                std::io::stdin()
                    .read_line(&mut line)
                    .expect("confirmação de remoção");
            }
        });
        assert!(first_reply_seen, "a primeira resposta não foi confirmada");
        let error = result.unwrap_err();
        println!("RESULTADO_ERRO {error}");
        assert!(error.contains("desconectado") || error.contains("reconectado"));
    }

    #[test]
    fn removed_or_replaced_receiver_is_rejected() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("kmh-node-test-{}-{nonce}", std::process::id()));
        fs::create_dir(&directory).unwrap();
        let path = directory.join("receiver");
        let replacement = directory.join("replacement");
        fs::write(&path, b"").unwrap();
        let locked = fs::File::open(&path).unwrap();
        let path_str = path.to_str().unwrap();
        assert!(ensure_receiver_unchanged(&locked, path_str).is_ok());
        fs::write(&replacement, b"").unwrap();
        let mut sends = 0;
        let result = query_all(|_| {
            ensure_receiver_unchanged(&locked, path_str)?;
            sends += 1;
            fs::rename(&replacement, &path).unwrap();
            Ok(vec![1, 1, 37])
        });
        assert!(result.unwrap_err().contains("reconectado"));
        assert_eq!(sends, 1);
        fs::remove_file(&path).unwrap();
        assert!(ensure_receiver_unchanged(&locked, path_str)
            .unwrap_err()
            .contains("desconectado"));
        fs::remove_dir(directory).unwrap();
    }
}

/// Run one HID read in a separate process. The host must dispatch WORKER_ARG to read_worker.
pub const WORKER_ARG: &str = "--kmh-hid-worker";

pub fn read_isolated() -> Result<serde_json::Value, String> {
    let mut command = Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
    command.arg(WORKER_ARG);
    run_isolated(command, Duration::from_secs(8))
}

fn run_isolated(mut command: Command, timeout: Duration) -> Result<serde_json::Value, String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            let output = child.wait_with_output().map_err(|e| e.to_string())?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
            }
            return serde_json::from_slice(&output.stdout)
                .map_err(|e| format!("Resposta do processo inválida: {e}"));
        }
        if start.elapsed() >= timeout {
            child.kill().map_err(|e| e.to_string())?;
            child.wait().map_err(|e| e.to_string())?;
            return Err("Tempo limite de leitura excedido".into());
        }
        thread::sleep(Duration::from_millis(25));
    }
}
