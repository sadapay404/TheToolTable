use tauri::Manager;
use tauri_plugin_background_service::{
    BackgroundService, ServiceContext, ServiceError,
};

struct TransferKeepalive;

#[async_trait::async_trait]
impl<R: tauri::Runtime> BackgroundService<R> for TransferKeepalive {
    async fn init(&mut self, _ctx: &ServiceContext<R>) -> Result<(), ServiceError> {
        Ok(())
    }

    async fn run(&mut self, ctx: &ServiceContext<R>) -> Result<(), ServiceError> {
        ctx.shutdown.cancelled().await;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_background_service::init_with_service(|| TransferKeepalive))
        .plugin(
            tauri_plugin_download::Builder::new()
                .on_setup(|app, config| {
                    let data_dir = app.path().app_data_dir()?;
                    let cache_dir = app.path().app_cache_dir()?;
                    config.store_dir(data_dir.join("download-store"));
                    config.download_dirs([
                        data_dir.join("downloads"),
                        cache_dir.join("TheToolTable").join("models"),
                    ]);
                    Ok(())
                })
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running TheToolTable");
}
