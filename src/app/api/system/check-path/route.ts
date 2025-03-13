import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * API endpoint to check if a path exists and provide suggestions
 */
export async function POST(request: Request) {
    try {
        const { path: inputPath } = await request.json();

        if (!inputPath) {
            return NextResponse.json(
                {
                    success: false,
                    error: "No path provided",
                },
                { status: 400 },
            );
        }

        // Normalize path
        const normalizedPath = inputPath.replace(/\\/g, "/");

        // Results object
        const result = {
            success: true,
            exists: false,
            isDirectory: false,
            suggestions: [] as string[],
        };

        try {
            // Check if path exists
            const stats = await fs.stat(normalizedPath);
            result.exists = true;
            result.isDirectory = stats.isDirectory();

            // If it's a directory, get its contents as suggestions
            if (stats.isDirectory()) {
                const items = await fs.readdir(normalizedPath, { withFileTypes: true });
                const directories = items.filter((item) => item.isDirectory()).map((item) => path.join(normalizedPath, item.name).replace(/\\/g, "/"));

                result.suggestions = directories;
            }
        } catch (err) {
            // Path doesn't exist, check if parent directory exists
            try {
                const parentDir = path.dirname(normalizedPath);
                const stats = await fs.stat(parentDir);

                if (stats.isDirectory()) {
                    // Get directories in parent directory as suggestions
                    const items = await fs.readdir(parentDir, { withFileTypes: true });
                    const basename = path.basename(normalizedPath).toLowerCase();

                    // Filter for directories that start with the basename
                    const directories = items.filter((item) => item.isDirectory() && item.name.toLowerCase().startsWith(basename)).map((item) => path.join(parentDir, item.name).replace(/\\/g, "/"));

                    result.suggestions = directories;
                }
            } catch (parentError) {
                // Parent doesn't exist either, provide some standard paths as suggestions
                const homePath = os.homedir().replace(/\\/g, "/");
                const defaultPaths = [
                    homePath,
                    path.join(homePath, "Documents").replace(/\\/g, "/"),
                    path.join(homePath, "Desktop").replace(/\\/g, "/"),
                    path.join(homePath, "Projects").replace(/\\/g, "/"),
                    "C:/Users",
                    "C:/Program Files",
                    "C:/",
                    "D:/",
                ];

                // Filter for paths that exist
                const validPaths = [];
                for (const defaultPath of defaultPaths) {
                    try {
                        await fs.access(defaultPath);
                        validPaths.push(defaultPath);
                    } catch (e) {
                        // Path doesn't exist, skip it
                    }
                }

                result.suggestions = validPaths;
            }
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error("Error checking path:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error checking path",
            },
            { status: 500 },
        );
    }
}
