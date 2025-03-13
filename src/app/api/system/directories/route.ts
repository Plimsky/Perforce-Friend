import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { readdir, stat } from "fs/promises";

const execAsync = promisify(exec);

// Constants for localStorage keys (matching the frontend)
const EXCLUDED_FOLDERS_KEY = "perforceFriend_excludedFolders";

// Helper function to detect client root
async function detectClientRoot(currentPath?: string): Promise<string | null> {
    try {
        // Try P4CONFIG first
        const { stdout } = await execAsync("p4 set P4CONFIG");
        const p4configMatch = stdout.match(/P4CONFIG=(.*?)(?:\s|$)/);

        if (p4configMatch && p4configMatch[1]) {
            // Find directory with the P4CONFIG file (e.g., .p4config)
            const p4configFile = p4configMatch[1];

            // Start with current path or process.cwd()
            let searchPath = currentPath || process.cwd();

            // If path is provided but doesn't exist, fall back to cwd
            try {
                await fs.stat(searchPath);
            } catch (err) {
                searchPath = process.cwd();
            }

            // Search upwards for P4CONFIG file
            let foundConfig = false;
            let currentSearchPath = searchPath;

            while (!foundConfig && currentSearchPath) {
                try {
                    await fs.access(path.join(currentSearchPath, p4configFile));
                    foundConfig = true;
                } catch (err) {
                    // Go up one directory
                    const parentDir = path.dirname(currentSearchPath);

                    // Stop if we're at the root
                    if (parentDir === currentSearchPath) {
                        break;
                    }

                    currentSearchPath = parentDir;
                }
            }

            if (foundConfig) {
                console.log(`Detected client root: ${currentSearchPath}`);
                return currentSearchPath;
            }
        }

        // If P4CONFIG method fails, try using p4 info
        const { stdout: infoStdout } = await execAsync("p4 info");
        const clientRootMatch = infoStdout.match(/Client root: (.*?)(?:\r?\n|$)/);

        if (clientRootMatch && clientRootMatch[1]) {
            return clientRootMatch[1];
        }

        return null;
    } catch (error) {
        console.error("Error detecting client root:", error);
        return null;
    }
}

// Helper function to get excluded folders from query parameters
function getExcludedFolders(req: NextRequest): string[] {
    // Get excluded folders from query parameter
    const excludedFoldersParam = req.nextUrl.searchParams.get("excludedFolders");

    if (excludedFoldersParam) {
        try {
            return JSON.parse(excludedFoldersParam);
        } catch (error) {
            console.error("Error parsing excludedFolders parameter:", error);
        }
    }

    return [];
}

// Helper function to check if a path should be excluded
function isExcluded(filePath: string, excludedFolders: string[]): boolean {
    // Normalize path for comparison
    const normalizedPath = path.normalize(filePath).toLowerCase();

    // Check if path matches any excluded folder
    return excludedFolders.some((folder) => {
        const normalizedFolder = path.normalize(folder).toLowerCase();
        return normalizedPath.includes(normalizedFolder);
    });
}

// Recursive function to list directories
async function listDirectoriesRecursive(dir: string, excludedFolders: string[], query: string = "", depth: number = 0, maxDepth: number = 3, results: any[] = []): Promise<any[]> {
    try {
        // Don't process excluded directories
        if (isExcluded(dir, excludedFolders)) {
            return results;
        }

        // Read directory contents
        const entries = await fs.readdir(dir, { withFileTypes: true });

        // Process each entry
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(dir, entry.name);

                // If this directory name matches the query, add it to results
                if (!query || entry.name.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        name: entry.name,
                        path: fullPath,
                        isDirectory: true,
                    });
                }

                // Recursively process subdirectories up to maxDepth
                if (depth < maxDepth) {
                    await listDirectoriesRecursive(fullPath, excludedFolders, query, depth + 1, maxDepth, results);
                }
            }
        }

        return results;
    } catch (error) {
        console.error(`Error listing directories in ${dir}:`, error);
        return results;
    }
}

export async function GET(req: NextRequest) {
    try {
        // Get the directory path from query parameter, or use the detected client root
        const directoryParam = req.nextUrl.searchParams.get("directory");
        const searchQuery = req.nextUrl.searchParams.get("query") || "";
        const maxDepthParam = req.nextUrl.searchParams.get("maxDepth") || "3";
        const maxDepth = parseInt(maxDepthParam, 10);

        // Get excluded folders
        const excludedFolders = getExcludedFolders(req);

        // Detect client root if needed
        let directory = directoryParam;
        if (!directory) {
            directory = (await detectClientRoot()) || process.cwd();
        }

        // Make sure the directory exists
        try {
            await fs.access(directory);
        } catch (error) {
            // If the specified directory doesn't exist, fall back to client root
            directory = (await detectClientRoot()) || process.cwd();
        }

        // Instead of listing just immediate directories, use recursive function
        const entries = await listDirectoriesRecursive(directory, excludedFolders, searchQuery, 0, maxDepth);

        // Sort directories alphabetically
        entries.sort((a, b) => a.name.localeCompare(b.name));

        // Always add parent directory option if not at root
        const parentDir = path.dirname(directory);
        if (parentDir !== directory) {
            entries.unshift({
                name: "..",
                path: parentDir,
                isDirectory: true,
            });
        }

        return NextResponse.json({ directories: entries });
    } catch (error) {
        console.error("Error in directories API:", error);
        return NextResponse.json({ error: "Failed to list directories", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { path: dirPath } = await request.json();

        if (!dirPath) {
            return NextResponse.json(
                {
                    success: false,
                    error: "No path provided",
                },
                { status: 400 },
            );
        }

        // Check if path exists
        try {
            const stats = await stat(dirPath);
            if (!stats.isDirectory()) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Path is not a directory",
                    },
                    { status: 400 },
                );
            }
        } catch (error) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Path does not exist",
                },
                { status: 404 },
            );
        }

        // Get directory items
        const items = await readdir(dirPath, { withFileTypes: true });

        // Filter to only directories
        const directories = await Promise.all(
            items
                .filter((item) => item.isDirectory())
                .map(async (item) => {
                    const fullPath = path.join(dirPath, item.name);
                    // Normalize to forward slashes for consistency
                    return fullPath.replace(/\\/g, "/");
                }),
        );

        return NextResponse.json({
            success: true,
            directories,
        });
    } catch (error) {
        console.error("Error listing directories:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to list directories",
            },
            { status: 500 },
        );
    }
}
