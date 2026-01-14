// MCP (Model Context Protocol) 原生实现
// 使用 rmcp SDK 实现真正的 MCP Client

use anyhow::{anyhow, Result};
use rmcp::{
    model::{CallToolRequestParam, Tool},
    service::{RunningService, RoleClient, ServiceExt},
    transport::{ConfigureCommandExt, TokioChildProcess},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::process::Command;
use tokio::sync::RwLock;

/// MCP 服务器配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerConfig {
    pub command: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default = "default_status")]
    pub status: String,
}

fn default_status() -> String {
    "active".to_string()
}

/// MCP 配置文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigData {
    #[serde(default)]
    pub mcp_servers: HashMap<String, ServerConfig>,
    /// 运行时环境配置
    #[serde(default)]
    pub runtime: RuntimeConfig,
}

/// 运行时环境配置
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfig {
    /// Node.js 可执行文件路径 (用于 npx)
    #[serde(default)]
    pub node_path: Option<String>,
    /// npx 可执行文件路径
    #[serde(default)]
    pub npx_path: Option<String>,
    /// Python uv/uvx 可执行文件路径
    #[serde(default)]
    pub uvx_path: Option<String>,
    /// 额外的 PATH 路径（用 : 分隔）
    #[serde(default)]
    pub extra_path: Option<String>,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            node_path: None,
            npx_path: None,
            uvx_path: None,
            extra_path: None,
        }
    }
}

/// MCP 服务器状态
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerStatus {
    pub status: String,
    #[serde(rename = "errorMsg")]
    pub error_msg: Option<String>,
}

/// 工具信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolInfo {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "inputSchema", default)]
    pub input_schema: Option<Value>,
}

/// 工具列表响应
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ListToolsResponse {
    pub tools: Vec<ToolInfo>,
}

/// 工具调用请求
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpToolRequest {
    pub method: String,
    pub params: Option<Value>,
}

/// 工具调用响应
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpToolResponse {
    #[serde(default)]
    pub result: Option<Value>,
    #[serde(default)]
    pub error: Option<String>,
}

/// 活跃的 MCP 客户端连接
struct ActiveClient {
    service: RunningService<RoleClient, ()>,
    tools: Vec<Tool>,
}

/// MCP 管理器
pub struct McpManager {
    clients: Arc<RwLock<HashMap<String, ActiveClient>>>,
    statuses: Arc<RwLock<HashMap<String, ServerStatus>>>,
    config: Arc<RwLock<McpConfigData>>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            statuses: Arc::new(RwLock::new(HashMap::new())),
            config: Arc::new(RwLock::new(McpConfigData::default())),
        }
    }

    /// 获取默认配置文件路径
    fn get_config_path() -> PathBuf {
        if let Some(config_dir) = dirs::config_dir() {
            config_dir.join("NextChat").join("mcp_config.json")
        } else {
            PathBuf::from("mcp_config.json")
        }
    }
}

/// 初始化 MCP 系统，加载配置文件
#[tauri::command]
pub async fn mcp_init(state: State<'_, McpManager>) -> Result<McpConfigData, String> {
    let config_path = McpManager::get_config_path();

    // 确保配置目录存在
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // 读取或创建配置文件
    let config: McpConfigData = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        let default_config = McpConfigData::default();
        let content = serde_json::to_string_pretty(&default_config).map_err(|e| e.to_string())?;
        std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
        default_config
    };

    // 保存配置
    {
        let mut cfg = state.config.write().await;
        *cfg = config.clone();
    }

    // 自动连接状态为 active 的服务器
    for (id, server_config) in &config.mcp_servers {
        if server_config.status == "active" {
            let _ = connect_to_server_with_runtime(&state, id.clone(), server_config.clone(), &config.runtime).await;
        } else {
            let mut statuses = state.statuses.write().await;
            statuses.insert(
                id.clone(),
                ServerStatus {
                    status: server_config.status.clone(),
                    error_msg: None,
                },
            );
        }
    }

    Ok(config)
}

