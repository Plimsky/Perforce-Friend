import { NextResponse } from "next/server";
import { P4ModifiedFile } from "../../../../../types/p4";

// Set to true to use mock data instead of executing p4 command
const USE_MOCK_DATA = false;

// Mock data for modified files
const mockModifiedFiles: P4ModifiedFile[] = [
    {
        depotFile: "//depot/main/src/modified_app.js",
        clientFile: "C:/workspace/src/modified_app.js",
        localFile: "C:/workspace/src/modified_app.js",
        status: "edit",
        type: "text",
    },
    {
        depotFile: "//depot/main/src/utils/helpers_modified.js",
        clientFile: "C:/workspace/src/utils/helpers_modified.js",
        localFile: "C:/workspace/src/utils/helpers_modified.js",
        status: "add",
        type: "text",
    },
    {
        depotFile: "//depot/main/config/settings_modified.json",
        clientFile: "C:/workspace/config/settings_modified.json",
        localFile: "C:/workspace/config/settings_modified.json",
        status: "delete",
        type: "text",
    },
];

// Cache expiration time in milliseconds (60 minutes)
const CACHE_EXPIRY_MS = 60 * 60 * 1000;

// Import event emitter for command logging
const { EventEmitter } = require("events");
const p4CommandEmitter = new EventEmitter();

// Function to log detailed p4 reconcile commands
function logDetailedP4Command(command: string, details: any = {}) {
    const timestamp = new Date().toISOString();

    // Format the command log with details included
    const formattedDetails = Object.entries(details)
        .filter(([key, value]) => key !== "type" && key !== "command" && key !== "timestamp")
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ");

    const fullCommandLog = formattedDetails ? `${command} [${formattedDetails}]` : command;

    console.log(`[P4 COMMAND LOG] ${timestamp} - ${fullCommandLog}`);

    // For client-side usage, we'll just attach this to the response
    return {
        timestamp,
        command: fullCommandLog,
        rawCommand: command,
        ...details,
    };
}

/**
 * Parse the output of 'p4 reconcile -n' command into structured data
 * This command lists all files that have been modified locally but not checked out
 */
