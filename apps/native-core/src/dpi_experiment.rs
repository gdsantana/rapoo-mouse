//! Pure preparation and verification for the observed inactive-stage experiment.
//! This module does not send reports or enable configuration in the application.

#[derive(Debug)]
pub struct DpiExperiment {
    original: [u8; 28],
    polling: [u8; 28],
}

impl DpiExperiment {
    pub fn prepare(dpi: &[u8], polling: &[u8]) -> Result<Self, &'static str> {
        if dpi.len() != 28 || polling.len() != 28 || dpi[0] != 1 || polling[0] != 1 {
            return Err("invalid configuration responses");
        }
        if polling[12..28] != dpi[4..20] {
            return Err("inconsistent configuration responses");
        }
        let values = &dpi[4..18];
        if u16::from_le_bytes([values[0], values[1]]) != 20
            || values
                .chunks_exact(2)
                .any(|value| !(1..=80).contains(&u16::from_le_bytes([value[0], value[1]])))
            || !(1..=6).contains(&dpi[18])
            || dpi[19] != 0
            || dpi[20] == 0
            || dpi[20] > dpi[18]
        {
            return Err("configuration is not suitable for the inactive-stage experiment");
        }
        let mut original = [0; 28];
        let mut original_polling = [0; 28];
        original.copy_from_slice(dpi);
        original_polling.copy_from_slice(polling);
        Ok(Self {
            original,
            polling: original_polling,
        })
    }

    pub fn packet(&self, restore: bool) -> [u8; 32] {
        let mut request = [0; 32];
        request[..8].copy_from_slice(&[0xba, 0xa5, 0xa5, 0x10, 0x38, 0x06, 0, 0]);
        request[8..24].copy_from_slice(&self.original[4..20]);
        if !restore {
            request[8] = 21;
        }
        request
    }

    pub fn verify(&self, dpi: &[u8], polling: &[u8], restored: bool) -> Result<(), &'static str> {
        if dpi.len() != 28 || polling.len() != 28 || dpi[0] != 1 || polling[0] != 1 {
            return Err("invalid verification responses");
        }
        let mut expected = self.original;
        if !restored {
            expected[4] = 21;
        }
        if dpi[4..] != expected[4..]
            || polling[4..12] != self.polling[4..12]
            || polling[12..28] != dpi[4..20]
        {
            return Err("verification does not match the expected configuration");
        }
        Ok(())
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    fn raw(snapshot: &serde_json::Value, key: &str) -> Vec<u8> {
        let value = snapshot["rawResponses"][key].as_str().unwrap();
        (0..value.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&value[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn matches_physical_write_and_restore_evidence() {
        let capture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../research/captures/mt760-dpi-write-20261017T154052865924Z.json"
        ))
        .unwrap();
        let before = &capture["before"];
        let experiment =
            DpiExperiment::prepare(&raw(before, "dpi-list"), &raw(before, "polling-rate")).unwrap();
        let events = capture["events"].as_array().unwrap();
        for (index, restore) in [(0, false), (1, true)] {
            let expected = events[index]["requestHex"].as_str().unwrap();
            let actual: String = experiment
                .packet(restore)
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect();
            assert_eq!(actual, expected);
        }
        for (key, restored) in [
            ("after", false),
            ("afterPowerCycle", false),
            ("restored", true),
        ] {
            let snapshot = &capture[key];
            experiment
                .verify(
                    &raw(snapshot, "dpi-list"),
                    &raw(snapshot, "polling-rate"),
                    restored,
                )
                .unwrap();
        }
        assert!(experiment
            .verify(
                &raw(before, "dpi-list"),
                &raw(before, "polling-rate"),
                false
            )
            .is_err());
    }

    #[test]
    fn rejects_active_stage_out_of_range_and_mismatched_blocks() {
        let capture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../research/captures/mt760-dpi-write-20261017T154052865924Z.json"
        ))
        .unwrap();
        let mut dpi = raw(&capture["before"], "dpi-list");
        let mut polling = raw(&capture["before"], "polling-rate");
        dpi[20] = 0;
        assert!(DpiExperiment::prepare(&dpi, &polling).is_err());
        dpi[20] = 2;
        dpi[6] = 81;
        polling[14] = 81;
        assert!(DpiExperiment::prepare(&dpi, &polling).is_err());
        polling[14] = 24;
        assert!(DpiExperiment::prepare(&dpi, &polling).is_err());
        assert!(DpiExperiment::prepare(&dpi[..3], &polling).is_err());
    }
}
