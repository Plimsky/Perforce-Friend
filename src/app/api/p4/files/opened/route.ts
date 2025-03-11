import { NextResponse } from "next/server";
import { P4CheckedOutFile } from "../../../../../types/p4";

// Set to true to use mock data instead of executing p4 command
const USE_MOCK_DATA = false;

// Mock data for checked out files
const mockCheckedOutFiles: P4CheckedOutFile[] = [
    {
        depotFile: "//depot/main/src/app.js",
        clientFile: "C:/workspace/src/app.js",
        rev: "5",
        action: "edit",
        type: "text",
        change: "default",
        user: "developer1",
        client: "workspace1",
    },
    {
        depotFile: "//depot/main/src/utils/helpers.js",
        clientFile: "C:/workspace/src/utils/helpers.js",
        rev: "12",
        action: "edit",
        type: "text",
        change: "default",
        user: "developer1",
        client: "workspace1",
    },
    {
        depotFile: "//depot/main/config/settings.json",
        clientFile: "C:/workspace/config/settings.json",
        rev: "3",
        action: "edit",
        type: "text",
        change: "default",
        user: "developer1",
        client: "workspace1",
    },
];

/**
 * Parse the output of 'p4 opened' command into structured data
 */
function parseP4OpenedOutput(output: string): P4CheckedOutFile[] {
    if (!output || output.trim() === "") {
        return [];
    }

    console.log("[DEBUG] Raw p4 opened output:", output);

    const lines = output.trim().split("\n");
    const files: P4CheckedOutFile[] = [];

    for (const line of lines) {
        // Trim any carriage returns or whitespace
        const cleanLine = line.trim();
        console.log("[DEBUG] Processing line:", cleanLine);

        // Fix for actual Perforce output format
        try {
            // Match parts of the line
            const fileRevMatch = cleanLine.match(/^(.+?)#(\d+)/);
            const actionMatch = cleanLine.match(/- (\w+)/);
            const changeMatch = cleanLine.match(/(default|change\s+\d+)/);
            const typeMatch = cleanLine.match(/\((.+?)\)/);
            const userClientMatch = cleanLine.match(/by\s+(.+?)(?:@(.+?))?$/);

            if (fileRevMatch) {
                const depotFile = fileRevMatch[1];
                const rev = fileRevMatch[2];
                const action = actionMatch ? actionMatch[1] : "";
                const change = changeMatch ? changeMatch[1] : "default";
                const type = typeMatch ? typeMatch[1] : "";
                const user = userClientMatch ? userClientMatch[1] : "";
                const client = userClientMatch && userClientMatch[2] ? userClientMatch[2] : "";

                console.log("[DEBUG] Parsed file:", { depotFile, rev, action, change, type, user, client });

                files.push({
                    depotFile,
                    clientFile: "", // We'll get this from 'p4 where' command
                    rev,
                    action,
                    type,
                    change: change === "default" ? "default" : change.replace("change ", ""),
                    user,
                    client,
                });
            } else {
                console.log("[DEBUG] Line didn't match pattern:", cleanLine);
            }
        } catch (error) {
            console.error("[DEBUG] Error parsing line:", error);
        }
    }

    console.log("[DEBUG] Total files parsed:", files.length);
    return files;
}

export async function GET() {
    try {
        console.log("[DEBUG] GET /api/p4/files/opened called");

        if (USE_MOCK_DATA) {
            console.log("[DEBUG] Using mock data instead of executing p4 command");
            return NextResponse.json({
                success: true,
                files: mockCheckedOutFiles,
            });
        }

        try {
            console.log("[DEBUG] Executing p4 opened command");

            // Import here to avoid issues with server-side rendering
            const { execSync } = require("child_process");

            // Log if p4 command is available
            try {
                const p4Version = execSync("p4 -V", { encoding: "utf8" });
                console.log("[DEBUG] P4 version:", p4Version);
            } catch (versionError) {
                console.error("[DEBUG] P4 command not available:", versionError);
                throw new Error("Perforce command-line client (p4) is not installed or not in PATH");
            }

            // Execute 'p4 opened' command
            const output = execSync("p4 opened", { encoding: "utf8" });
            console.log("[DEBUG] P4 opened output:", output);

            const files = parseP4OpenedOutput(output);
            console.log("[DEBUG] Parsed files:", files);

            return NextResponse.json({
                success: true,
                files,
            });
        } catch (cmdError: any) {
            console.error("[DEBUG] P4 command error:", cmdError);

            // If the p4 command failed, check if it's because no files are opened
            if (cmdError.message && cmdError.message.includes("file(s) not opened")) {
                return NextResponse.json({
                    success: true,
                    files: [],
                });
            }

            // Otherwise, it's a real error
            throw new Error(`P4 command failed: ${cmdError.message}`);
        }
    } catch (error) {
        console.error("[DEBUG] Error in API route:", error);
        return NextResponse.json({ error: "Failed to fetch checked out files", details: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
