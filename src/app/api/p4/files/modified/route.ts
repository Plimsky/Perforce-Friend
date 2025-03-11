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

// Cache expiration time in milliseconds (10 minutes)
const CACHE_EXPIRY_MS = 360 * 60 * 1000;

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
 * Generates a unique cache key based on the client root
 */
function getCacheKey(clientRoot: string): string {
    // Create a sanitized version of the client root for use in filenames
    // Replace non-alphanumeric characters with underscores
    const sanitizedRoot = clientRoot
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/__+/g, "_")
        .substring(0, 50); // Limit length to avoid excessively long filenames

    return `p4_reconcile_${sanitizedRoot}`;
}

/**
 * Checks if a cached reconcile result exists and is still valid
 */
function getCachedReconcileResults(fs: any, path: any, os: any, clientRoot: string): { output: string | null; cacheFile: string; whereCacheFile: string } {
    try {
        const tempDir = os.tmpdir();
        const cacheKey = getCacheKey(clientRoot);
        const cacheFile = path.join(tempDir, `${cacheKey}.txt`);
        const whereCacheFile = path.join(tempDir, `${cacheKey}_where.txt`);
        const metadataFile = path.join(tempDir, `${cacheKey}_metadata.json`);

        console.log("[DEBUG] Checking for cached results at:", cacheFile);

        // Check if cache files exist
        if (!fs.existsSync(cacheFile) || !fs.existsSync(metadataFile)) {
            console.log("[DEBUG] Cache file not found");
            return { output: null, cacheFile, whereCacheFile };
        }

        // Read and parse metadata
        const metadata = JSON.parse(fs.readFileSync(metadataFile, { encoding: "utf8" }));
        const cacheTime = new Date(metadata.timestamp);
        const now = new Date();

        // Check if cache is still valid
        if (now.getTime() - cacheTime.getTime() > CACHE_EXPIRY_MS) {
            console.log("[DEBUG] Cache expired, created at:", cacheTime);
            return { output: null, cacheFile, whereCacheFile };
        }

        // Cache is valid, read the actual data
        console.log("[DEBUG] Using cached reconcile output from:", cacheTime);
        const output = fs.readFileSync(cacheFile, { encoding: "utf8" });
        return { output, cacheFile, whereCacheFile };
    } catch (error) {
        console.error("[DEBUG] Error accessing cache:", error);
        return { output: null, cacheFile: "", whereCacheFile: "" };
    }
}

/**
 * Saves reconcile results to cache
 */
function saveReconcileResultsToCache(fs: any, path: any, tempFile: string, cacheFile: string, clientRoot: string): void {
    try {
        const tempDir = path.dirname(cacheFile);
        const metadataFile = path.join(tempDir, `${getCacheKey(clientRoot)}_metadata.json`);

        // Copy the temporary file to the cache file
        fs.copyFileSync(tempFile, cacheFile);

        // Save metadata
        const metadata = {
            timestamp: new Date().toISOString(),
            clientRoot,
        };

        fs.writeFileSync(metadataFile, JSON.stringify(metadata), { encoding: "utf8" });
        console.log("[DEBUG] Saved reconcile results to cache:", cacheFile);
    } catch (error) {
        console.error("[DEBUG] Error saving to cache:", error);
    }
}

export async function GET(req: Request) {
    try {
        console.log("[DEBUG] GET /api/p4/files/modified called");

        // Extract the clientRoot if provided as a search parameter
        const url = new URL(req.url);
        let clientRoot = url.searchParams.get("clientRoot") || "";

        // Get the maxFiles parameter to limit results (client-side limit, not passed to p4)
        const maxFiles = 30000;
        parseInt(url.searchParams.get("maxFiles") || "100", 10);

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

            if (!forceRefresh) {
                const cachedResults = getCachedReconcileResults(fs, path, os, clientRoot);
                output = cachedResults.output;
                cacheFile = cachedResults.cacheFile;
                whereCacheFile = cachedResults.whereCacheFile;
                fromCache = !!output;
            }

            // If no cache or forcing refresh, run the reconcile command
            if (!output) {
                try {
                    // Build reconcile command with redirection to file
                    // Use -m flag for timestamp comparison to optimize performance
                    const reconcileCmd = `cd "${clientRoot}" && p4 reconcile -m -n > "${tempFile}"`;

                    console.log("[DEBUG] Executing command:", reconcileCmd);

                    // Use execSync with a large buffer size and shell option
                    // Remove timeout entirely to allow for large workspaces
                    execSync(reconcileCmd, {
                        encoding: "utf8",
                        shell: true,
                        maxBuffer: 100 * 1024 * 1024, // 100MB buffer
                        // No timeout - let the command run as long as needed
                    });

                    // Read the output from the temporary file
                    output = fs.readFileSync(tempFile, { encoding: "utf8" });

                    // Save the results to cache for future use
                    if (cacheFile) {
                        saveReconcileResultsToCache(fs, path, tempFile, cacheFile, clientRoot);
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

            return NextResponse.json({
                success: true,
                files,
                limitApplied,
                totalFiles: files.length,
                fromCache,
                cacheTime: fromCache ? new Date().toISOString() : null,
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
