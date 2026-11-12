// La capa de la Mac: ícono en la barra de menú, ventana que se esconde al cerrarla y plugins.
// Todo lo demás (pantallas, datos, menú de arriba) vive en React, en `mac/src/`.
use tauri::{
    image::Image,
    menu::MenuBuilder,
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::StateFlags;

const VENTANA: &str = "principal";

/// Trae la ventana al frente, venga de donde venga (barra de menú, Dock o un segundo intento de abrir)
fn mostrar_ventana(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();
    if let Some(ventana) = app.get_webview_window(VENTANA) {
        let _ = ventana.unminimize();
        let _ = ventana.show();
        let _ = ventana.set_focus();
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        // Tiene que ir primero: si ya está abierta, la trae al frente en vez de abrir otra
        .plugin(tauri_plugin_single_instance::init(|app, _args, _carpeta| {
            mostrar_ventana(app);
        }))
        // Recuerda tamaño y lugar, pero nunca «estaba escondida»: al abrir siempre se ve
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        // Las peticiones a la nube salen por aquí y no por el navegador interno de la Mac (ver src/lib/nube.ts)
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle();
            let menu = MenuBuilder::new(handle)
                .text("abrir", "Abrir La Joya")
                .text("nueva", "Nueva reservación")
                .separator()
                .text("salir", "Salir de La Joya")
                .build()?;
            // `principal` es el id que usa `ponerInsignia` en `src/lib/mac.ts` para poner el número
            TrayIconBuilder::with_id(VENTANA)
                .icon(Image::from_bytes(include_bytes!("../icons/bandeja.png"))?)
                .icon_as_template(true)
                .tooltip("La Joya · Reservaciones")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, evento| match evento.id.as_ref() {
                    "abrir" => mostrar_ventana(app),
                    "nueva" => {
                        mostrar_ventana(app);
                        let _ = app.emit("nueva-reservacion", ());
                    }
                    "salir" => app.exit(0),
                    _ => {}
                })
                .build(handle)?;
            Ok(())
        })
        // Cerrar la ventana solo la esconde: la app sigue viva para avisar de cada solicitud
        .on_window_event(|ventana, evento| {
            if let WindowEvent::CloseRequested { api, .. } = evento {
                if ventana.label() != VENTANA {
                    return;
                }
                api.prevent_close();
                // Esconder una ventana en pantalla completa deja un escritorio negro:
                // en ese caso se oculta toda la app, como ⌘H
                #[cfg(target_os = "macos")]
                if ventana.is_fullscreen().unwrap_or(false) {
                    let _ = ventana.app_handle().hide();
                    return;
                }
                let _ = ventana.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("no se pudo arrancar La Joya");

    app.run(|_app, _evento| {
        // Clic en el ícono del Dock con la ventana escondida: la vuelve a mostrar
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = _evento
        {
            mostrar_ventana(_app);
        }
    });
}
