// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod stream;
mod mcp;

use mcp::McpManager;

fn main() {
  tauri::Builder::default()
    .manage(McpManager::new())
    .invoke_handler(tauri::generate_handler![
      stream::stream_fetch, 
      mcp::mcp_connect, 
      mcp::mcp_disconnect, 
      mcp::mcp_send_request
    ])
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
