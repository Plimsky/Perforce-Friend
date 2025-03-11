import { P4Config } from "../components/P4ConnectionForm";
import { P4CheckedOutFile, P4ModifiedFile, P4CommandLog } from "../types/p4";

// Local storage key for Perforce connection
const P4_CONNECTION_KEY = "perforce_connection";

// Session storage key for Perforce credentials (not persisted after browser closes)
const P4_CREDENTIALS_KEY = "perforce_credentials";

// Local storage key for P4 command logs
const P4_COMMAND_LOGS_KEY = "perforce_command_logs";

// Maximum number of command logs to keep
const MAX_COMMAND_LOGS = 100;

/**
 * Service for handling Perforce-related operations
 */
export class P4Service {
    private static instance: P4Service;
    private isConnected = false;
    private connectionDetails: Partial<P4Config> = {};

    private constructor() {
        // Try to restore connection from localStorage on initialization
        this.restoreConnectionFromStorage();
    }

    /**
     * Get the singleton instance of P4Service
     */
    public static getInstance(): P4Service {
        if (!P4Service.instance) {
            P4Service.instance = new P4Service();
        }
        return P4Service.instance;
    }

    /**
     * Connect to Perforce server
     */
    public async connect(config: P4Config): Promise<{ success: boolean; message: string }> {
        try {
            // Call the API endpoint to connect to Perforce
            const response = await fetch("/api/p4/connect", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(config),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to connect to Perforce");
            }

            this.isConnected = true;
            // Store connection info without password for display
            this.connectionDetails = {
                port: config.port,
                user: config.user,
                client: config.client || data.client,
            };

            // Save connection details to localStorage and credentials to sessionStorage
            this.saveConnectionToStorage();
            this.saveCredentialsToSession(config);

            return {
                success: true,
                message: data.message || "Successfully connected to Perforce",
                ...(data.serverInfo && { serverInfo: data.serverInfo }),
            };
        } catch (error) {
            console.error("Error connecting to Perforce:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Unknown error occurred",
            };
        }
    }

    /**
     * Try to reconnect using stored credentials
     */
    public async reconnect(): Promise<{ success: boolean; message: string }> {
        try {
            const credentials = this.getStoredCredentials();
            if (!credentials) {
                return {
                    success: false,
                    message: "No stored credentials found",
                };
            }

            return await this.connect(credentials);
        } catch (error) {
            console.error("Error reconnecting to Perforce:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to reconnect to Perforce",
            };
        }
    }

    /**
     * Disconnect from Perforce server
     */
    public disconnect(): void {
        this.isConnected = false;
        this.connectionDetails = {};
        // Clear stored connection data
        this.clearStoredConnection();
        this.clearStoredCredentials();
    }

    /**
     * Check if connected to Perforce server
     */
    public getConnectionStatus(): { isConnected: boolean; details: Partial<P4Config> } {
        return {
            isConnected: this.isConnected,
            details: this.connectionDetails,
        };
    }

    /**
     * Get list of files checked out in the current workspace
     */
    public async getCheckedOutFiles(): Promise<{
        success: boolean;
        message: string;
        files?: P4CheckedOutFile[];
    }> {
        try {
            if (!this.isConnected) {
                return {
                    success: false,
                    message: "Not connected to Perforce server",
                };
            }

            const response = await fetch("/api/p4/files/opened", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to get checked out files");
            }

            // If we have files, add local paths to them
            if (data.files?.length > 0) {
                const filesWithLocalPaths = await this.mapFilesToLocalPaths(data.files);
                return {
                    success: true,
                    message: filesWithLocalPaths.length > 0 ? `Successfully retrieved ${filesWithLocalPaths.length} checked out files` : "No files are currently checked out",
                    files: filesWithLocalPaths,
                };
            }

            return {
                success: true,
                message: data.files.length > 0 ? `Successfully retrieved ${data.files.length} checked out files` : "No files are currently checked out",
                files: data.files || [],
            };
        } catch (error) {
            console.error("Error getting checked out files:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Unknown error occurred",
            };
        }
    }

    /**
     * Get list of files that are modified but not checked out
     */
    public async getModifiedFiles(): Promise<{
        success: boolean;
        message: string;
        files?: P4ModifiedFile[];
    }> {
        try {
            if (!this.isConnected) {
                return {
                    success: false,
                    message: "Not connected to Perforce server",
                };
            }

            const response = await fetch("/api/p4/files/modified", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to get modified files");
            }

            return {
                success: true,
                message: data.files.length > 0 ? `Found ${data.files.length} modified files not checked out` : "No modified files found",
                files: data.files || [],
            };
        } catch (error) {
            console.error("Error getting modified files:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Unknown error occurred",
            };
        }
    }

