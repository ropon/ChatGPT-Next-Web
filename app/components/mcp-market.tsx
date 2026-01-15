import { IconButton } from "./button";
import { ErrorBoundary } from "./error";
import styles from "./mcp-market.module.scss";
import EditIcon from "../icons/edit.svg";
import AddIcon from "../icons/add.svg";
import CloseIcon from "../icons/close.svg";
import DeleteIcon from "../icons/delete.svg";
import RestartIcon from "../icons/reload.svg";
import EyeIcon from "../icons/eye.svg";
import GithubIcon from "../icons/github.svg";
import SettingsIcon from "../icons/settings.svg";
import LogIcon from "../icons/copy.svg";
import { List, ListItem, Modal, showToast } from "./ui-lib";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import {
  addMcpServer,
  getClientsStatus,
  getClientTools,
  getMcpConfigFromFile,
  getMcpRuntime,
  setMcpRuntime,
  detectMcpPaths,
  isMcpEnabled,
  pauseMcpServer,
  removeMcpServer,
  restartAllClients,
  resumeMcpServer,
  getMcpLogs,
  clearMcpLogs,
} from "../mcp/actions";
import {
  ListToolsResponse,
  McpConfigData,
  PresetServer,
  RuntimeConfig,
  ServerConfig,
  ServerStatusResponse,
  ToolInfo,
  isSSEConfig,
  isHTTPConfig,
  isStdioConfig,
} from "../mcp/types";
import clsx from "clsx";
import PlayIcon from "../icons/play.svg";
import StopIcon from "../icons/pause.svg";
import { Path } from "../constant";
import Locale from "../locales";

interface ConfigProperty {
  type: string;
  description?: string;
  required?: boolean;
  minItems?: number;
}

// 自定义服务器配置表单状态
interface CustomServerForm {
  id: string;
  name: string;
  type: "stdio" | "sse" | "http";
  // stdio 类型字段
  command: string;
  args: string;
  env: string;
  // sse/http 类型字段
  url: string;
  headers: string;
}