/// 获取扩展的 PATH 环境变量
fn get_extended_path(runtime: &RuntimeConfig) -> String {
    let path_env = std::env::var("PATH").unwrap_or_default();
    
    let mut all_paths: Vec<String> = Vec::new();
    
    // 优先添加用户配置的额外路径
    if let Some(extra) = &runtime.extra_path {
        all_paths.extend(extra.split(':').filter(|s| !s.is_empty()).map(|s| s.to_string()));
    }
    
    // 如果配置了特定路径，添加其所在目录
    if let Some(npx) = &runtime.npx_path {
        if let Some(parent) = std::path::Path::new(npx).parent() {
            all_paths.push(parent.to_string_lossy().to_string());
        }
    }
    if let Some(node) = &runtime.node_path {
        if let Some(parent) = std::path::Path::new(node).parent() {
            all_paths.push(parent.to_string_lossy().to_string());
        }
    }
    if let Some(uvx) = &runtime.uvx_path {
        if let Some(parent) = std::path::Path::new(uvx).parent() {
            all_paths.push(parent.to_string_lossy().to_string());
        }
    }
    
    // 添加系统 PATH
    all_paths.extend(path_env.split(':').filter(|s| !s.is_empty()).map(|s| s.to_string()));
    
    // 去重并保持顺序
    let mut seen = std::collections::HashSet::new();
    all_paths.retain(|p| seen.insert(p.clone()));
    
    all_paths.join(":")
}

/// 查找可执行文件的完整路径
fn find_executable(command: &str, runtime: &RuntimeConfig) -> String {
    // 如果已经是绝对路径，直接返回
    if command.starts_with('/') {
        return command.to_string();
    }
    
    // 检查是否有用户配置的特定路径
    match command {
        "npx" => {
            if let Some(path) = &runtime.npx_path {
                if std::path::Path::new(path).exists() {
                    tracing::info!("使用配置的 npx 路径: {}", path);
                    return path.clone();
                }
            }
        }
        "node" => {
            if let Some(path) = &runtime.node_path {
                if std::path::Path::new(path).exists() {
                    tracing::info!("使用配置的 node 路径: {}", path);
                    return path.clone();
                }
            }
        }
        "uvx" | "uv" => {
            if let Some(path) = &runtime.uvx_path {
                if std::path::Path::new(path).exists() {
                    tracing::info!("使用配置的 uvx 路径: {}", path);
                    return path.clone();
                }
            }
        }
        _ => {}
    }
    
    // 没有配置则返回原命令，依赖 PATH 环境变量
    command.to_string()
}

