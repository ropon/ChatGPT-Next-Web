// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mcp;
mod stream;

use mcp::McpManager;
use std::sync::{Arc, Mutex};
use std::collections::VecDeque;
use once_cell::sync::Lazy;
use chrono::Local;

// 全局日志缓冲区
static LOG_BUFFER: Lazy<Arc<Mutex<VecDeque<String>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(VecDeque::with_capacity(500)))
});

const MAX_LOG_LINES: usize = 500;

// 自定义日志层，用于收集日志到缓冲区
struct LogCollector;

impl<S> tracing_subscriber::Layer<S> for LogCollector
where
    S: tracing::Subscriber,
{
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let mut visitor = LogVisitor::default();
        event.record(&mut visitor);
        
        let level = event.metadata().level();
        let target = event.metadata().target();
        let timestamp = Local::now().format("%H:%M:%S%.3f");
        
        let log_line = format!("[{}] {} {} - {}", timestamp, level, target, visitor.message);
        
        if let Ok(mut buffer) = LOG_BUFFER.lock() {
            if buffer.len() >= MAX_LOG_LINES {
                buffer.pop_front();
            }
            buffer.push_back(log_line);
        }
    }
}

#[derive(Default)]
struct LogVisitor {
    message: String,
}

impl tracing::field::Visit for LogVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.message = format!("{:?}", value);
        } else if self.message.is_empty() {
            self.message = format!("{:?}", value);
        }
    }
    
    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "message" {
            self.message = value.to_string();
        } else if self.message.is_empty() {
            self.message = value.to_string();
        }
    }
}

/// 获取 MCP 日志
#[tauri::command]
fn mcp_get_logs(lines: Option<usize>) -> Vec<String> {
    let limit = lines.unwrap_or(100);
    if let Ok(buffer) = LOG_BUFFER.lock() {
        buffer.iter().rev().take(limit).cloned().collect::<Vec<_>>().into_iter().rev().collect()
    } else {
        vec![]
    }
}

/// 清空日志
#[tauri::command]
fn mcp_clear_logs() {
    if let Ok(mut buffer) = LOG_BUFFER.lock() {
        buffer.clear();
    }
}

fn main() {
    use tracing_subscriber::prelude::*;
    
    // 初始化日志 - 同时输出到控制台和收集到缓冲区
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_level(true);
    
    let filter = tracing_subscriber::EnvFilter::from_default_env()
        .add_directive("nextchat=debug".parse().unwrap())
        .add_directive(tracing::Level::INFO.into());
    
    tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .with(LogCollector)
        .init();

    tracing::info!("NextChat 启动中...");

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
            // 日志
            mcp_get_logs,
            mcp_clear_logs,
        ])
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出错");
}
