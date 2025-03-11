import { NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Create a temporary P4CONFIG file for authentication
 */
function createP4ConfigFile(config: { port: string; user: string; password: string; client?: string }) {
    try {
        // Create temp directory for p4 config if it doesn't exist
        const tmpDir = path.join(os.tmpdir(), "perforce-friend");
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        // Create or overwrite p4 config file
        const configPath = path.join(tmpDir, "p4config");
        let configContent = `P4PORT=${config.port}\nP4USER=${config.user}\nP4PASSWD=${config.password}`;

        if (config.client) {
            configContent += `\nP4CLIENT=${config.client}`;
        }

        fs.writeFileSync(configPath, configContent);

        return configPath;
    } catch (error) {
        console.error("Error creating P4CONFIG file:", error);
        throw new Error("Failed to create P4CONFIG file");
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { port, user, password, client } = body;

        // Validate required fields
        if (!port || !user || !password) {
            return NextResponse.json({ error: "Missing required Perforce connection parameters" }, { status: 400 });
        }

        // Create temporary P4CONFIG file
        const configPath = createP4ConfigFile({ port, user, password, client });

        try {
            // Test connection with 'p4 info'
            const command = "p4 info";
            const output = execSync(command, {
                env: { ...process.env, P4CONFIG: configPath },
                encoding: "utf8",
            });

            // Extract client root if available
            let clientRoot = "";
            const clientRootMatch = output.match(/Client root:\s+(.+)/);
            if (clientRootMatch && clientRootMatch[1]) {
                clientRoot = clientRootMatch[1].trim();
            }

            // Prepare success response
            const response = NextResponse.json({
                success: true,
                message: "Successfully connected to Perforce server",
                clientRoot,
            });

            return response;
        } catch (execError: any) {
            // Clean up temp file on error
            try {
                fs.unlinkSync(configPath);
            } catch (e) {
                console.error("Error removing temporary P4CONFIG file:", e);
            }

            return NextResponse.json({ error: `Perforce connection failed: ${execError.message}` }, { status: 500 });
        }
    } catch (error) {
        console.error("Error in Perforce connection API:", error);
        return NextResponse.json({ error: "Failed to connect to Perforce server" }, { status: 500 });
    }
}
