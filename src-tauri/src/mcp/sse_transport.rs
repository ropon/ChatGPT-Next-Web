// MCP 传输实现：支持 SSE 和 HTTP 两种模式
use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, CONTENT_TYPE};
use reqwest::Url;
use rmcp::model::{CallToolResult, Tool};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, oneshot};

struct SseEvent { event: Option<String>, data: String }

// ============== HTTP 传输（Streamable HTTP）==============
// 简单的 HTTP POST 方式，直接发送请求并获取响应

struct HttpClient {
    endpoint: String,
    http_client: reqwest::Client,
}

impl HttpClient {
    fn new(url: &str, custom_headers: &HashMap<String, String>) -> Result<Self> {
        tracing::debug!("[HTTP] 创建客户端: {}", url);
        tracing::debug!("[HTTP] 自定义 headers: {:?}", custom_headers);
        let mut headers = HeaderMap::new();
        for (key, value) in custom_headers {
            headers.insert(
                HeaderName::from_bytes(key.as_bytes()).map_err(|e| anyhow!("无效 header: {}", e))?,
                HeaderValue::from_str(value).map_err(|e| anyhow!("无效 header 值: {}", e))?
            );
        }
        Ok(Self {
            endpoint: url.to_string(),
            http_client: reqwest::Client::builder().default_headers(headers).build()?,
        })
    }

    async fn send_request(&self, method: &str, params: Option<Value>) -> Result<Value> {
        let id = uuid::Uuid::new_v4().to_string();
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params.clone().unwrap_or(serde_json::json!({}))
        });
        
        tracing::debug!("[HTTP] 发送请求: {} -> {}", method, self.endpoint);
        tracing::debug!("[HTTP] 请求体: {}", serde_json::to_string_pretty(&request).unwrap_or_default());
        
        // Streamable HTTP 要求同时接受 application/json 和 text/event-stream
        let response = self.http_client
            .post(&self.endpoint)
            .header(CONTENT_TYPE, "application/json")
            .header(ACCEPT, "application/json, text/event-stream")
            .json(&request)
            .send()
            .await?;
        
        let status = response.status();
        let content_type = response.headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        tracing::debug!("[HTTP] 响应状态: {}, Content-Type: {}", status, content_type);
        
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            tracing::error!("[HTTP] 请求失败: {} - {}", status, body);
            return Err(anyhow!("HTTP 请求失败: {} - {}", status, body));
        }
        
        // 检查响应类型
        if content_type.contains("text/event-stream") {
            // SSE 流式响应，需要解析事件流
            tracing::debug!("[HTTP] 收到 SSE 流式响应");
            let text = response.text().await?;
            tracing::debug!("[HTTP] SSE 响应内容: {}", text);
            
            // 解析 SSE 事件，提取最后一个 JSON 数据
            let mut last_data: Option<Value> = None;
            for line in text.lines() {
                let line = line.trim();
                if line.starts_with("data:") {
                    let data = line[5..].trim();
                    if let Ok(json) = serde_json::from_str::<Value>(data) {
                        last_data = Some(json);
                    }
                }
            }
            
            last_data.ok_or_else(|| anyhow!("SSE 响应中没有有效数据"))
        } else {
            // JSON 响应
            let text = response.text().await?;
            tracing::debug!("[HTTP] 响应体: {}", text);
            
            serde_json::from_str(&text).map_err(|e| {
                tracing::error!("[HTTP] JSON 解析失败: {} - {}", e, text);
                anyhow!("JSON 解析失败: {} - {}", e, text)
            })
        }
    }
}

// ============== SSE 传输（传统 SSE）==============
// 需要先建立 SSE 连接获取 endpoint，然后通过 POST 发送请求

struct LegacySseClient {
    base_url: String,
    http_client: reqwest::Client,
    message_endpoint: Arc<RwLock<Option<String>>>,
    pending_requests: Arc<RwLock<HashMap<String, oneshot::Sender<Value>>>>,
}