/// 连接到 MCP 服务器（带运行时配置）
async fn connect_to_server_with_runtime(
    state: &State<'_, McpManager>,
    id: String,
    config: ServerConfig,
    runtime: &RuntimeConfig,
) -> Result<(), String> {
    // 更新状态为初始化中
    {
        let mut statuses = state.statuses.write().await;
        statuses.insert(
            id.clone(),
            ServerStatus {
                status: "initializing".to_string(),
                error_msg: None,
            },
        );
    }

    // 构建命令 - 查找可执行文件的完整路径
    let command = find_executable(&config.command, runtime);
    let args = config.args.clone();
    let env = config.env.clone();
    let runtime_clone = runtime.clone();

    tracing::info!("连接 MCP 服务器 [{}]: {} {:?}", id, command, args);

    // 使用 rmcp SDK 连接
    let result = async {
        let mut cmd = Command::new(&command);
        
        // 设置扩展的 PATH 环境变量
        let extended_path = get_extended_path(&runtime_clone);
        cmd.env("PATH", extended_path);
        
        // 设置 HOME 环境变量（某些工具需要）
        if let Ok(home) = std::env::var("HOME") {
            cmd.env("HOME", home);
        }
        
        // 设置 USER 环境变量
        if let Ok(user) = std::env::var("USER") {
            cmd.env("USER", user);
        }
        
        // 添加用户自定义环境变量
        for (key, value) in env {
            cmd.env(key, value);
        }

        let transport = TokioChildProcess::new(cmd.configure(|c| {
            for arg in &args {
                c.arg(arg);
            }
        }))
        .map_err(|e| anyhow!("创建传输失败: {}", e))?;

        let service = ().serve(transport).await.map_err(|e| anyhow!("连接服务器失败: {}", e))?;

        // 获取工具列表
        let tools_result = service.list_tools(Default::default()).await.map_err(|e| anyhow!("获取工具列表失败: {}", e))?;

        Ok::<(RunningService<RoleClient, ()>, Vec<Tool>), anyhow::Error>((service, tools_result.tools))
    }
    .await;

    match result {
        Ok((service, tools)) => {
            // 保存客户端连接
            {
                let mut clients = state.clients.write().await;
                clients.insert(id.clone(), ActiveClient { service, tools });
            }
            // 更新状态为活跃
            {
                let mut statuses = state.statuses.write().await;
                statuses.insert(
                    id.clone(),
                    ServerStatus {
                        status: "active".to_string(),
                        error_msg: None,
                    },
                );
            }
            Ok(())
        }
        Err(e) => {
            // 更新状态为错误
            let error_msg = e.to_string();
            {
                let mut statuses = state.statuses.write().await;
                statuses.insert(
                    id.clone(),
                    ServerStatus {
                        status: "error".to_string(),
                        error_msg: Some(error_msg.clone()),
                    },
                );
            }
            Err(error_msg)
        }
    }
}

/// 连接到 MCP 服务器（使用默认运行时配置）
async fn connect_to_server(
    state: &State<'_, McpManager>,
    id: String,
    config: ServerConfig,
) -> Result<(), String> {
    let runtime = state.config.read().await.runtime.clone();
    connect_to_server_with_runtime(state, id, config, &runtime).await
}

/// 获取配置文件路径
#[tauri::command]
pub async fn mcp_get_config_path() -> Result<String, String> {
    let path = McpManager::get_config_path();
    Ok(path.to_string_lossy().to_string())
}

/// 获取当前配置
#[tauri::command]
pub async fn mcp_get_config(state: State<'_, McpManager>) -> Result<McpConfigData, String> {
    let config = state.config.read().await;
    Ok(config.clone())
}

