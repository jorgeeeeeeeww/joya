// En Windows evita que se abra una consola negra junto a la ventana
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    la_joya_lib::run()
}