impl LegacySseClient {
    fn new(url: &str, custom_headers: &HashMap<String, String>) -> Result<Self> {
        tracing::debug!("[SSE] 创建客户端: {}", url);
        tracing::debug!("[SSE] 自定义 headers: {:?}", custom_headers);
        let mut headers = HeaderMap::new();
        for (key, value) in custom_headers {
            headers.insert(
                HeaderName::from_bytes(key.as_bytes()).map_err(|e| anyhow!("无效 header: {}", e))?,
                HeaderValue::from_str(value).map_err(|e| anyhow!("无效 header 值: {}", e))?
            );
        }
        Ok(Self {
            base_url: url.to_string(),
            http_client: reqwest::Client::builder().default_headers(headers).build()?,
            message_endpoint: Arc::new(RwLock::new(None)),
            pending_requests: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    async fn connect(&self) -> Result<()> {
        tracing::info!("[SSE] 开始连接: {}", self.base_url);
        let url = self.base_url.clone();
        let client = self.http_client.clone();
        let endpoint = self.message_endpoint.clone();
        let pending = self.pending_requests.clone();
        
        // 尝试自动推断 message endpoint
        // 常见模式: /sse -> /message, /api/sse -> /api/message
        let inferred_endpoint = if url.ends_with("/sse") {
            Some(format!("{}message", &url[..url.len()-3]))
        } else if url.contains("/sse?") {
            Some(url.replace("/sse?", "/message?"))
        } else {
            None
        };
        
        if let Some(ref ep) = inferred_endpoint {
            tracing::info!("[SSE] 推断的 message endpoint: {}", ep);
        }
        
        tokio::spawn(async move { let _ = Self::sse_listener(url, client, endpoint, pending).await; });
        
        // 等待 endpoint 事件，最多 10 秒
        for i in 0..100 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if self.message_endpoint.read().await.is_some() { 
                tracing::info!("[SSE] 连接成功，耗时 {}ms", (i + 1) * 100);
                return Ok(()); 
            }
        }
        
        // 如果没有收到 endpoint 事件，尝试使用推断的 endpoint
        if let Some(ep) = inferred_endpoint {
            tracing::warn!("[SSE] 未收到 endpoint 事件，尝试使用推断的 endpoint: {}", ep);
            *self.message_endpoint.write().await = Some(ep);
            return Ok(());
        }
        
        tracing::error!("[SSE] 等待 endpoint 超时 (10秒)");
        Err(anyhow!("等待 SSE endpoint 超时，服务器可能不支持传统 SSE 模式，请尝试使用 HTTP 模式"))
    }

    async fn sse_listener(url: String, client: reqwest::Client, message_endpoint: Arc<RwLock<Option<String>>>, pending_requests: Arc<RwLock<HashMap<String, oneshot::Sender<Value>>>>) -> Result<()> {
        tracing::debug!("[SSE] 建立 SSE 连接: {}", url);
        let response = client.get(&url).header(ACCEPT, "text/event-stream").send().await?;
        let status = response.status();
        tracing::debug!("[SSE] 连接响应状态: {}", status);
        
        if !status.is_success() { 
            tracing::error!("[SSE] 连接失败: {}", status);
            return Err(anyhow!("SSE 连接失败: {}", status)); 
        }
        
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut current_event: Option<String> = None;
        let mut current_data = String::new();
        let base_url = Url::parse(&url)?;

        tracing::debug!("[SSE] 开始监听事件流...");
        while let Some(chunk) = stream.next().await {
            let chunk_data = chunk?;
            let chunk_str = String::from_utf8_lossy(&chunk_data);
            tracing::trace!("[SSE] 收到数据块: {}", chunk_str);
            buffer.push_str(&chunk_str);
            
            // 处理单个换行符分隔的事件（某些服务器使用 \n 而不是 \n\n）
            while buffer.contains('\n') {
                // 优先查找 \n\n 分隔符
                let pos = if let Some(p) = buffer.find("\n\n") {
                    p
                } else if let Some(p) = buffer.find('\n') {
                    // 检查是否是完整的事件行
                    let line = &buffer[..p];
                    if line.starts_with("event:") || line.starts_with("data:") || line.starts_with(":") {
                        p
                    } else {
                        break;
                    }
                } else {
                    break;
                };
                
                let event_str = buffer[..pos].to_string();
                let skip = if buffer[pos..].starts_with("\n\n") { 2 } else { 1 };
                buffer = buffer[pos + skip..].to_string();
                
                if event_str.trim().is_empty() || event_str.starts_with(":") {
                    continue;
                }
                
                tracing::debug!("[SSE] 解析事件: {}", event_str);
                
                for line in event_str.lines() {
                    let line = line.trim();
                    if line.starts_with("event:") { 
                        current_event = Some(line[6..].trim().to_string()); 
                        tracing::debug!("[SSE] 事件类型: {:?}", current_event);
                    }
                    else if line.starts_with("data:") { 
                        if !current_data.is_empty() { current_data.push('\n'); } 
                        current_data.push_str(line[5..].trim()); 
                    }
                }
                
                if !current_data.is_empty() {
                    let event = SseEvent { event: current_event.take(), data: std::mem::take(&mut current_data) };
                    tracing::debug!("[SSE] 处理事件: type={:?}, data={}", event.event, event.data);
                    
                    match event.event.as_deref() {
                        Some("endpoint") => {
                            let path = event.data.trim();
                            let full = base_url.join(path).map(|u| u.to_string()).unwrap_or_else(|_| format!("{}{}", url.trim_end_matches("/sse").trim_end_matches('/'), path));
                            tracing::info!("[SSE] 获取到 message endpoint: {}", full);
                            *message_endpoint.write().await = Some(full);
                        }
                        Some("message") | None => {
                            tracing::debug!("[SSE] 收到消息: {}", event.data);
                            
                            // 尝试从消息中提取 endpoint（某些服务器在第一个消息中返回）
                            if message_endpoint.read().await.is_none() {
                                // 检查是否是 endpoint 路径格式
                                let data = event.data.trim();
                                if data.starts_with("/") && !data.contains("{") {
                                    let full = base_url.join(data).map(|u| u.to_string()).unwrap_or_else(|_| format!("{}{}", url.trim_end_matches("/sse").trim_end_matches('/'), data));
                                    tracing::info!("[SSE] 从消息中提取 endpoint: {}", full);
                                    *message_endpoint.write().await = Some(full);
                                    continue;
                                }
                            }
                            
                            if let Ok(msg) = serde_json::from_str::<Value>(&event.data) {
                                if let Some(id) = msg.get("id").and_then(|v| v.as_str().map(|s| s.to_string()).or_else(|| v.as_i64().map(|n| n.to_string()))) {
                                    tracing::debug!("[SSE] 匹配请求 ID: {}", id);
                                    if let Some(sender) = pending_requests.write().await.remove(&id) { let _ = sender.send(msg); }
                                }
                            }
                        }
                        _ => {
                            tracing::debug!("[SSE] 忽略未知事件类型: {:?}", event.event);
                        }
                    }
                }
                current_event = None;
            }
        }
        tracing::warn!("[SSE] 事件流已关闭");
        Ok(())
    }

    async fn send_request(&self, method: &str, params: Option<Value>) -> Result<Value> {
        let endpoint = self.message_endpoint.read().await.clone().ok_or_else(|| anyhow!("endpoint 未初始化"))?;
        let id = uuid::Uuid::new_v4().to_string();
        let request = serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params.clone().unwrap_or(serde_json::json!({})) });
        
        tracing::debug!("[SSE] 发送请求: {} -> {}", method, endpoint);
        tracing::debug!("[SSE] 请求体: {}", serde_json::to_string_pretty(&request).unwrap_or_default());
        
        let (tx, rx) = oneshot::channel();
        self.pending_requests.write().await.insert(id.clone(), tx);
        
        let response = self.http_client.post(&endpoint).header(CONTENT_TYPE, "application/json").json(&request).send().await?;
        let status = response.status();
        tracing::debug!("[SSE] POST 响应状态: {}", status);
        
        if !status.is_success() { 
            self.pending_requests.write().await.remove(&id); 
            let body = response.text().await.unwrap_or_default();
            tracing::error!("[SSE] 请求失败: {} - {}", status, body);
            return Err(anyhow!("请求失败: {} - {}", status, body)); 
        }
        
        // 检查是否直接返回 JSON 响应
        if response.headers().get(CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").contains("application/json") {
            self.pending_requests.write().await.remove(&id);
            let text = response.text().await?;
            tracing::debug!("[SSE] 直接响应: {}", text);
            return Ok(serde_json::from_str(&text)?);
        }
        
        tracing::debug!("[SSE] 等待 SSE 响应...");
        tokio::time::timeout(tokio::time::Duration::from_secs(30), rx).await.map_err(|_| {
            tracing::error!("[SSE] 等待响应超时 (30秒)");
            anyhow!("超时")
        })?.map_err(|_| anyhow!("通道关闭"))
    }
}

