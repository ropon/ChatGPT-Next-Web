
import { TauriMcpApi } from "./api";
import * as ServerActions from "./server-actions";
import { 
    ServerConfig, 
    McpRequestMessage 
} from "./types";

const isTauri = () => typeof window !== 'undefined' && '__TAURI__' in window;
const tauriApi = new TauriMcpApi();

// Initialize on load if in Tauri
if (isTauri()) {
    tauriApi.init().catch(console.error);
}

export async function getClientsStatus() {
    if (isTauri()) return tauriApi.getStatuses();
    return ServerActions.getClientsStatus();
}

export async function getClientTools(clientId: string) {
    if (isTauri()) return tauriApi.getTools(clientId);
    return ServerActions.getClientTools(clientId);
}

export async function getAvailableClientsCount() {
    if (isTauri()) {
        const statuses = await tauriApi.getStatuses();
        return Object.values(statuses).filter(s => s.status === 'active').length;
    }
    return ServerActions.getAvailableClientsCount();
}

export async function getAllTools() {
    if (isTauri()) {
        // Not fully implemented for Tauri bulk list yet in this iteration
        return [];
    }
    return ServerActions.getAllTools();
}

export async function initializeMcpSystem() {
    if (isTauri()) return tauriApi.init();
    return ServerActions.initializeMcpSystem();
}

export async function addMcpServer(clientId: string, config: ServerConfig) {
    if (isTauri()) return tauriApi.addServer(clientId, config);
    return ServerActions.addMcpServer(clientId, config);
}

export async function pauseMcpServer(clientId: string) {
    if (isTauri()) return tauriApi.pauseServer(clientId);
    return ServerActions.pauseMcpServer(clientId);
}

export async function resumeMcpServer(clientId: string) {
    if (isTauri()) return tauriApi.resumeServer(clientId);
    return ServerActions.resumeMcpServer(clientId);
}

export async function removeMcpServer(clientId: string) {
    if (isTauri()) return tauriApi.removeServer(clientId);
    return ServerActions.removeMcpServer(clientId);
}

export async function restartAllClients() {
    if (isTauri()) return tauriApi.restartAll();
    return ServerActions.restartAllClients();
}

export async function executeMcpAction(clientId: string, request: McpRequestMessage) {
    if (isTauri()) return tauriApi.callTool(clientId, request);
    return ServerActions.executeMcpAction(clientId, request);
}

export async function getMcpConfigFromFile() {
    if (isTauri()) return tauriApi.getConfig();
    return ServerActions.getMcpConfigFromFile();
}

export async function isMcpEnabled() {
    if (isTauri()) return tauriApi.isEnabled();
   
    // For static export build, accessing server config might fail or return false.
    // We try/catch just in case.
    try {
        return await ServerActions.isMcpEnabled();
    } catch {
        return false;
    }
}