export function McpMarketPage() {
  const navigate = useNavigate();
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [userConfig, setUserConfig] = useState<Record<string, any>>({});
  const [editingServerId, setEditingServerId] = useState<string | undefined>();
  const [tools, setTools] = useState<ListToolsResponse["tools"] | null>(null);
  const [viewingServerId, setViewingServerId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<McpConfigData>();
  const [clientStatuses, setClientStatuses] = useState<
    Record<string, ServerStatusResponse>
  >({});
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [presetServers, setPresetServers] = useState<PresetServer[]>([]);
  const [loadingStates, setLoadingStates] = useState<Record<string, string>>(
    {},
  );
  // 自定义服务器相关状态
  const [showCustomServerModal, setShowCustomServerModal] = useState(false);
  const [customServerForm, setCustomServerForm] = useState<CustomServerForm>({
    id: "",
    name: "",
    type: "stdio",
    command: "",
    args: "",
    env: "",
    url: "",
    headers: "",
  });
  const [editingCustomServerId, setEditingCustomServerId] = useState<
    string | undefined
  >();
  // 运行时配置相关状态
  const [showRuntimeModal, setShowRuntimeModal] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>({});
  const [isDetectingPaths, setIsDetectingPaths] = useState(false);
  // 日志查看相关状态
  const [showLogModal, setShowLogModal] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 检查 MCP 是否启用
  useEffect(() => {
    const checkMcpStatus = async () => {
      const enabled = await isMcpEnabled();
      setMcpEnabled(enabled);
      if (!enabled) {
        navigate(Path.Home);
      }
    };
    checkMcpStatus();
  }, [navigate]);

  // 添加状态轮询
  useEffect(() => {
    if (!mcpEnabled || !config) return;

    const updateStatuses = async () => {
      const statuses = await getClientsStatus();
      setClientStatuses(statuses);
    };

    // 立即执行一次
    updateStatuses();
    // 每 1000ms 轮询一次
    const timer = setInterval(updateStatuses, 1000);

    return () => clearInterval(timer);
  }, [mcpEnabled, config]);

  // 加载预设服务器
  useEffect(() => {
    const loadPresetServers = async () => {
      if (!mcpEnabled) return;
      try {
        setLoadingPresets(true);
        const response = await fetch("https://nextchat.club/mcp/list");
        if (!response.ok) {
          throw new Error("Failed to load preset servers");
        }
        const data = await response.json();
        setPresetServers(data?.data ?? []);
      } catch (error) {
        console.error("Failed to load preset servers:", error);
        console.error("Failed to load preset servers:", error);
        showToast(Locale.Mcp.Toast.LoadPresetFailed);
      } finally {
        setLoadingPresets(false);
      }
    };
    loadPresetServers();
  }, [mcpEnabled]);

  // 加载运行时配置
  useEffect(() => {
    const loadRuntimeConfig = async () => {
      if (!mcpEnabled) return;
      try {
        const runtime = await getMcpRuntime();
        setRuntimeConfig(runtime);
      } catch (error) {
        console.error("Failed to load runtime config:", error);
      }
    };
    loadRuntimeConfig();
  }, [mcpEnabled]);

  // 日志自动刷新
  useEffect(() => {
    if (!showLogModal || !autoRefreshLogs) return;

    const refreshLogs = async () => {
      const newLogs = await getMcpLogs(500);
      setLogs(newLogs);
      // 自动滚动到底部
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop =
          logContainerRef.current.scrollHeight;
      }
    };

    refreshLogs();
    const timer = setInterval(refreshLogs, 1000);
    return () => clearInterval(timer);
  }, [showLogModal, autoRefreshLogs]);

  // 加载初始状态
  useEffect(() => {
    const loadInitialState = async () => {
      if (!mcpEnabled) return;
      try {
        setIsLoading(true);
        const config = await getMcpConfigFromFile();
        setConfig(config);

        // 获取所有客户端的状态
        const statuses = await getClientsStatus();
        setClientStatuses(statuses);
      } catch (error) {
        console.error("Failed to load initial state:", error);
        showToast("Failed to load initial state");
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialState();
  }, [mcpEnabled]);

  // 加载当前编辑服务器的配置
  useEffect(() => {
    if (!editingServerId || !config) return;
    const currentConfig = config.mcpServers[editingServerId];
    if (currentConfig && isStdioConfig(currentConfig)) {
      // 从当前配置中提取用户配置（仅适用于 Stdio 类型）
      const preset = presetServers.find((s) => s.id === editingServerId);
      if (preset?.configSchema) {
        const userConfig: Record<string, any> = {};
        Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
          if (mapping.type === "spread") {
            // For spread types, extract the array from args.
            const startPos = mapping.position ?? 0;
            userConfig[key] = currentConfig.args.slice(startPos);
          } else if (mapping.type === "single") {
            // For single types, get a single value
            userConfig[key] = currentConfig.args[mapping.position ?? 0];
          } else if (
            mapping.type === "env" &&
            mapping.key &&
            currentConfig.env
          ) {
            // For env types, get values from environment variables
            userConfig[key] = currentConfig.env[mapping.key];
          }
        });
        setUserConfig(userConfig);
      }
    } else {
      setUserConfig({});
    }
  }, [editingServerId, config, presetServers]);

  if (!mcpEnabled) {
    return null;
  }

  // 检查服务器是否已添加
  const isServerAdded = (id: string) => {
    return id in (config?.mcpServers ?? {});
  };

  // 保存服务器配置
  const saveServerConfig = async () => {
    const preset = presetServers.find((s) => s.id === editingServerId);
    if (!preset || !preset.configSchema || !editingServerId) return;

    const savingServerId = editingServerId;
    setEditingServerId(undefined);

    try {
      updateLoadingState(savingServerId, Locale.Mcp.Status.Updating);
      // 构建服务器配置
      const args = [...preset.baseArgs];
      const env: Record<string, string> = {};

      Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
        const value = userConfig[key];
        if (mapping.type === "spread" && Array.isArray(value)) {
          const pos = mapping.position ?? 0;
          args.splice(pos, 0, ...value);
        } else if (
          mapping.type === "single" &&
          mapping.position !== undefined
        ) {
          args[mapping.position] = value;
        } else if (
          mapping.type === "env" &&
          mapping.key &&
          typeof value === "string"
        ) {
          env[mapping.key] = value;
        }
      });

      const serverConfig: ServerConfig = {
        command: preset.command,
        args,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      };

      const newConfig = await addMcpServer(savingServerId, serverConfig);
      setConfig(newConfig);
      setConfig(newConfig);
      showToast(Locale.Mcp.Toast.ConfigUpdated);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : Locale.Mcp.Toast.SaveFailed,
      );
    } finally {
      updateLoadingState(savingServerId, null);
    }
  };

  // 获取服务器支持的 Tools
  const loadTools = async (id: string) => {
    try {
      const result = await getClientTools(id);
      if (result) {
        setTools(result.tools);
      } else {
        throw new Error("Failed to load tools");
      }
    } catch (error) {
      showToast(Locale.Mcp.Toast.LoadFailed);
      console.error(error);
      setTools(null);
    }
  };

  // 更新加载状态的辅助函数
  const updateLoadingState = (id: string, message: string | null) => {
    setLoadingStates((prev) => {
      if (message === null) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: message };
    });
  };

  // 修改添加服务器函数
  const addServer = async (preset: PresetServer) => {
    if (!preset.configurable) {
      try {
        const serverId = preset.id;
        updateLoadingState(serverId, Locale.Mcp.Status.Creating);

        const serverConfig: ServerConfig = {
          command: preset.command,
          args: [...preset.baseArgs],
        };
        const newConfig = await addMcpServer(preset.id, serverConfig);
        setConfig(newConfig);

        // 更新状态
        const statuses = await getClientsStatus();
        setClientStatuses(statuses);
      } finally {
        updateLoadingState(preset.id, null);
      }
    } else {
      // 如果需要配置，打开配置对话框
      setEditingServerId(preset.id);
      setUserConfig({});
    }
  };

  // 修改暂停服务器函数
  const pauseServer = async (id: string) => {
    try {
      updateLoadingState(id, Locale.Mcp.Status.Stopping);
      const newConfig = await pauseMcpServer(id);
      setConfig(newConfig);
      showToast(Locale.Mcp.Toast.ServerStopped);
    } catch (error) {
      showToast(Locale.Mcp.Toast.StopFailed);
      console.error(error);
    } finally {
      updateLoadingState(id, null);
    }
  };

  // Restart server
  const restartServer = async (id: string) => {
    try {
      updateLoadingState(id, Locale.Mcp.Status.Starting);
      await resumeMcpServer(id);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : Locale.Mcp.Toast.StartFailed,
      );
      console.error(error);
    } finally {
      updateLoadingState(id, null);
    }
  };

  // Remove server
  const removeServer = async (id: string) => {
    try {
      updateLoadingState(id, Locale.Mcp.Status.Removing);
      const newConfig = await removeMcpServer(id);
      setConfig(newConfig);
      showToast(Locale.Mcp.Toast.ServerRemoved);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : Locale.Mcp.Toast.RemoveFailed,
      );
      console.error(error);
    } finally {
      updateLoadingState(id, null);
    }
  };

  // Restart all clients
  const handleRestartAll = async () => {
    try {
      updateLoadingState("all", Locale.Mcp.Status.Restarting);
      const newConfig = await restartAllClients();
      setConfig(newConfig);
      showToast(Locale.Mcp.Toast.RestartingAll);
    } catch (error) {
      showToast(Locale.Mcp.Toast.RestartFailed);
      console.error(error);
    } finally {
      updateLoadingState("all", null);
    }
  };

  // 打开添加自定义服务器弹窗
  const openCustomServerModal = (serverId?: string) => {
    if (serverId && config?.mcpServers[serverId]) {
      // 编辑现有自定义服务器
      const serverConfig = config.mcpServers[serverId];
      if (isSSEConfig(serverConfig)) {
        // SSE 类型服务器
        setCustomServerForm({
          id: serverId,
          name: serverId,
          type: "sse",
          command: "",
          args: "",
          env: "",
          url: serverConfig.url,
          headers: Object.entries(serverConfig.headers || {})
            .map(([k, v]) => `${k}=${v}`)
            .join("\n"),
        });
      } else if (isHTTPConfig(serverConfig)) {
        // HTTP 类型服务器
        setCustomServerForm({
          id: serverId,
          name: serverId,
          type: "http",
          command: "",
          args: "",
          env: "",
          url: serverConfig.url,
          headers: Object.entries(serverConfig.headers || {})
            .map(([k, v]) => `${k}=${v}`)
            .join("\n"),
        });
      } else {
        // Stdio 类型服务器
        setCustomServerForm({
          id: serverId,
          name: serverId,
          type: "stdio",
          command: serverConfig.command,
          args: serverConfig.args.join(" "),
          env: Object.entries(serverConfig.env || {})
            .map(([k, v]) => `${k}=${v}`)
            .join("\n"),
          url: "",
          headers: "",
        });
      }
      setEditingCustomServerId(serverId);
    } else {
      // 添加新服务器
      setCustomServerForm({
        id: "",
        name: "",
        type: "stdio",
        command: "",
        args: "",
        env: "",
        url: "",
        headers: "",
      });
      setEditingCustomServerId(undefined);
    }
    setShowCustomServerModal(true);
  };

  // 保存自定义服务器
  const saveCustomServer = async () => {
    const { id, type, command, args, env, url, headers } = customServerForm;

    if (!id.trim()) {
      showToast(Locale.Mcp.Toast.EnterServerId);
      return;
    }

    // 根据类型验证必填字段
    if (type === "stdio" && !command.trim()) {
      showToast(Locale.Mcp.Toast.EnterCommand);
      return;
    }
    if (type === "sse" && !url.trim()) {
      showToast(Locale.Mcp.Toast.EnterUrl || "Please enter URL");
      return;
    }
    if (type === "http" && !url.trim()) {
      showToast(Locale.Mcp.Toast.EnterUrl || "Please enter URL");
      return;
    }

    // 检查 ID 是否与预设服务器冲突
    if (!editingCustomServerId && presetServers.some((s) => s.id === id)) {
      showToast(Locale.Mcp.Toast.ServerIdConflict);
      return;
    }

    const serverId = id.trim();
    setShowCustomServerModal(false);

    try {
      updateLoadingState(serverId, Locale.Mcp.Status.Saving);

      let serverConfig: ServerConfig;

      if (type === "sse") {
        // SSE 类型配置
        const headersObj: Record<string, string> = {};
        if (headers.trim()) {
          headers
            .trim()
            .split("\n")
            .forEach((line) => {
              const eqIndex = line.indexOf("=");
              if (eqIndex > 0) {
                const key = line.substring(0, eqIndex).trim();
                const value = line.substring(eqIndex + 1).trim();
                if (key) headersObj[key] = value;
              }
            });
        }

        serverConfig = {
          type: "sse",
          url: url.trim(),
          ...(Object.keys(headersObj).length > 0
            ? { headers: headersObj }
            : {}),
        };
      } else if (type === "http") {
        // HTTP 类型配置（Streamable HTTP）
        const headersObj: Record<string, string> = {};
        if (headers.trim()) {
          headers
            .trim()
            .split("\n")
            .forEach((line) => {
              const eqIndex = line.indexOf("=");
              if (eqIndex > 0) {
                const key = line.substring(0, eqIndex).trim();
                const value = line.substring(eqIndex + 1).trim();
                if (key) headersObj[key] = value;
              }
            });
        }

        serverConfig = {
          type: "http",
          url: url.trim(),
          ...(Object.keys(headersObj).length > 0
            ? { headers: headersObj }
            : {}),
        };
      } else {
        // Stdio 类型配置
        const argsArray = args
          .trim()
          .split(/\s+/)
          .filter((a) => a.length > 0);

        const envObj: Record<string, string> = {};
        if (env.trim()) {
          env
            .trim()
            .split("\n")
            .forEach((line) => {
              const eqIndex = line.indexOf("=");
              if (eqIndex > 0) {
                const key = line.substring(0, eqIndex).trim();
                const value = line.substring(eqIndex + 1).trim();
                if (key) envObj[key] = value;
              }
            });
        }

        serverConfig = {
          type: "stdio",
          command: command.trim(),
          args: argsArray,
          ...(Object.keys(envObj).length > 0 ? { env: envObj } : {}),
        };
      }

      const newConfig = await addMcpServer(serverId, serverConfig);
      setConfig(newConfig);
      showToast(
        editingCustomServerId
          ? Locale.Mcp.Toast.ServerUpdated
          : Locale.Mcp.Toast.ServerAdded,
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : Locale.Mcp.Toast.ServerSaveFailed,
      );
    } finally {
      updateLoadingState(serverId, null);
    }
  };

  // 检查是否为自定义服务器（不在预设列表中）
  const isCustomServer = (serverId: string) => {
    return !presetServers.some((s) => s.id === serverId);
  };

  // 获取所有自定义服务器
  const getCustomServers = () => {
    if (!config?.mcpServers) return [];
    return Object.entries(config.mcpServers)
      .filter(([id]) => isCustomServer(id))
      .map(([id, serverConfig]) => ({
        id,
        ...serverConfig,
      }));
  };

  // 获取服务器显示信息
  const getServerDisplayInfo = (serverConfig: ServerConfig) => {
    if (isSSEConfig(serverConfig)) {
      return `[SSE] ${serverConfig.url}`;
    }
    if (isHTTPConfig(serverConfig)) {
      return `[HTTP] ${serverConfig.url}`;
    }
    return `${serverConfig.command} ${serverConfig.args.join(" ")}`;
  };

  // 保存运行时配置
  const saveRuntimeConfig = async () => {
    try {
      await setMcpRuntime(runtimeConfig);
      setShowRuntimeModal(false);
      showToast(Locale.Mcp.Toast.RuntimeSaved);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : Locale.Mcp.Toast.RuntimeSaveFailed,
      );
    }
  };

  // 自动检测路径
  const handleDetectPaths = async () => {
    try {
      setIsDetectingPaths(true);
      const detected = await detectMcpPaths();
      setRuntimeConfig((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(detected).filter(
            ([_, v]) => v !== undefined && v !== null,
          ),
        ),
      }));
      showToast(Locale.Mcp.Toast.PathsDetected);
    } catch (error) {
      showToast(Locale.Mcp.Toast.PathsDetectFailed);
    } finally {
      setIsDetectingPaths(false);
    }
  };

  // Render configuration form
  const renderConfigForm = () => {
    const preset = presetServers.find((s) => s.id === editingServerId);
    if (!preset?.configSchema) return null;

    return Object.entries(preset.configSchema.properties).map(
      ([key, prop]: [string, ConfigProperty]) => {
        if (prop.type === "array") {
          const currentValue = userConfig[key as keyof typeof userConfig] || [];
          const itemLabel = (prop as any).itemLabel || key;
          const addButtonText =
            (prop as any).addButtonText || `Add ${itemLabel}`;

          return (
            <ListItem
              key={key}
              title={key}
              subTitle={prop.description}
              vertical
            >
              <div className={styles["path-list"]}>
                {(currentValue as string[]).map(
                  (value: string, index: number) => (
                    <div key={index} className={styles["path-item"]}>
                      <input
                        type="text"
                        value={value}
                        placeholder={`${itemLabel} ${index + 1}`}
                        onChange={(e) => {
                          const newValue = [...currentValue] as string[];
                          newValue[index] = e.target.value;
                          setUserConfig({ ...userConfig, [key]: newValue });
                        }}
                      />
                      <IconButton
                        icon={<DeleteIcon />}
                        className={styles["delete-button"]}
                        onClick={() => {
                          const newValue = [...currentValue] as string[];
                          newValue.splice(index, 1);
                          setUserConfig({ ...userConfig, [key]: newValue });
                        }}
                      />
                    </div>
                  ),
                )}
                <IconButton
                  icon={<AddIcon />}
                  text={addButtonText}
                  className={styles["add-button"]}
                  bordered
                  onClick={() => {
                    const newValue = [...currentValue, ""] as string[];
                    setUserConfig({ ...userConfig, [key]: newValue });
                  }}
                />
              </div>
            </ListItem>
          );
        } else if (prop.type === "string") {
          const currentValue = userConfig[key as keyof typeof userConfig] || "";
          return (
            <ListItem key={key} title={key} subTitle={prop.description}>
              <input
                aria-label={key}
                type="text"
                value={currentValue}
                placeholder={`Enter ${key}`}
                onChange={(e) => {
                  setUserConfig({ ...userConfig, [key]: e.target.value });
                }}
              />
            </ListItem>
          );
        }
        return null;
      },
    );
  };

  const checkServerStatus = (clientId: string) => {
    return clientStatuses[clientId] || { status: "undefined", errorMsg: null };
  };

  const getServerStatusDisplay = (clientId: string) => {
    const status = checkServerStatus(clientId);

    const statusMap = {
      undefined: null, // 未配置/未找到不显示
      // 添加初始化状态
      initializing: (
        <span className={clsx(styles["server-status"], styles["initializing"])}>
          {Locale.Mcp.Status.Initializing}
        </span>
      ),
      paused: (
        <span className={clsx(styles["server-status"], styles["stopped"])}>
          {Locale.Mcp.Status.Stopped}
        </span>
      ),
      active: (
        <span className={styles["server-status"]}>
          {Locale.Mcp.Status.Running}
        </span>
      ),
      error: (
        <span className={clsx(styles["server-status"], styles["error"])}>
          {Locale.Mcp.Status.Error}
          <span className={styles["error-message"]}>: {status.errorMsg}</span>
        </span>
      ),
    };

    return statusMap[status.status];
  };

  // Get the type of operation status
  const getOperationStatusType = (message: string) => {
    const lowerMsg = message.toLowerCase();
    if (
      message === Locale.Mcp.Status.Stopping ||
      lowerMsg.includes("stopping")
    ) {
      return "stopping";
    }
    if (
      message === Locale.Mcp.Status.Starting ||
      message === Locale.Mcp.Status.Restarting ||
      lowerMsg.includes("starting") ||
      lowerMsg.includes("restarting")
    ) {
      return "starting";
    }
    if (message === Locale.Mcp.Status.Error || lowerMsg.includes("error")) {
      return "error";
    }
    return "default";
  };

  // 渲染服务器列表
  const renderServerList = () => {
    if (loadingPresets) {
      return (
        <div className={styles["loading-container"]}>
          <div className={styles["loading-text"]}>
            {Locale.Mcp.Market.LoadingPreset}
          </div>
        </div>
      );
    }

    if (!Array.isArray(presetServers) || presetServers.length === 0) {
      return (
        <div className={styles["empty-container"]}>
          <div className={styles["empty-text"]}>
            {Locale.Mcp.Market.NoServers}
          </div>
        </div>
      );
    }

    return presetServers
      .filter((server) => {
        if (searchText.length === 0) return true;
        const searchLower = searchText.toLowerCase();
        return (
          server.name.toLowerCase().includes(searchLower) ||
          server.description.toLowerCase().includes(searchLower) ||
          server.tags.some((tag) => tag.toLowerCase().includes(searchLower))
        );
      })
      .sort((a, b) => {
        const aStatus = checkServerStatus(a.id).status;
        const bStatus = checkServerStatus(b.id).status;
        const aLoading = loadingStates[a.id];
        const bLoading = loadingStates[b.id];

        // 定义状态优先级
        const statusPriority: Record<string, number> = {
          error: 0, // Highest priority for error status
          active: 1, // Second for active
          initializing: 2, // Initializing
          starting: 3, // Starting
          stopping: 4, // Stopping
          paused: 5, // Paused
          undefined: 6, // Lowest priority for undefined
        };

        // Get actual status (including loading status)
        const getEffectiveStatus = (status: string, loading?: string) => {
          if (loading) {
            const operationType = getOperationStatusType(loading);
            return operationType === "default" ? status : operationType;
          }

          if (status === "initializing" && !loading) {
            return "active";
          }

          return status;
        };

        const aEffectiveStatus = getEffectiveStatus(aStatus, aLoading);
        const bEffectiveStatus = getEffectiveStatus(bStatus, bLoading);

        // 首先按状态排序
        if (aEffectiveStatus !== bEffectiveStatus) {
          return (
            (statusPriority[aEffectiveStatus] ?? 6) -
            (statusPriority[bEffectiveStatus] ?? 6)
          );
        }

        // Sort by name when statuses are the same
        return a.name.localeCompare(b.name);
      })
      .map((server) => (
        <div
          className={clsx(styles["mcp-market-item"], {
            [styles["loading"]]: loadingStates[server.id],
          })}
          key={server.id}
        >
          <div className={styles["mcp-market-header"]}>
            <div className={styles["mcp-market-title"]}>
              <div className={styles["mcp-market-name"]}>
                {server.name}
                {loadingStates[server.id] && (
                  <span
                    className={styles["operation-status"]}
                    data-status={getOperationStatusType(
                      loadingStates[server.id],
                    )}
                  >
                    {loadingStates[server.id]}
                  </span>
                )}
                {!loadingStates[server.id] && getServerStatusDisplay(server.id)}
                {server.repo && (
                  <a
                    href={server.repo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles["repo-link"]}
                    title="Open repository"
                  >
                    <GithubIcon />
                  </a>
                )}
              </div>
              <div className={styles["tags-container"]}>
                {server.tags.map((tag, index) => (
                  <span key={index} className={styles["tag"]}>
                    {tag}
                  </span>
                ))}
              </div>
              <div
                className={clsx(styles["mcp-market-info"], "one-line")}
                title={server.description}
              >
                {server.description}
              </div>
            </div>
            <div className={styles["mcp-market-actions"]}>
              {isServerAdded(server.id) ? (
                <>
                  {server.configurable && (
                    <IconButton
                      icon={<EditIcon />}
                      text={Locale.Mcp.Actions.Configure}
                      onClick={() => setEditingServerId(server.id)}
                      disabled={isLoading}
                    />
                  )}
                  {checkServerStatus(server.id).status === "paused" ? (
                    <>
                      <IconButton
                        icon={<PlayIcon />}
                        text={Locale.Mcp.Actions.Start}
                        onClick={() => restartServer(server.id)}
                        disabled={isLoading}
                      />
                      <IconButton
                        icon={<DeleteIcon />}
                        text={Locale.Mcp.Actions.Remove}
                        onClick={() => removeServer(server.id)}
                        disabled={isLoading}
                      />
                    </>
                  ) : (
                    <>
                      <IconButton
                        icon={<EyeIcon />}
                        text={Locale.Mcp.Actions.Tools}
                        onClick={async () => {
                          setViewingServerId(server.id);
                          await loadTools(server.id);
                        }}
                        disabled={
                          isLoading ||
                          checkServerStatus(server.id).status === "error"
                        }
                      />
                      <IconButton
                        icon={<StopIcon />}
                        text={Locale.Mcp.Actions.Stop}
                        onClick={() => pauseServer(server.id)}
                        disabled={isLoading}
                      />
                    </>
                  )}
                </>
              ) : (
                <IconButton
                  icon={<AddIcon />}
                  text={Locale.Mcp.Actions.Add}
                  onClick={() => addServer(server)}
                  disabled={isLoading}
                />
              )}
            </div>
          </div>
        </div>
      ));
  };

  return (
    <ErrorBoundary>
      <div className={styles["mcp-market-page"]}>
        <div className="window-header">
          <div className="window-header-title">
            <div className="window-header-main-title">
              {Locale.Mcp.Market.Title}
              {loadingStates["all"] && (
                <span className={styles["loading-indicator"]}>
                  {loadingStates["all"]}
                </span>
              )}
            </div>
            <div className="window-header-sub-title">
              {Locale.Mcp.Market.SubTitle(
                Object.keys(config?.mcpServers ?? {}).length,
              )}
            </div>
          </div>

          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                icon={<LogIcon />}
                bordered
                onClick={() => setShowLogModal(true)}
                title="Logs"
              />
            </div>
            <div className="window-action-button">
              <IconButton
                icon={<SettingsIcon />}
                bordered
                onClick={() => setShowRuntimeModal(true)}
                title={Locale.Mcp.Modal.RuntimeSettings}
              />
            </div>
            <div className="window-action-button">
              <IconButton
                icon={<AddIcon />}
                bordered
                onClick={() => openCustomServerModal()}
                text={Locale.Mcp.Market.Custom}
                disabled={isLoading}
              />
            </div>
            <div className="window-action-button">
              <IconButton
                icon={<RestartIcon />}
                bordered
                onClick={handleRestartAll}
                text={Locale.Mcp.Market.RestartAll}
                disabled={isLoading}
              />
            </div>
            <div className="window-action-button">
              <IconButton
                icon={<CloseIcon />}
                bordered
                onClick={() => navigate(-1)}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        <div className={styles["mcp-market-page-body"]}>
          <div className={styles["mcp-market-filter"]}>
            <input
              type="text"
              className={styles["search-bar"]}
              placeholder={Locale.Mcp.Market.SearchPlaceholder}
              autoFocus
              onInput={(e) => setSearchText(e.currentTarget.value)}
            />
          </div>

          {/* 自定义服务器列表 */}
          {getCustomServers().length > 0 && (
            <div className={styles["custom-servers-section"]}>
              <div className={styles["section-title"]}>
                {Locale.Mcp.Market.CustomServers}
              </div>
              <div className={styles["server-list"]}>
                {getCustomServers()
                  .filter((server) => {
                    if (searchText.length === 0) return true;
                    return server.id
                      .toLowerCase()
                      .includes(searchText.toLowerCase());
                  })
                  .map((server) => (
                    <div
                      className={clsx(styles["mcp-market-item"], {
                        [styles["loading"]]: loadingStates[server.id],
                      })}
                      key={server.id}
                    >
                      <div className={styles["mcp-market-header"]}>
                        <div className={styles["mcp-market-title"]}>
                          <div className={styles["mcp-market-name"]}>
                            {server.id}
                            {loadingStates[server.id] && (
                              <span
                                className={styles["operation-status"]}
                                data-status={getOperationStatusType(
                                  loadingStates[server.id],
                                )}
                              >
                                {loadingStates[server.id]}
                              </span>
                            )}
                            {!loadingStates[server.id] &&
                              getServerStatusDisplay(server.id)}
                            <span className={styles["custom-badge"]}>
                              {Locale.Mcp.Market.Custom}
                            </span>
                          </div>
                          <div
                            className={clsx(
                              styles["mcp-market-info"],
                              "one-line",
                            )}
                            title={getServerDisplayInfo(server)}
                          >
                            {getServerDisplayInfo(server)}
                          </div>
                        </div>
                        <div className={styles["mcp-market-actions"]}>
                          <IconButton
                            icon={<EditIcon />}
                            text={Locale.Mcp.Actions.Edit}
                            onClick={() => openCustomServerModal(server.id)}
                            disabled={isLoading}
                          />
                          {checkServerStatus(server.id).status === "paused" ? (
                            <>
                              <IconButton
                                icon={<PlayIcon />}
                                text={Locale.Mcp.Actions.Start}
                                onClick={() => restartServer(server.id)}
                                disabled={isLoading}
                              />
                              <IconButton
                                icon={<DeleteIcon />}
                                text={Locale.Mcp.Actions.Remove}
                                onClick={() => removeServer(server.id)}
                                disabled={isLoading}
                              />
                            </>
                          ) : (
                            <>
                              <IconButton
                                icon={<EyeIcon />}
                                text={Locale.Mcp.Actions.Tools}
                                onClick={async () => {
                                  setViewingServerId(server.id);
                                  await loadTools(server.id);
                                }}
                                disabled={
                                  isLoading ||
                                  checkServerStatus(server.id).status ===
                                    "error"
                                }
                              />
                              <IconButton
                                icon={<StopIcon />}
                                text={Locale.Mcp.Actions.Stop}
                                onClick={() => pauseServer(server.id)}
                                disabled={isLoading}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 预设服务器列表 */}
          <div className={styles["section-title"]}>
            {Locale.Mcp.Market.PresetServers}
          </div>
          <div className={styles["server-list"]}>{renderServerList()}</div>
        </div>

        {/*编辑服务器配置*/}
        {editingServerId && (
          <div className="modal-mask">
            <Modal
              title={`${Locale.Mcp.Modal.ConfigureServer} - ${editingServerId}`}
              onClose={() => !isLoading && setEditingServerId(undefined)}
              actions={[
                <IconButton
                  key="cancel"
                  text={Locale.Mcp.Actions.Cancel}
                  onClick={() => setEditingServerId(undefined)}
                  bordered
                  disabled={isLoading}
                />,
                <IconButton
                  key="confirm"
                  text={Locale.Mcp.Actions.Save}
                  type="primary"
                  onClick={saveServerConfig}
                  bordered
                  disabled={isLoading}
                />,
              ]}
            >
              <List>{renderConfigForm()}</List>
            </Modal>
          </div>
        )}

        {viewingServerId && (
          <div className="modal-mask">
            <Modal
              title={`${Locale.Mcp.Modal.ServerDetails} - ${viewingServerId}`}
              onClose={() => setViewingServerId(undefined)}
              actions={[
                <IconButton
                  key="close"
                  text={Locale.Mcp.Actions.Close}
                  onClick={() => setViewingServerId(undefined)}
                  bordered
                />,
              ]}
            >
              <div className={styles["tools-list"]}>
                {isLoading ? (
                  <div>{Locale.Mcp.Market.Loading}</div>
                ) : tools && tools.length > 0 ? (
                  tools.map((tool: ToolInfo, index: number) => (
                    <div key={index} className={styles["tool-item"]}>
                      <div className={styles["tool-name"]}>{tool.name}</div>
                      <div className={styles["tool-description"]}>
                        {tool.description}
                      </div>
                    </div>
                  ))
                ) : (
                  <div>{Locale.Mcp.Market.NoTools}</div>
                )}
              </div>
            </Modal>
          </div>
        )}

        {/* 自定义服务器配置弹窗 */}
        {showCustomServerModal && (
          <div className="modal-mask">
            <Modal
              title={
                editingCustomServerId
                  ? `${Locale.Mcp.Modal.EditServer} - ${editingCustomServerId}`
                  : Locale.Mcp.Modal.AddCustomServer
              }
              onClose={() => setShowCustomServerModal(false)}
              actions={[
                <IconButton
                  key="cancel"
                  text={Locale.Mcp.Actions.Cancel}
                  onClick={() => setShowCustomServerModal(false)}
                  bordered
                />,
                <IconButton
                  key="confirm"
                  text={Locale.Mcp.Actions.Save}
                  type="primary"
                  onClick={saveCustomServer}
                  bordered
                />,
              ]}
            >
              <List>
                <ListItem
                  title={Locale.Mcp.CustomServer.ServerId}
                  subTitle={Locale.Mcp.CustomServer.ServerIdDesc}
                >
                  <input
                    type="text"
                    value={customServerForm.id}
                    placeholder={Locale.Mcp.CustomServer.ServerIdPlaceholder}
                    disabled={!!editingCustomServerId}
                    onChange={(e) =>
                      setCustomServerForm({
                        ...customServerForm,
                        id: e.target.value,
                      })
                    }
                  />
                </ListItem>
                <ListItem
                  title={Locale.Mcp.CustomServer.Type || "Type"}
                  subTitle={
                    Locale.Mcp.CustomServer.TypeDesc || "Server connection type"
                  }
                >
                  <select
                    value={customServerForm.type}
                    onChange={(e) =>
                      setCustomServerForm({
                        ...customServerForm,
                        type: e.target.value as "stdio" | "sse" | "http",
                      })
                    }
                  >
                    <option value="stdio">Stdio</option>
                    <option value="sse">SSE</option>
                    <option value="http">HTTP</option>
                  </select>
                </ListItem>

                {/* Stdio 类型字段 */}
                {customServerForm.type === "stdio" && (
                  <>
                    <ListItem
                      title={Locale.Mcp.CustomServer.Command}
                      subTitle={Locale.Mcp.CustomServer.CommandDesc}
                    >
                      <input
                        type="text"
                        value={customServerForm.command}
                        placeholder={Locale.Mcp.CustomServer.CommandPlaceholder}
                        onChange={(e) =>
                          setCustomServerForm({
                            ...customServerForm,
                            command: e.target.value,
                          })
                        }
                      />
                    </ListItem>
                    <ListItem
                      title={Locale.Mcp.CustomServer.Arguments}
                      subTitle={Locale.Mcp.CustomServer.ArgumentsDesc}
                    >
                      <input
                        type="text"
                        value={customServerForm.args}
                        placeholder={
                          Locale.Mcp.CustomServer.ArgumentsPlaceholder
                        }
                        onChange={(e) =>
                          setCustomServerForm({
                            ...customServerForm,
                            args: e.target.value,
                          })
                        }
                      />
                    </ListItem>
                    <ListItem
                      title={Locale.Mcp.CustomServer.EnvVars}
                      subTitle={Locale.Mcp.CustomServer.EnvVarsDesc}
                      vertical
                    >
                      <textarea
                        className={styles["env-textarea"]}
                        value={customServerForm.env}
                        placeholder={Locale.Mcp.CustomServer.EnvVarsPlaceholder}
                        rows={3}
                        onChange={(e) =>
                          setCustomServerForm({
                            ...customServerForm,
                            env: e.target.value,
                          })
                        }
                      />
                    </ListItem>
                  </>
                )}

                {/* SSE/HTTP 类型字段 */}
                {(customServerForm.type === "sse" ||
                  customServerForm.type === "http") && (
                  <>
                    <ListItem
                      title={Locale.Mcp.CustomServer.Url || "URL"}
                      subTitle={
                        customServerForm.type === "sse"
                          ? Locale.Mcp.CustomServer.UrlDesc ||
                            "SSE server endpoint URL"
                          : "HTTP server endpoint URL (Streamable HTTP)"
                      }
                    >
                      <input
                        type="text"
                        value={customServerForm.url}
                        placeholder={
                          customServerForm.type === "sse"
                            ? Locale.Mcp.CustomServer.UrlPlaceholder ||
                              "https://example.com/sse"
                            : "https://example.com/mcp"
                        }
                        onChange={(e) =>
                          setCustomServerForm({
                            ...customServerForm,
                            url: e.target.value,
                          })
                        }
                      />
                    </ListItem>
                    <ListItem
                      title={Locale.Mcp.CustomServer.Headers || "Headers"}
                      subTitle={
                        Locale.Mcp.CustomServer.HeadersDesc ||
                        "HTTP headers (one per line, format: KEY=VALUE)"
                      }
                      vertical
                    >
                      <textarea
                        className={styles["env-textarea"]}
                        value={customServerForm.headers}
                        placeholder={
                          Locale.Mcp.CustomServer.HeadersPlaceholder ||
                          "Authorization=Bearer xxx\nX-API-Key=your-key"
                        }
                        rows={3}
                        onChange={(e) =>
                          setCustomServerForm({
                            ...customServerForm,
                            headers: e.target.value,
                          })
                        }
                      />
                    </ListItem>
                  </>
                )}
              </List>
            </Modal>
          </div>
        )}

        {/* 运行时配置弹窗 */}
        {showRuntimeModal && (
          <div className="modal-mask">
            <Modal
              title={Locale.Mcp.Modal.RuntimeSettings}
              onClose={() => setShowRuntimeModal(false)}
              actions={[
                <IconButton
                  key="detect"
                  text={
                    isDetectingPaths
                      ? Locale.Mcp.Modal.Detecting
                      : Locale.Mcp.Modal.AutoDetect
                  }
                  onClick={handleDetectPaths}
                  bordered
                  disabled={isDetectingPaths}
                />,
                <IconButton
                  key="cancel"
                  text={Locale.Mcp.Actions.Cancel}
                  onClick={() => setShowRuntimeModal(false)}
                  bordered
                />,
                <IconButton
                  key="confirm"
                  text={Locale.Mcp.Actions.Save}
                  type="primary"
                  onClick={saveRuntimeConfig}
                  bordered
                />,
              ]}
            >
              <List>
                <ListItem
                  title={Locale.Mcp.Runtime.NodePath}
                  subTitle={Locale.Mcp.Runtime.NodePathDesc}
                >
                  <input
                    type="text"
                    value={runtimeConfig.nodePath || ""}
                    placeholder={Locale.Mcp.Runtime.NodePathPlaceholder}
                    onChange={(e) =>
                      setRuntimeConfig({
                        ...runtimeConfig,
                        nodePath: e.target.value || undefined,
                      })
                    }
                  />
                </ListItem>
                <ListItem
                  title={Locale.Mcp.Runtime.NpxPath}
                  subTitle={Locale.Mcp.Runtime.NpxPathDesc}
                >
                  <input
                    type="text"
                    value={runtimeConfig.npxPath || ""}
                    placeholder={Locale.Mcp.Runtime.NpxPathPlaceholder}
                    onChange={(e) =>
                      setRuntimeConfig({
                        ...runtimeConfig,
                        npxPath: e.target.value || undefined,
                      })
                    }
                  />
                </ListItem>
                <ListItem
                  title={Locale.Mcp.Runtime.UvxPath}
                  subTitle={Locale.Mcp.Runtime.UvxPathDesc}
                >
                  <input
                    type="text"
                    value={runtimeConfig.uvxPath || ""}
                    placeholder={Locale.Mcp.Runtime.UvxPathPlaceholder}
                    onChange={(e) =>
                      setRuntimeConfig({
                        ...runtimeConfig,
                        uvxPath: e.target.value || undefined,
                      })
                    }
                  />
                </ListItem>
                <ListItem
                  title={Locale.Mcp.Runtime.ExtraPath}
                  subTitle={Locale.Mcp.Runtime.ExtraPathDesc}
                >
                  <input
                    type="text"
                    value={runtimeConfig.extraPath || ""}
                    placeholder={Locale.Mcp.Runtime.ExtraPathPlaceholder}
                    onChange={(e) =>
                      setRuntimeConfig({
                        ...runtimeConfig,
                        extraPath: e.target.value || undefined,
                      })
                    }
                  />
                </ListItem>
              </List>
              <div className={styles["runtime-hint"]}>
                {Locale.Mcp.Runtime.Hint}
              </div>
            </Modal>
          </div>
        )}

        {/* 日志查看弹窗 */}
        {showLogModal && (
          <div className="modal-mask">
            <Modal
              title="MCP Logs"
              onClose={() => setShowLogModal(false)}
              actions={[
                <IconButton
                  key="copy"
                  text="Copy"
                  onClick={() => {
                    const logText = logs.join("\n");
                    navigator.clipboard
                      .writeText(logText)
                      .then(() => {
                        showToast("Logs copied to clipboard");
                      })
                      .catch(() => {
                        showToast("Failed to copy logs");
                      });
                  }}
                  bordered
                />,
                <IconButton
                  key="auto-refresh"
                  text={autoRefreshLogs ? "Pause" : "Resume"}
                  onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
                  bordered
                />,
                <IconButton
                  key="clear"
                  text="Clear"
                  onClick={async () => {
                    await clearMcpLogs();
                    setLogs([]);
                  }}
                  bordered
                />,
                <IconButton
                  key="close"
                  text={Locale.Mcp.Actions.Close}
                  onClick={() => setShowLogModal(false)}
                  bordered
                />,
              ]}
            >
              <div ref={logContainerRef} className={styles["log-container"]}>
                {logs.length === 0 ? (
                  <div className={styles["log-empty"]}>No logs yet</div>
                ) : (
                  logs.map((log, index) => (
                    <div
                      key={index}
                      className={clsx(styles["log-line"], {
                        [styles["log-error"]]: log.includes("ERROR"),
                        [styles["log-warn"]]: log.includes("WARN"),
                        [styles["log-debug"]]: log.includes("DEBUG"),
                      })}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </Modal>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