function parseP4ReconcileOutput(output: string, maxFiles: number = 0): P4ModifiedFile[] {
    if (!output || output.trim() === "") {
        return [];
    }

    console.log("[DEBUG] Raw p4 reconcile output length:", output.length);

    const lines = output.trim().split("\n");
    console.log("[DEBUG] Number of lines to process:", lines.length);

    const files: P4ModifiedFile[] = [];

    // Process only up to maxFiles if specified
    const linesToProcess = maxFiles > 0 ? lines.slice(0, maxFiles) : lines;

    for (const line of linesToProcess) {
        // Trim any carriage returns or whitespace
        const cleanLine = line.trim();

        // Example output formats from reconcile:
        // - reconcile edit //depot/path/file.ext#1
        // - reconcile add //depot/path/newfile.txt
        // - reconcile delete //depot/path/oldfile.txt#3
        // - //depot/path/file.ext#1 - opened for delete
        try {
            // Try different patterns for reconcile output
            let action = "";
            let depotFile = "";

            // Pattern 1: "reconcile action //depot/path/file.ext#rev"
            const reconcileMatch = cleanLine.match(/^(?:\w+\s+)?reconcile\s+(\w+)\s+(.+?)(?:#\d+)?$/i);

            // Pattern 2: "//depot/path/file.ext#rev - opened for action"
            const openedMatch = cleanLine.match(/^(.+?)(?:#\d+)?\s+-\s+opened\s+for\s+(\w+)$/i);

            if (reconcileMatch) {
                action = reconcileMatch[1].toLowerCase();
                depotFile = reconcileMatch[2];
            } else if (openedMatch) {
                depotFile = openedMatch[1];
                action = openedMatch[2].toLowerCase();
            } else {
                continue; // Skip lines that don't match either pattern
            }

            // Skip if we couldn't extract what we need
            if (!depotFile || !action) continue;

            files.push({
                depotFile,
                clientFile: "", // Will be populated by p4 where
                localFile: "", // Will be populated by p4 where
                status: action,
                type: "text", // Default type, will be populated later if possible
            });
        } catch (error) {
            console.error("[DEBUG] Error parsing reconcile line:", error);
        }
    }

    console.log("[DEBUG] Total reconciled files parsed:", files.length);
    return files;
}

/**
 * Generate a cache key based on the client root and inclusion folders
 */
function getCacheKey(clientRoot: string, inclusionFolders: string[] = []): string {
    // Normalize client root path for consistent keys
    const normalizedRoot = clientRoot.replace(/\\/g, "/").toLowerCase();

    // Include folders in the cache key for different folder combinations
    const foldersKey = inclusionFolders.length > 0 ? "_" + inclusionFolders.map((f) => f.replace(/[\/\\]/g, "_")).join("_") : "";

    return `p4reconcile_${normalizedRoot.replace(/[\/\\:]/g, "_")}${foldersKey}`;
}

/**
 * Get cached reconcile results if available and not expired
 */
function getCachedReconcileResults(
    fs: any,
    path: any,
    os: any,
    clientRoot: string,
    inclusionFolders: string[] = [],
): {
    output: string | null;
    cacheFile: string;
    whereCacheFile: string;
    metadata: any;
} {
    try {
        // Create temp directory for cache if it doesn't exist
        const tempDir = path.join(os.tmpdir(), "perforce-friend-cache");
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Generate cache file name based on client root
        const cacheKey = getCacheKey(clientRoot, inclusionFolders);
        const cacheFile = path.join(tempDir, `${cacheKey}.txt`);
        const whereCacheFile = path.join(tempDir, `${cacheKey}_where.txt`);
        const metadataFile = path.join(tempDir, `${cacheKey}_metadata.json`);

        let metadata: any = {};
        let creationTime = 0;

        // Check if we have cached metadata and if it's still valid
        if (fs.existsSync(metadataFile)) {
            try {
                const metadataContent = fs.readFileSync(metadataFile, { encoding: "utf8" });
                metadata = JSON.parse(metadataContent);
                if (metadata.timestamp) {
                    creationTime = new Date(metadata.timestamp).getTime();
                }
            } catch (e) {
                console.error("[DEBUG] Error reading cache metadata:", e);
            }
        }

        // Check if cache exists and is not expired
        if (fs.existsSync(cacheFile) && Date.now() - creationTime < CACHE_EXPIRY_MS) {
            console.log("[DEBUG] Using cached reconcile results from:", cacheFile);
            console.log("[DEBUG] Cache age:", (Date.now() - creationTime) / (60 * 1000), "minutes");
            const output = fs.readFileSync(cacheFile, { encoding: "utf8" });
            return { output, cacheFile, whereCacheFile, metadata };
        }

        return { output: null, cacheFile, whereCacheFile, metadata };
    } catch (error) {
        console.error("[DEBUG] Error accessing cache:", error);
        return { output: null, cacheFile: "", whereCacheFile: "", metadata: {} };
    }
}

/**
 * Saves reconcile results to cache, appending if data exists for other folders
 */
function saveReconcileResultsToCache(fs: any, path: any, tempFile: string, cacheFile: string, clientRoot: string, inclusionFolders: string[] = [], isAppend: boolean = false): void {
    try {
        const tempDir = path.dirname(cacheFile);
        const metadataFile = path.join(tempDir, `${getCacheKey(clientRoot, inclusionFolders)}_metadata.json`);

        // Read existing metadata if available
        let metadata: any = {
            timestamp: new Date().toISOString(),
            clientRoot,
            inclusionFolders,
            processedFolders: inclusionFolders,
        };

        if (isAppend && fs.existsSync(metadataFile)) {
            try {
                const existingMetadata = JSON.parse(fs.readFileSync(metadataFile, { encoding: "utf8" }));
                // Keep the original timestamp - don't reset the 60-min cache time
                if (existingMetadata.timestamp) {
                    metadata.timestamp = existingMetadata.timestamp;
                }

                // Track which folders we've processed
                if (existingMetadata.processedFolders) {
                    const existingFolders = existingMetadata.processedFolders;
                    // Use Array.from to avoid Set iteration issues
                    metadata.processedFolders = Array.from(new Set([...existingFolders, ...inclusionFolders]));
                }
            } catch (e) {
                console.error("[DEBUG] Error reading existing metadata:", e);
            }
        }

        if (isAppend && fs.existsSync(cacheFile)) {
            // Append to existing cache file instead of overwriting
            const newContent = fs.readFileSync(tempFile, { encoding: "utf8" });
            fs.appendFileSync(cacheFile, newContent);
            console.log("[DEBUG] Appended reconcile results to cache:", cacheFile);
        } else {
            // Create or overwrite the cache file
            fs.copyFileSync(tempFile, cacheFile);
            console.log("[DEBUG] Saved reconcile results to cache:", cacheFile);
        }

        // Save updated metadata
        fs.writeFileSync(metadataFile, JSON.stringify(metadata), { encoding: "utf8" });
    } catch (error) {
        console.error("[DEBUG] Error saving to cache:", error);
    }
}

// Function to sanitize paths for use in p4 commands
function sanitizePathForP4Command(folderPath: string): string {
    // First ensure there are no query parameters
    const queryParamIndex = folderPath.indexOf("?");
    if (queryParamIndex > 0) {
        folderPath = folderPath.substring(0, queryParamIndex);
    }

    // Remove any trailing slashes
    folderPath = folderPath.replace(/[\/\\]$/, "");

    // Ensure Windows paths use backslashes consistently
    // This is important for Perforce which prefers native path separators
    if (folderPath.includes(":\\")) {
        folderPath = folderPath.replace(/\//g, "\\");
    }

    return folderPath;
}

export async function GET(req: Request) {
    try {
        console.log("[DEBUG] GET /api/p4/files/modified called");

        // Collect command logs for returning to the client
        const commandLogs: any[] = [];

        // Extract the clientRoot if provided as a search parameter
        const url = new URL(req.url);
        let clientRoot = url.searchParams.get("clientRoot") || "";

        // Get inclusion folders if provided
        const inclusionFoldersParam = url.searchParams.get("inclusionFolders") || "";
        const inclusionFolders = inclusionFoldersParam
            ? inclusionFoldersParam
                  .split(",")
                  .map((folder) => {
                      // Clean the folder path - remove any query parameters
                      let cleanPath = folder.trim();

                      // Check for query parameters and remove them
                      const queryParamIndex = cleanPath.indexOf("?");
                      if (queryParamIndex > 0) {
                          console.log(`[DEBUG] Removing query params from folder path: ${cleanPath}`);
                          cleanPath = cleanPath.substring(0, queryParamIndex);
                      }

                      return cleanPath;
                  })
                  .filter((folder) => folder)
            : [];

        console.log("[DEBUG] Processed inclusion folders:", inclusionFolders);

        // Get the maxFiles parameter to limit results (client-side limit)
        const maxFiles = parseInt(url.searchParams.get("maxFiles") || "1000", 10);

        // Check if we should force refresh the cache
        const forceRefresh = url.searchParams.get("forceRefresh") === "true";

        if (USE_MOCK_DATA) {
            console.log("[DEBUG] Using mock data instead of executing p4 command");
            return NextResponse.json({
                success: true,
                files: mockModifiedFiles,
                fromCache: false,
            });
        }

        try {
            console.log("[DEBUG] Preparing to get modified files");

            // Import here to avoid issues with server-side rendering
            const { execSync, spawn } = require("child_process");
            const { promisify } = require("util");
            const fs = require("fs");
            const os = require("os");
            const path = require("path");

            // Check if p4 is available
            try {
                const p4Version = execSync("p4 -V", { encoding: "utf8", maxBuffer: 1024 * 1024 });
                console.log("[DEBUG] P4 version:", p4Version);
            } catch (verError) {
                console.error("[DEBUG] P4 command not available:", verError);
                return NextResponse.json(
                    {
                        success: false,
                        error: "Perforce command-line client (p4) is not available on the server",
                        files: [],
                    },
                    { status: 500 },
                );
            }

            // Check Perforce client info to get the clientRoot if not provided
            if (!clientRoot) {
                try {
                    const clientInfo = execSync("p4 info", { encoding: "utf8", maxBuffer: 1024 * 1024 });
                    console.log("[DEBUG] P4 client info received");

                    // Try to extract client root from p4 info
                    const rootMatch = clientInfo.match(/Client root:\s+(.+)/i);
                    if (rootMatch && rootMatch[1]) {
                        clientRoot = rootMatch[1].trim();
                        console.log("[DEBUG] Extracted client root:", clientRoot);
                    }
                } catch (infoError) {
                    console.error("[DEBUG] Error getting p4 info:", infoError);
                }
            }

            if (!clientRoot) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "No Perforce client root specified or found",
                        files: [],
                    },
                    { status: 400 },
                );
            }

            // Create a temporary output file for the reconcile command
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, `p4reconcile_${Date.now()}.txt`);

            console.log("[DEBUG] Using temporary file for output:", tempFile);

            // Check for cached results if not forcing refresh
            let output = null;
            let fromCache = false;
            let cacheFile = "";
            let whereCacheFile = "";
            let metadata = {};

            if (!forceRefresh) {
                const cachedResults = getCachedReconcileResults(fs, path, os, clientRoot, inclusionFolders);
                output = cachedResults.output;
                cacheFile = cachedResults.cacheFile;
                whereCacheFile = cachedResults.whereCacheFile;
                metadata = cachedResults.metadata;
                fromCache = !!output;
            }

            // If no cache or forcing refresh, run the reconcile command
            if (!output) {
                try {
                    // If no specific inclusion folders, run on the entire client root
                    if (inclusionFolders.length === 0) {
                        // Build reconcile command with redirection to file
                        // Use -m flag for timestamp comparison to optimize performance
                        const reconcileCmd = `cd "${clientRoot}" && p4 reconcile -m -n ... > "${tempFile}"`;

                        // Log the command for debugging
                        const fullCommand = `p4 reconcile -m -n ... (from: ${clientRoot})`;
                        const logEntry = logDetailedP4Command(fullCommand, {
                            type: "reconcile",
                            clientRoot,
                            tempFile,
                            startTime: new Date().toISOString(),
                        });
                        commandLogs.push(logEntry);

                        console.log("[DEBUG] Executing command:", reconcileCmd);

                        const startTime = Date.now();

                        // Use execSync with a large buffer size and shell option
                        execSync(reconcileCmd, {
                            encoding: "utf8",
                            shell: true,
                            maxBuffer: 100 * 1024 * 1024, // 100MB buffer
                        });

                        const endTime = Date.now();
                        const executionTime = (endTime - startTime) / 1000; // in seconds

                        // Log completion with timing information
                        const completionLog = logDetailedP4Command(`${fullCommand} - COMPLETED`, {
                            type: "reconcile",
                            clientRoot,
                            executionTime: `${executionTime}s`,
                            status: "success",
                        });
                        commandLogs.push(completionLog);

                        // Read the output from the temporary file
                        output = fs.readFileSync(tempFile, { encoding: "utf8" });

                        // Save the results to cache for future use
                        if (cacheFile) {
                            saveReconcileResultsToCache(fs, path, tempFile, cacheFile, clientRoot, inclusionFolders, false);
                        }
                    } else {
                        // Run reconcile on each inclusion folder separately
                        console.log("[DEBUG] Running reconcile on specific folders:", inclusionFolders);

                        // Create or clear the cache file if it doesn't exist from a previous run
                        if (cacheFile && (!fs.existsSync(cacheFile) || forceRefresh)) {
                            fs.writeFileSync(cacheFile, "", { encoding: "utf8" });
                        }

                        // Run reconcile for each folder individually
                        let combinedOutput = "";

                        for (const folderPath of inclusionFolders) {
                            try {
                                // Use the provided path directly - it should already be absolute from the client
                                const reconcilePath = sanitizePathForP4Command(folderPath);

                                console.log("[DEBUG] Processing folder:", reconcilePath);

                                // Skip if folder doesn't exist
                                if (!fs.existsSync(reconcilePath)) {
                                    console.log("[DEBUG] Folder doesn't exist, skipping:", reconcilePath);
                                    const skipLog = logDetailedP4Command(`p4 reconcile -n ${reconcilePath}\\... - SKIPPED`, {
                                        type: "reconcile",
                                        folder: reconcilePath,
                                        status: "skipped",
                                        reason: "Folder does not exist",
                                    });
                                    commandLogs.push(skipLog);
                                    continue;
                                }

                                // Create a temporary file for this folder's output
                                const folderTempFile = path.join(tempDir, `p4reconcile_${Date.now()}_${path.basename(reconcilePath)}.txt`);

                                // Run p4 reconcile -n directly on this folder
                                // Don't use quotes around the path and add ... for recursive scanning
                                const folderCmd = `p4 reconcile -n ${reconcilePath}\\... > "${folderTempFile}"`;

                                // Log the command for debugging
                                const logCommand = `p4 reconcile -n ${reconcilePath}\\...`;
                                const startLog = logDetailedP4Command(logCommand, {
                                    type: "reconcile",
                                    folder: reconcilePath,
                                    tempFile: folderTempFile,
                                    startTime: new Date().toISOString(),
                                });
                                commandLogs.push(startLog);

                                console.log("[DEBUG] Executing command:", folderCmd);

                                const startTime = Date.now();

                                execSync(folderCmd, {
                                    encoding: "utf8",
                                    shell: true,
                                    maxBuffer: 100 * 1024 * 1024, // 100MB buffer
                                });

                                const endTime = Date.now();
                                const executionTime = (endTime - startTime) / 1000; // in seconds

                                // Read this folder's output
                                const folderOutput = fs.readFileSync(folderTempFile, { encoding: "utf8" });
                                const numLines = folderOutput.split("\n").length;

                                // Log completion with timing and result information
                                const completionLog = logDetailedP4Command(`${logCommand} - COMPLETED`, {
                                    type: "reconcile",
                                    folder: reconcilePath,
                                    executionTime: `${executionTime}s`,
                                    linesOfOutput: numLines,
                                    outputSize: `${folderOutput.length} bytes`,
                                    status: "success",
                                });
                                commandLogs.push(completionLog);

                                combinedOutput += folderOutput + "\n";

                                // Append to the cache file
                                if (cacheFile) {
                                    if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 0) {
                                        // Append to existing cache file
                                        fs.appendFileSync(cacheFile, folderOutput);
                                        console.log("[DEBUG] Appended results for folder to cache:", folderPath);
                                    } else {
                                        // First folder, create the cache file
                                        fs.writeFileSync(cacheFile, folderOutput);
                                        console.log("[DEBUG] Created cache file with results for folder:", folderPath);
                                    }

                                    // Update metadata to track which folders we've processed
                                    const metadataFile = path.join(path.dirname(cacheFile), `${getCacheKey(clientRoot, inclusionFolders)}_metadata.json`);
                                    let metadata = {
                                        timestamp: new Date().toISOString(),
                                        clientRoot,
                                        inclusionFolders,
                                        processedFolders: [folderPath],
                                    };

                                    if (fs.existsSync(metadataFile)) {
                                        try {
                                            const existingMetadata = JSON.parse(fs.readFileSync(metadataFile, { encoding: "utf8" }));
                                            // Keep the original timestamp
                                            if (existingMetadata.timestamp) {
                                                metadata.timestamp = existingMetadata.timestamp;
                                            }

                                            // Track which folders we've processed
                                            if (existingMetadata.processedFolders) {
                                                const existingFolders = existingMetadata.processedFolders;
                                                // Use Array.from to avoid Set iteration issues
                                                metadata.processedFolders = Array.from(new Set([...existingFolders, folderPath]));
                                            }
                                        } catch (e) {
                                            console.error("[DEBUG] Error reading existing metadata:", e);
                                        }
                                    }

                                    // Save updated metadata
                                    fs.writeFileSync(metadataFile, JSON.stringify(metadata), { encoding: "utf8" });
                                }

                                // Clean up temp file
                                try {
                                    fs.unlinkSync(folderTempFile);
                                } catch (e) {
                                    console.error("[DEBUG] Error removing temp file:", e);
                                }
                            } catch (folderError: any) {
                                console.error("[DEBUG] Error processing folder:", folderPath, folderError);

                                // Log error - use sanitized path
                                const sanitizedPath = sanitizePathForP4Command(folderPath);
                                const errorLog = logDetailedP4Command(`p4 reconcile -n ${sanitizedPath}\\... - FAILED`, {
                                    type: "reconcile",
                                    folder: folderPath,
                                    status: "error",
                                    error: folderError.message || "Unknown error",
                                });
                                commandLogs.push(errorLog);
                            }
                        }

                        output = combinedOutput;
                    }
                } catch (cmdError: any) {
                    console.error("[DEBUG] P4 command error:", cmdError);

                    // Try to read any partial output that might have been written
                    try {
                        if (fs.existsSync(tempFile)) {
                            const partialOutput = fs.readFileSync(tempFile, { encoding: "utf8" });
                            if (partialOutput.trim()) {
                                output = partialOutput;
                                console.log("[DEBUG] Using partial output from failed command");
                            }
                        }
                    } catch (readError) {
                        console.error("[DEBUG] Error reading partial output:", readError);
                    }

                    // If we couldn't get any output, handle the error
                    if (!output) {
                        // Extract useful information from error message
                        const errorMsg = cmdError.message || "";
                        let userError = "Failed to execute Perforce command";
                        let details = "";

                        if (errorMsg.includes("not under client's root")) {
                            userError = "Current directory is not in your Perforce workspace";
                            // Try to extract the client root from error message
                            const rootMatch = errorMsg.match(/client's root '([^']+)'/);
                            if (rootMatch && rootMatch[1]) {
                                details = `Your Perforce workspace is located at: ${rootMatch[1]}`;
                            }
                        } else if (errorMsg.includes("file(s) not in client view")) {
                            userError = "No files in current directory are mapped in your Perforce workspace";
                        } else if (errorMsg.includes("not logged in")) {
                            userError = "Not logged in to Perforce server";
                        } else if (errorMsg.includes("ENOBUFS")) {
                            userError = "Output buffer exceeded";
                            details = "Your workspace contains too many files. Try specifying a smaller maxFiles parameter.";
                        } else if (errorMsg.includes("ETIMEDOUT") || errorMsg.includes("timeout")) {
                            userError = "Command timed out";
                            details = "The p4 reconcile command took too long to complete. This could be due to a very large workspace or slow network connection.";
                        }

                        return NextResponse.json(
                            {
                                success: false,
                                error: userError,
                                details: details || errorMsg,
                                files: [],
                                commandLogs,
                            },
                            { status: 500 },
                        );
                    }
                }
            }

            // Process the output - limiting to maxFiles in the parser
            const files = parseP4ReconcileOutput(output, maxFiles);
            console.log(`[DEBUG] Parsed reconciled files (limited to ${maxFiles}):`);

            // If we have some files, try to get their local paths
            if (files.length > 0) {
                try {
                    // See if we have cached where results
                    let whereOutput = null;

                    if (fromCache && fs.existsSync(whereCacheFile)) {
                        try {
                            whereOutput = fs.readFileSync(whereCacheFile, { encoding: "utf8" });
                            console.log("[DEBUG] Using cached 'where' results");
                        } catch (e) {
                            console.error("[DEBUG] Error reading cached 'where' results:", e);
                        }
                    }

                    // If no cached where results, run the where command
                    if (!whereOutput) {
                        // Write depot paths to a temp file instead of using echo
                        const depotPathsFile = path.join(tempDir, `p4where_${Date.now()}.txt`);
                        fs.writeFileSync(depotPathsFile, files.map((file) => file.depotFile).join("\n"));

                        // Execute 'p4 where' with the file as input
                        let whereCmd = "";
                        if (clientRoot) {
                            whereCmd = `cd "${clientRoot}" && p4 -ztag where < "${depotPathsFile}" > "${tempFile}"`;
                        } else {
                            whereCmd = `p4 -ztag where < "${depotPathsFile}" > "${tempFile}"`;
                        }

                        execSync(whereCmd, {
                            encoding: "utf8",
                            shell: true,
                            maxBuffer: 100 * 1024 * 1024, // 100MB buffer
                            // No timeout for this command either
                        });

                        // Read the output from the temporary file
                        whereOutput = fs.readFileSync(tempFile, { encoding: "utf8" });

                        // Save the where results to cache if we're using cache
                        if (fromCache && whereCacheFile) {
                            try {
                                fs.copyFileSync(tempFile, whereCacheFile);
                                console.log("[DEBUG] Saved 'where' results to cache");
                            } catch (e) {
                                console.error("[DEBUG] Error saving 'where' results to cache:", e);
                            }
                        }

                        // Clean up temp files
                        try {
                            fs.unlinkSync(depotPathsFile);
                        } catch (e) {
                            console.error("[DEBUG] Error removing temporary depot paths file:", e);
                        }
                    }

                    // Parse where output and update file paths
                    const pathMap: Record<string, { clientFile: string; localFile: string }> = {};

                    // Parse the output based on p4 -ztag format
                    const fileInfos = whereOutput.split("... depotFile").slice(1);

                    for (const fileInfo of fileInfos) {
                        const lines = fileInfo.trim().split("\n");
                        let depotPath = "";
                        let clientPath = "";
                        let localPath = "";

                        for (const line of lines) {
                            if (line.startsWith("//")) {
                                depotPath = line.trim().replace("...", "");
                            } else if (line.startsWith("... clientFile")) {
                                clientPath = line.replace("... clientFile ", "").trim();
                            } else if (line.startsWith("... path")) {
                                localPath = line.replace("... path ", "").trim();
                            }
                        }

                        if (depotPath) {
                            pathMap[depotPath] = {
                                clientFile: clientPath.replace("...", ""),
                                localFile: localPath.replace("...", "") || clientPath.replace("...", ""), // Fallback to client path if local not found
                            };
                        }
                    }

                    // Update files with client and local paths
                    files.forEach((file) => {
                        // find the depotFile in the pathMap by checking if the depotFile starts with the same string
                        const matchingDepotFile = Object.keys(pathMap).find((key) => file.depotFile.startsWith(key));
                        if (matchingDepotFile) {
                            file.clientFile = file.depotFile.replace(matchingDepotFile, pathMap[matchingDepotFile].clientFile);
                            file.localFile = file.depotFile.replace(matchingDepotFile, pathMap[matchingDepotFile].localFile).replace("/", "\\");
                        }
                    });
                } catch (whereError) {
                    console.error("[DEBUG] Error mapping file paths:", whereError);
                }
            }

            // Clean up temp file
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            } catch (e) {
                console.error("[DEBUG] Error removing temporary output file:", e);
            }

            // Determine if we limited the results
            const originalLineCount = output.split("\n").length;
            const limitApplied = originalLineCount > files.length;

            // Add debug logging for file format
            console.log("[DEBUG] Sample file from API:", files.length > 0 ? JSON.stringify(files[0]) : "No files");

            // Transform files to match ModifiedFile format if needed
            const transformedFiles = files.map((file) => ({
                localPath: file.localFile, // Use localFile as localPath
                localFile: file.localFile, // Keep original property
                depotPath: file.depotFile,
                status: file.status,
                action: file.type || "reconcile", // Use type as action or default to 'reconcile'
            }));

            console.log("[DEBUG] Sample transformed file:", transformedFiles.length > 0 ? JSON.stringify(transformedFiles[0]) : "No files");

            // Include command logs in the response
            return NextResponse.json({
                success: true,
                files: transformedFiles, // Return transformed files
                limitApplied,
                totalFiles: files.length,
                fromCache,
                cacheTime: fromCache ? new Date().toISOString() : null,
                commandLogs,
            });
        } catch (error) {
            console.error("[DEBUG] Error in API route:", error);
            return NextResponse.json({ error: "Failed to fetch modified files", details: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
        }
    } catch (error) {
        console.error("[DEBUG] Error in API route:", error);
        return NextResponse.json({ error: "Failed to fetch modified files", details: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
