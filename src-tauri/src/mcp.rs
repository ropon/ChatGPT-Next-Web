
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerConfig {
    pub command: String,
    pub args: Vec<String>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: Option<Value>,
    pub id: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpResponse {
    pub jsonrpc: String,
    pub result: Option<Value>,
    pub error: Option<Value>,
    pub id: Option<Value>,
}

struct McpServer {
    request_tx: mpsc::Sender<String>,
    pending_requests: Arc<Mutex<HashMap<String, oneshot::Sender<McpResponse>>>>,
}

pub struct McpManager {
    servers: Arc<Mutex<HashMap<String, McpServer>>>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn mcp_connect(
    state: State<'_, McpManager>,
    id: String,
    config: ServerConfig,
) -> Result<String, String> {
    let mut cmd = Command::new(&config.command);
    cmd.args(&config.args);
    if let Some(env) = config.env {
        cmd.envs(env);
    }
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::inherit());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;

    let (tx, mut rx) = mpsc::channel::<String>(32);
    let pending_requests = Arc::new(Mutex::new(HashMap::new()));
    let pending_requests_clone = pending_requests.clone();

    // Stdin writer task
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let _ = stdin.write_all(msg.as_bytes()).await;
            let _ = stdin.write_all(b"\n").await;
            let _ = stdin.flush().await;
        }
    });

    // Stdout reader task
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(response) = serde_json::from_str::<McpResponse>(&line) {
                if let Some(id_val) = &response.id {
                    let id_str = match id_val {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        _ => continue,
                    };
                    
                    let mut pending = pending_requests_clone.lock().unwrap();
                    if let Some(sender) = pending.remove(&id_str) {
                        let _ = sender.send(response);
                    }
                }
            } else {
                // Try parsing as notification or log? For now ignore.
                // In a full implementation we should handle notifications.
                println!("MCP Client [{}] received: {}", "unknown", line);
            }
        }
    });

    let server = McpServer {
        request_tx: tx,
        pending_requests,
    };
    
    state.servers.lock().unwrap().insert(id.clone(), server);
    
    Ok(format!("Connected to {}", id))
}

#[tauri::command]
pub async fn mcp_send_request(
    state: State<'_, McpManager>,
    id: String,
    request: McpRequest,
) -> Result<McpResponse, String> {
    let servers = state.servers.lock().unwrap();
    let server = servers.get(&id).ok_or("Server not found")?;

    let req_id = match &request.id {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => return Err("Request ID must be string or number".to_string()),
    };

    let (resp_tx, resp_rx) = oneshot::channel();
    
    server.pending_requests.lock().unwrap().insert(req_id, resp_tx);

    let req_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    
    server.request_tx.send(req_str).await.map_err(|e| e.to_string())?;

    let response = resp_rx.await.map_err(|_| "Request timed out or channel closed".to_string())?;
    
    Ok(response)
}

#[tauri::command]
pub async fn mcp_disconnect(state: State<'_, McpManager>, id: String) -> Result<(), String> {
    let mut servers = state.servers.lock().unwrap();
    if servers.remove(&id).is_some() {
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}
