import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { depotFile } = await req.json();

        if (!depotFile) {
            return NextResponse.json({ error: "No depot file path provided" }, { status: 400 });
        }

        console.log("[DEBUG] POST /api/p4/files/checkout called for:", depotFile);

        try {
            // Import here to avoid issues with server-side rendering
            const { execSync } = require("child_process");

            // Execute 'p4 edit' command to check out file for edit
            const output = execSync(`p4 edit "${depotFile}"`, { encoding: "utf8" });
            console.log("[DEBUG] P4 edit output:", output);

            return NextResponse.json({
                success: true,
                message: `File "${depotFile}" checked out for edit`,
                output,
            });
        } catch (cmdError: any) {
            console.error("[DEBUG] P4 edit command error:", cmdError);

            // Parse the error message
            const errorMsg = cmdError.message || "";

            // Handle known error cases
            if (errorMsg.includes("not on client")) {
                return NextResponse.json({ error: `File "${depotFile}" is not mapped in your workspace` }, { status: 400 });
            } else if (errorMsg.includes("already open for edit")) {
                return NextResponse.json({ error: `File "${depotFile}" is already open for edit` }, { status: 400 });
            }

            // Otherwise, it's an unexpected error
            throw new Error(`P4 edit command failed: ${cmdError.message}`);
        }
    } catch (error) {
        console.error("[DEBUG] Error in checkout API route:", error);
        return NextResponse.json({ error: "Failed to checkout file", details: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