    /**
     * Map depot file paths to local (client) file paths
     */
    private async mapFilesToLocalPaths(files: P4CheckedOutFile[]): Promise<P4CheckedOutFile[]> {
        if (!files || files.length === 0) {
            return [];
        }

        try {
            // Extract depot file paths
            const depotPaths = files.map((file) => file.depotFile);
            console.log(`Mapping ${depotPaths.length} files from depot to client paths`);

            // Call the API to get mappings
            const response = await fetch("/api/p4/files/where", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ files: depotPaths }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                console.error("Failed to map files:", data.error || "Unknown error");
                return files; // Return original files if mapping fails
            }

            // Check if we got a valid pathMap
            if (!data.pathMap || typeof data.pathMap !== "object") {
                console.error("Invalid pathMap returned:", data.pathMap);
                return files;
            }

            // Log some debug info
            console.log(`Received mappings for ${Object.keys(data.pathMap).length} files`);

            // Add local path to each file
            const mappedFiles = files.map((file) => {
                const clientFile = data.pathMap[file.depotFile];
                if (!clientFile) {
                    console.log(`No mapping found for ${file.depotFile}`);
                }
                return {
                    ...file,
                    clientFile: clientFile || "", // Use empty string if no mapping
                };
            });

            // Log how many files actually got mapped
            const mappedCount = mappedFiles.filter((f) => !!f.clientFile).length;
            console.log(`Successfully mapped ${mappedCount} of ${files.length} files`);

            return mappedFiles;
        } catch (error) {
            console.error("Error mapping files to local paths:", error);
            return files; // Return original files if error occurs
        }
    }

    /**
     * Save connection details to localStorage (no credentials)
     */
    private saveConnectionToStorage(): void {
        try {
            if (typeof window !== "undefined") {
                localStorage.setItem(P4_CONNECTION_KEY, JSON.stringify(this.connectionDetails));
            }
        } catch (error) {
            console.error("Failed to save connection to localStorage:", error);
        }
    }

    /**
     * Save credentials to sessionStorage (includes password, cleared when browser closes)
     */
    private saveCredentialsToSession(config: P4Config): void {
        try {
            if (typeof window !== "undefined") {
                sessionStorage.setItem(P4_CREDENTIALS_KEY, JSON.stringify(config));
            }
        } catch (error) {
            console.error("Failed to save credentials to sessionStorage:", error);
        }
    }

    /**
     * Get stored credentials from sessionStorage
     */
    private getStoredCredentials(): P4Config | null {
        try {
            if (typeof window !== "undefined") {
                const storedData = sessionStorage.getItem(P4_CREDENTIALS_KEY);
                if (storedData) {
                    return JSON.parse(storedData) as P4Config;
                }
            }
            return null;
        } catch (error) {
            console.error("Failed to get credentials from sessionStorage:", error);
            return null;
        }
    }

    /**
     * Clear stored credentials from sessionStorage
     */
    private clearStoredCredentials(): void {
        try {
            if (typeof window !== "undefined") {
                sessionStorage.removeItem(P4_CREDENTIALS_KEY);
            }
        } catch (error) {
            console.error("Failed to clear credentials from sessionStorage:", error);
        }
    }

    /**
     * Get stored connection from localStorage
     */
    private getStoredConnection(): Partial<P4Config> | null {
        try {
            if (typeof window !== "undefined") {
                const storedData = localStorage.getItem(P4_CONNECTION_KEY);
                if (storedData) {
                    return JSON.parse(storedData) as Partial<P4Config>;
                }
            }
            return null;
        } catch (error) {
            console.error("Failed to get connection from localStorage:", error);
            return null;
        }
    }

    /**
     * Clear stored connection from localStorage
     */
    private clearStoredConnection(): void {
        try {
            if (typeof window !== "undefined") {
                localStorage.removeItem(P4_CONNECTION_KEY);
            }
        } catch (error) {
            console.error("Failed to clear connection from localStorage:", error);
        }
    }

    /**
     * Restore connection from localStorage if available
     */
    private restoreConnectionFromStorage(): void {
        const storedConnection = this.getStoredConnection();
        if (storedConnection && storedConnection.port && storedConnection.user) {
            this.isConnected = true;
            this.connectionDetails = storedConnection;
        }
    }

    /**
     * Log a P4 command execution
     */
    public logCommand(command: string): void {
        try {
            // Get existing logs
            const existingLogsJson = localStorage.getItem(P4_COMMAND_LOGS_KEY);
            const existingLogs: P4CommandLog[] = existingLogsJson ? JSON.parse(existingLogsJson) : [];

            // Add new log entry
            const newLog: P4CommandLog = {
                command,
                timestamp: new Date().toISOString(),
            };

            // Add to the beginning of the array (most recent first)
            const updatedLogs = [newLog, ...existingLogs];

            // Keep only the most recent MAX_COMMAND_LOGS entries
            const trimmedLogs = updatedLogs.slice(0, MAX_COMMAND_LOGS);

            // Save back to localStorage
            localStorage.setItem(P4_COMMAND_LOGS_KEY, JSON.stringify(trimmedLogs));
        } catch (error) {
            console.error("Error logging P4 command:", error);
        }
    }

    /**
     * Get all logged P4 commands
     */
    public getCommandLogs(): P4CommandLog[] {
        try {
            const logsJson = localStorage.getItem(P4_COMMAND_LOGS_KEY);
            return logsJson ? JSON.parse(logsJson) : [];
        } catch (error) {
            console.error("Error getting P4 command logs:", error);
            return [];
        }
    }

    /**
     * Clear all command logs
     */
    public clearCommandLogs(): void {
        localStorage.removeItem(P4_COMMAND_LOGS_KEY);
    }
}
