// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mcp;
mod stream;

use mcp::McpManager;

fn main() {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    tauri::Builder::default()
        .manage(McpManager::new())
        .invoke_handler(tauri::generate_handler![
            // 流式请求
            stream::stream_fetch,
            // MCP 相关命令
            mcp::mcp_init,
            mcp::mcp_get_config_path,
            mcp::mcp_get_config,
            mcp::mcp_add_server,
            mcp::mcp_remove_server,
            mcp::mcp_pause_server,
            mcp::mcp_resume_server,
            mcp::mcp_get_statuses,
            mcp::mcp_get_tools,
            mcp::mcp_get_all_tools,
            mcp::mcp_call_tool,
            mcp::mcp_restart_all,
            mcp::mcp_is_enabled,
            mcp::mcp_import_config,
            mcp::mcp_export_config,
            // 运行时配置
            mcp::mcp_get_runtime,
            mcp::mcp_set_runtime,
            mcp::mcp_detect_paths,
        ])
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出错");
}
