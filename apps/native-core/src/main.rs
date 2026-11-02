#[cfg(target_os = "linux")]
fn main() {
    use rapoo_native_core::linux::{read_isolated, read_worker, WORKER_ARG};
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args == [WORKER_ARG] {
        match read_worker() {
            Ok(snapshot) => println!("{snapshot}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }
    if args != ["--read"] {
        eprintln!("Uso: rapoo-native-core --read");
        std::process::exit(2);
    }
    match read_isolated() {
        Ok(snapshot) => println!("{snapshot}"),
        Err(error) => {
            eprintln!("Leitura interrompida: {error}");
            std::process::exit(1);
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn main() {
    eprintln!("O diagnóstico HID está disponível apenas no Linux.");
    std::process::exit(1);
}