/// 保存配置到文件
async fn save_config(state: &State<'_, McpManager>) -> Result<(), String> {
    let config = state.config.read().await;
    let config_path = McpManager::get_config_path();

    // 确保配置目录存在
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&*config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// 添加或更新 MCP 服务器
#[tauri::command]
pub async fn mcp_add_server(
    state: State<'_, McpManager>,
    id: String,
    config: ServerConfig,
) -> Result<McpConfigData, String> {
    // 保存到配置
    {
        let mut cfg = state.config.write().await;
        cfg.mcp_servers.insert(id.clone(), config.clone());
    }
    save_config(&state).await?;

    // 如果状态是 active，则连接
    if config.status == "active" {
        let _ = connect_to_server(&state, id, config).await;
    }

    let cfg = state.config.read().await;
    Ok(cfg.clone())
}

/// 移除 MCP 服务器
#[tauri::command]
pub async fn mcp_remove_server(
    state: State<'_, McpManager>,
    id: String,
) -> Result<McpConfigData, String> {
    // 断开连接 - 直接移除即可，drop 会自动关闭
    {
        let mut clients = state.clients.write().await;
        clients.remove(&id);
    }

    // 从配置中移除
    {
        let mut cfg = state.config.write().await;
        cfg.mcp_servers.remove(&id);
    }
    save_config(&state).await?;

    // 移除状态
    {
        let mut statuses = state.statuses.write().await;
        statuses.remove(&id);
    }

    let cfg = state.config.read().await;
    Ok(cfg.clone())
}

/// 暂停 MCP 服务器
#[tauri::command]
pub async fn mcp_pause_server(
    state: State<'_, McpManager>,
    id: String,
) -> Result<McpConfigData, String> {
    // 断开连接 - 直接移除即可，drop 会自动关闭
    {
        let mut clients = state.clients.write().await;
        clients.remove(&id);
    }

    // 更新配置状态
    {
        let mut cfg = state.config.write().await;
        if let Some(server) = cfg.mcp_servers.get_mut(&id) {
            server.status = "paused".to_string();
        }
    }
    save_config(&state).await?;

    // 更新运行时状态
    {
        let mut statuses = state.statuses.write().await;
        statuses.insert(
            id,
            ServerStatus {
                status: "paused".to_string(),
                error_msg: None,
            },
        );
    }

    let cfg = state.config.read().await;
    Ok(cfg.clone())
}

/// 恢复 MCP 服务器
#[tauri::command]
pub async fn mcp_resume_server(
    state: State<'_, McpManager>,
    id: String,
) -> Result<McpConfigData, String> {
    let config = {
        let mut cfg = state.config.write().await;
        if let Some(server) = cfg.mcp_servers.get_mut(&id) {
            server.status = "active".to_string();
            Some(server.clone())
        } else {
            None
        }
    };

    if let Some(server_config) = config {
        save_config(&state).await?;
        connect_to_server(&state, id, server_config).await?;
    }

    let cfg = state.config.read().await;
    Ok(cfg.clone())
}

/// 获取所有服务器状态
#[tauri::command]
pub async fn mcp_get_statuses(
    state: State<'_, McpManager>,
) -> Result<HashMap<String, ServerStatus>, String> {
    let statuses = state.statuses.read().await;
    Ok(statuses.clone())
}

/// 获取服务器的工具列表
#[tauri::command]
pub async fn mcp_get_tools(
    state: State<'_, McpManager>,
    id: String,
) -> Result<ListToolsResponse, String> {
    let clients = state.clients.read().await;
    if let Some(client) = clients.get(&id) {
        let tools: Vec<ToolInfo> = client
            .tools
            .iter()
            .map(|t| ToolInfo {
                name: t.name.to_string(),
                description: t.description.as_ref().map(|s| s.to_string()),
                input_schema: Some(serde_json::to_value(&t.input_schema).unwrap_or(Value::Null)),
            })
            .collect();
        Ok(ListToolsResponse { tools })
    } else {
        Ok(ListToolsResponse { tools: vec![] })
    }
}

/// 获取所有活跃服务器的工具列表
#[tauri::command]
pub async fn mcp_get_all_tools(
    state: State<'_, McpManager>,
) -> Result<Vec<(String, ListToolsResponse)>, String> {
    let clients = state.clients.read().await;
    let mut result = Vec::new();

    for (id, client) in clients.iter() {
        let tools: Vec<ToolInfo> = client
            .tools
            .iter()
            .map(|t| ToolInfo {
                name: t.name.to_string(),
                description: t.description.as_ref().map(|s| s.to_string()),
                input_schema: Some(serde_json::to_value(&t.input_schema).unwrap_or(Value::Null)),
            })
            .collect();
        result.push((id.clone(), ListToolsResponse { tools }));
    }

    Ok(result)
}

/// 调用工具
#[tauri::command]
pub async fn mcp_call_tool(
    state: State<'_, McpManager>,
    id: String,
    tool_name: String,
    arguments: Option<Value>,
) -> Result<McpToolResponse, String> {
    let clients = state.clients.read().await;

    if let Some(client) = clients.get(&id) {
        let result = client
            .service
            .call_tool(CallToolRequestParam {
                name: tool_name.into(),
                arguments: arguments.as_ref().and_then(|v| v.as_object().cloned()),
                task: None,
            })
            .await;

        match result {
            Ok(tool_result) => {
                // 将结果转换为 JSON
                let result_value = serde_json::to_value(&tool_result).ok();
                Ok(McpToolResponse {
                    result: result_value,
                    error: None,
                })
            }
            Err(e) => Ok(McpToolResponse {
                result: None,
                error: Some(e.to_string()),
            }),
        }
    } else {
        Err(format!("服务器 {} 未连接", id))
    }
}

/// 重启所有服务器
#[tauri::command]
pub async fn mcp_restart_all(state: State<'_, McpManager>) -> Result<McpConfigData, String> {
    // 断开所有连接 - 直接清空即可，drop 会自动关闭
    {
        let mut clients = state.clients.write().await;
        clients.clear();
    }

    // 清空状态
    {
        let mut statuses = state.statuses.write().await;
        statuses.clear();
    }

    // 重新连接所有 active 服务器
    let config = state.config.read().await.clone();
    for (id, server_config) in &config.mcp_servers {
        if server_config.status == "active" {
            let _ = connect_to_server(&state, id.clone(), server_config.clone()).await;
        }
    }

    Ok(config)
}

/// 检查 MCP 是否可用
#[tauri::command]
pub async fn mcp_is_enabled() -> Result<bool, String> {
    Ok(true)
}

/// 导入配置文件
#[tauri::command]
pub async fn mcp_import_config(
    state: State<'_, McpManager>,
    config_content: String,
) -> Result<McpConfigData, String> {
    // 解析配置
    let new_config: McpConfigData =
        serde_json::from_str(&config_content).map_err(|e| format!("配置解析失败: {}", e))?;

    // 断开所有现有连接 - 直接清空即可，drop 会自动关闭
    {
        let mut clients = state.clients.write().await;
        clients.clear();
    }

    // 更新配置
    {
        let mut cfg = state.config.write().await;
        *cfg = new_config.clone();
    }
    save_config(&state).await?;

    // 连接 active 服务器
    for (id, server_config) in &new_config.mcp_servers {
        if server_config.status == "active" {
            let _ = connect_to_server(&state, id.clone(), server_config.clone()).await;
        }
    }

    Ok(new_config)
}

/// 导出配置文件
#[tauri::command]
pub async fn mcp_export_config(state: State<'_, McpManager>) -> Result<String, String> {
    let config = state.config.read().await;
    serde_json::to_string_pretty(&*config).map_err(|e| e.to_string())
}

/// 获取运行时配置
#[tauri::command]
pub async fn mcp_get_runtime(state: State<'_, McpManager>) -> Result<RuntimeConfig, String> {
    let config = state.config.read().await;
    Ok(config.runtime.clone())
}

/// 更新运行时配置
#[tauri::command]
pub async fn mcp_set_runtime(
    state: State<'_, McpManager>,
    runtime: RuntimeConfig,
) -> Result<RuntimeConfig, String> {
    {
        let mut cfg = state.config.write().await;
        cfg.runtime = runtime.clone();
    }
    save_config(&state).await?;
    Ok(runtime)
}

/// 自动检测可执行文件路径
#[tauri::command]
pub async fn mcp_detect_paths() -> Result<RuntimeConfig, String> {
    let mut detected = RuntimeConfig::default();
    
    // 使用 which 命令检测可执行文件路径
    async fn detect_command(cmd: &str) -> Option<String> {
        let output = Command::new("which")
            .arg(cmd)
            .output()
            .await
            .ok()?;
        
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
        None
    }
    
    // 检测 npx
    if let Some(path) = detect_command("npx").await {
        detected.npx_path = Some(path);
    }
    
    // 检测 node
    if let Some(path) = detect_command("node").await {
        detected.node_path = Some(path);
    }
    
    // 检测 uvx
    if let Some(path) = detect_command("uvx").await {
        detected.uvx_path = Some(path);
    }
    
    Ok(detected)
}