// ============== 统一的客户端包装器 ==============

enum TransportClient {
    Sse(LegacySseClient),
    Http(HttpClient),
}

impl TransportClient {
    async fn send_request(&self, method: &str, params: Option<Value>) -> Result<Value> {
        match self {
            TransportClient::Sse(client) => client.send_request(method, params).await,
            TransportClient::Http(client) => client.send_request(method, params).await,
        }
    }
}

/// 连接 SSE 服务器（传统 SSE 模式，需要 endpoint 事件）
pub async fn connect_legacy_sse(id: &str, url: &str, headers: &HashMap<String, String>) -> Result<(LegacySseClientWrapper, Vec<Tool>)> {
    tracing::info!("[MCP] 连接 SSE 服务器 [{}]: {}", id, url);
    let client = LegacySseClient::new(url, headers)?;
    client.connect().await?;
    let wrapper = LegacySseClientWrapper { client: Arc::new(TransportClient::Sse(client)) };
    tracing::debug!("[MCP] 开始初始化...");
    wrapper.initialize().await?;
    tracing::debug!("[MCP] 获取工具列表...");
    let tools = wrapper.list_tools().await?;
    tracing::info!("[MCP] SSE 服务器 [{}] 连接成功，获取到 {} 个工具", id, tools.len());
    Ok((wrapper, tools))
}

