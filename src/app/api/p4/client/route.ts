import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * Detects the P4 client root using command line commands
 */
function detectClientRoot(): string | null {
    try {
        // Try to get client root using p4 info
        const output = execSync("p4 info", { encoding: "utf8" });
        const clientRootMatch = output.match(/Client root: (.*?)(?:\r?\n|$)/);

        if (clientRootMatch && clientRootMatch[1]) {
            const detectedRoot = clientRootMatch[1].trim();
            console.log(`Detected client root from p4 info: ${detectedRoot}`);
            return detectedRoot;
        }

        return null;
    } catch (error) {
        console.error("Error detecting client root:", error);
        return null;
    }
}

/**
 * Attempts to find a client root by looking for a P4CONFIG file in current and parent directories
 */
async function findClientRootByP4Config(): Promise<string | null> {
    try {
        // Try P4CONFIG first
        const output = execSync("p4 set P4CONFIG", { encoding: "utf8" });
        const p4configMatch = output.match(/P4CONFIG=(.*?)(?:\s|$)/);

        if (p4configMatch && p4configMatch[1]) {
            // Find directory with the P4CONFIG file (e.g., .p4config)
            const p4configFile = p4configMatch[1];

            // Start with current directory
            let searchPath = process.cwd();

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
                console.log(`Detected client root by P4CONFIG: ${currentSearchPath}`);
                return currentSearchPath;
            }
        }

        return null;
    } catch (error) {
        console.error("Error finding client root by P4CONFIG:", error);
        return null;
    }
}

/**
 * API route to get the current Perforce client root
 */
export async function GET() {
    try {
        // Try different methods to detect client root
        let clientRoot = detectClientRoot();

        // If p4 info didn't work, try looking for P4CONFIG
        if (!clientRoot) {
            clientRoot = await findClientRootByP4Config();
        }

        // If all else fails, use current directory
        if (!clientRoot) {
            clientRoot = process.cwd();
            console.log(`Using current directory as fallback: ${clientRoot}`);
        }

        return NextResponse.json({
            success: true,
            clientRoot,
        });
    } catch (error) {
        console.error("Error in client API:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                // Still include cwd as last resort
                clientRoot: process.cwd(),
            },
            { status: 500 },
        );
    }
}
