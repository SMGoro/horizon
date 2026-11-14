use horizon_core::{noise::PerlinNoise, random::LegacyRandom};
use js_sys::Float32Array;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Client {
    tick: u64,
    world_seed: u64,
    terrain: PerlinNoise,
}

#[wasm_bindgen]
impl Client {
    #[wasm_bindgen(constructor)]
    pub fn new(world_seed: u64) -> Self {
        let mut random = LegacyRandom::new(world_seed as i64);
        Self {
            tick: 0,
            world_seed,
            terrain: PerlinNoise::new(&mut random),
        }
    }

    pub fn tick(&mut self) {
        self.tick = self.tick.wrapping_add(1);
    }

    pub fn tick_count(&self) -> u64 {
        self.tick
    }

    pub fn world_seed(&self) -> u64 {
        self.world_seed
    }

    pub fn terrain_heights(&self, width: u32, depth: u32) -> Float32Array {
        Float32Array::from(self.terrain_values(width, depth).as_slice())
    }

    fn terrain_values(&self, width: u32, depth: u32) -> Vec<f32> {
        let mut heights = Vec::with_capacity(width.saturating_mul(depth) as usize);
        for z in 0..depth {
            for x in 0..width {
                let noise = self.terrain.get2(f64::from(x) * 0.08, f64::from(z) * 0.08);
                heights.push((0.8 + noise * 3.2).max(0.1));
            }
        }
        heights
    }
}

#[wasm_bindgen]
pub fn version() -> String {
    "horizon-web 0.2.0 · horizon-core terrain".to_owned()
}

#[cfg(test)]
mod tests {
    use super::Client;

    #[test]
    fn terrain_is_deterministic_for_a_seed() {
        let first = Client::new(1234).terrain_values(4, 4);
        let second = Client::new(1234).terrain_values(4, 4);
        assert_eq!(first, second);
    }
}
