use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Client {
    tick: u64,
    world_seed: u64,
}

#[wasm_bindgen]
impl Client {
    #[wasm_bindgen(constructor)]
    pub fn new(world_seed: u64) -> Self {
        Self {
            tick: 0,
            world_seed,
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
}

#[wasm_bindgen]
pub fn version() -> String {
    "horizon-web 0.1.0".to_owned()
}