/// 连接 HTTP 服务器（Streamable HTTP 模式，直接 POST）
pub async fn connect_http(id: &str, url: &str, headers: &HashMap<String, String>) -> Result<(LegacySseClientWrapper, Vec<Tool>)> {
    tracing::info!("[MCP] 连接 HTTP 服务器 [{}]: {}", id, url);
    let client = HttpClient::new(url, headers)?;
    let wrapper = LegacySseClientWrapper { client: Arc::new(TransportClient::Http(client)) };
    tracing::debug!("[MCP] 开始初始化...");
    wrapper.initialize().await?;
    tracing::debug!("[MCP] 获取工具列表...");
    let tools = wrapper.list_tools().await?;
    tracing::info!("[MCP] HTTP 服务器 [{}] 连接成功，获取到 {} 个工具", id, tools.len());
    Ok((wrapper, tools))
}

#[derive(Clone)]
pub struct LegacySseClientWrapper { client: Arc<TransportClient> }

impl LegacySseClientWrapper {
    async fn initialize(&self) -> Result<Value> {
        let params = serde_json::json!({ "protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": { "name": "nextchat", "version": "1.0.0" } });
        tracing::debug!("[MCP] 发送 initialize 请求");
        let resp = self.client.send_request("initialize", Some(params)).await?;
        if let Some(err) = resp.get("error") { 
            tracing::error!("[MCP] 初始化失败: {:?}", err);
            return Err(anyhow!("初始化失败: {:?}", err)); 
        }
        tracing::debug!("[MCP] 初始化响应: {}", serde_json::to_string_pretty(&resp).unwrap_or_default());
        let _ = self.client.send_request("notifications/initialized", None).await;
        resp.get("result").cloned().ok_or_else(|| anyhow!("无效响应"))
    }

    async fn list_tools(&self) -> Result<Vec<Tool>> {
        tracing::debug!("[MCP] 发送 tools/list 请求");
        let resp = self.client.send_request("tools/list", None).await?;
        if let Some(err) = resp.get("error") { 
            tracing::error!("[MCP] 获取工具失败: {:?}", err);
            return Err(anyhow!("获取工具失败: {:?}", err)); 
        }
        tracing::debug!("[MCP] tools/list 响应: {}", serde_json::to_string_pretty(&resp).unwrap_or_default());
        let tools = resp.get("result").and_then(|r| r.get("tools")).ok_or_else(|| anyhow!("无效响应"))?;
        serde_json::from_value(tools.clone()).map_err(|e| anyhow!("解析失败: {}", e))
    }

    pub async fn call_tool(&self, name: String, args: Option<serde_json::Map<String, Value>>) -> Result<CallToolResult> {
        let params = serde_json::json!({ "name": name, "arguments": args.clone().unwrap_or_default() });
        tracing::info!("[MCP] 调用工具: {}", name);
        tracing::debug!("[MCP] 工具参数: {:?}", args);
        let resp = self.client.send_request("tools/call", Some(params)).await?;
        if let Some(err) = resp.get("error") { 
            tracing::error!("[MCP] 工具调用失败: {:?}", err);
            return Err(anyhow!("调用失败: {:?}", err)); 
        }
        tracing::debug!("[MCP] 工具响应: {}", serde_json::to_string_pretty(&resp).unwrap_or_default());
        let result = resp.get("result").ok_or_else(|| anyhow!("无效响应"))?;
        serde_json::from_value(result.clone()).map_err(|e| anyhow!("解析失败: {}", e))
    }
}
