//! Experimental MT760 protocol and manual Linux HID access.

pub mod dpi_experiment;
#[cfg(target_os = "linux")]
pub mod linux;

#[derive(Debug, PartialEq, Eq)]
pub enum Query {
    Battery,
    Dpi,
    PollingRate,
}

impl Query {
    pub fn request(&self) -> [u8; 32] {
        let (operation, length, address): (u8, u8, u32) = match self {
            Self::Battery => (0xaa, 0, 0),
            Self::Dpi => (0xa4, 0x18, 0x638),
            Self::PollingRate => (0xa4, 0x18, 0x630),
        };
        let mut packet = [0; 32];
        packet[..4].copy_from_slice(&[0xba, 0xa5, operation, length]);
        packet[4..8].copy_from_slice(&address.to_le_bytes());
        packet
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct Snapshot {
    pub battery_percent: u8,
    pub dpi_values: [u32; 7],
    pub enabled_stages: u8,
    pub active_index: u8,
    pub polling_rate_code: u8,
    pub polling_rate_hz: Option<u16>,
}

pub fn decode(battery: &[u8], dpi: &[u8], polling: &[u8]) -> Result<Snapshot, &'static str> {
    if battery.len() != 3 || battery[0] != 1 || ![1, 2].contains(&battery[1]) || battery[2] > 100 {
        return Err("invalid battery response");
    }
    if dpi.len() != 28 || dpi[0] != 1 || polling.len() != 28 || polling[0] != 1 {
        return Err("invalid DPI or polling response");
    }
    if polling[12..28] != dpi[4..20] {
        return Err("inconsistent DPI and polling responses");
    }
    let enabled = dpi[18]
        .checked_add(1)
        .filter(|value| *value <= 7)
        .ok_or("invalid stage count")?;
    if dpi[20] >= enabled {
        return Err("invalid active stage");
    }
    let mut values = [0u32; 7];
    for (index, value) in values.iter_mut().enumerate() {
        *value = u32::from(u16::from_le_bytes([dpi[4 + index * 2], dpi[5 + index * 2]])) * 50;
    }
    if values[..usize::from(enabled)].contains(&0) {
        return Err("invalid DPI value");
    }
    let code = polling[5];
    Ok(Snapshot {
        battery_percent: battery[2],
        dpi_values: values,
        enabled_stages: enabled,
        active_index: dpi[20],
        polling_rate_code: code,
        polling_rate_hz: match code {
            8 => Some(125),
            4 => Some(250),
            2 => Some(500),
            1 => Some(1000),
            _ => None,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_packets_match_observed_protocol() {
        assert_eq!(
            &Query::Battery.request()[..8],
            &[0xba, 0xa5, 0xaa, 0, 0, 0, 0, 0]
        );
        assert_eq!(
            &Query::Dpi.request()[..8],
            &[0xba, 0xa5, 0xa4, 0x18, 0x38, 6, 0, 0]
        );
        assert_eq!(
            &Query::PollingRate.request()[..8],
            &[0xba, 0xa5, 0xa4, 0x18, 0x30, 6, 0, 0]
        );
        assert!(Query::Dpi.request()[8..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn observed_snapshot_and_invalid_responses() {
        // Raw responses from research/captures/bridge-read-after-idle-20261031.json.
        let battery = [1, 1, 38];
        let dpi = [
            1, 0, 0, 0, 20, 0, 24, 0, 27, 0, 16, 0, 48, 0, 64, 0, 80, 0, 2, 0, 0, 0, 2, 3, 16, 0,
            20, 0,
        ];
        let mut polling = [
            1, 0, 0, 0, 2, 1, 255, 255, 1, 2, 0, 3, 20, 0, 24, 0, 27, 0, 16, 0, 48, 0, 64, 0, 80,
            0, 2, 0,
        ];
        let snapshot = decode(&battery, &dpi, &polling).unwrap();
        assert_eq!(
            (
                snapshot.battery_percent,
                snapshot.dpi_values[0],
                snapshot.enabled_stages,
                snapshot.active_index,
                snapshot.polling_rate_hz
            ),
            (38, 1000, 3, 0, Some(1000))
        );
        assert!(decode(&battery[..2], &dpi, &polling).is_err());
        polling[12] = 0;
        assert!(decode(&battery, &dpi, &polling).is_err());
        polling[12] = 20;
        polling[5] = 3;
        assert_eq!(
            decode(&battery, &dpi, &polling).unwrap().polling_rate_hz,
            None
        );
        let mut bad_dpi = dpi;
        bad_dpi[20] = 3;
        assert!(decode(&battery, &bad_dpi, &polling).is_err());
    }
}
