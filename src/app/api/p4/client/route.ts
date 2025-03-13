import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { P4Service } from "@/lib/p4Service";

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
        const p4Service = P4Service.getInstance();

        // Get connection status from P4 service
        const status = p4Service.getConnectionStatus();

        // Check if there's a client root in the P4Service
        let clientRoot = p4Service.getClientRoot();

        // Flag to indicate if the client root came from actual Perforce
        let clientRootDetected = !!clientRoot;

        if (!status.isConnected || !clientRoot) {
            // If not connected or no client root, try to reconnect
            const result = await p4Service.reconnect();

            // Check for client root again after reconnect
            clientRoot = p4Service.getClientRoot();
            clientRootDetected = !!clientRoot;

            // If still no client root, try direct detection methods
            if (!clientRoot) {
                // Try various detection methods
                const directlyDetectedRoot = detectClientRoot();

                if (directlyDetectedRoot) {
                    // Store the detected root in the service
                    p4Service.setClientRoot(directlyDetectedRoot);
                    clientRoot = directlyDetectedRoot;
                    clientRootDetected = true;
                    console.log("Client root detected and saved to service:", clientRoot);
                } else {
                    // Try P4CONFIG-based detection as a last resort
                    const configRoot = await findClientRootByP4Config();
                    if (configRoot) {
                        p4Service.setClientRoot(configRoot);
                        clientRoot = configRoot;
                        clientRootDetected = true;
                        console.log("Client root found via P4CONFIG and saved to service:", clientRoot);
                    }
                }
            }

            return NextResponse.json({
                success: result.success,
                clientRoot: clientRoot || "",
                clientRootDetected: clientRootDetected,
                clientName: status.details.client || "",
                user: status.details.user || "",
                port: status.details.port || "",
                message: result.message,
            });
        }

        return NextResponse.json({
            success: true,
            clientRoot: clientRoot || "",
            clientRootDetected: clientRootDetected,
            clientName: status.details.client || "",
            user: status.details.user || "",
            port: status.details.port || "",
        });
    } catch (error) {
        console.error("Error getting client details:", error);

        // Try direct detection as a fallback
        const directlyDetectedRoot = detectClientRoot();
        const p4Service = P4Service.getInstance();

        if (directlyDetectedRoot) {
            // Store the detected root in the service
            p4Service.setClientRoot(directlyDetectedRoot);

            return NextResponse.json({
                success: true,
                clientRoot: directlyDetectedRoot,
                clientRootDetected: true,
                message: "Detected client root directly",
            });
        }

        return NextResponse.json(
            {
                success: false,
                clientRootDetected: false,
                error: error instanceof Error ? error.message : "Unknown error getting client details",
            },
            { status: 500 },
        );
    }
}
