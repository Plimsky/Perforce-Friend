import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import os from "os";

/**
 * Map depot paths to client paths using p4 where command
 */
export async function POST(req: Request) {
    try {
        const { files } = await req.json();

        if (!files || !Array.isArray(files) || files.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No files provided to map",
                },
                { status: 400 },
            );
        }

        try {
            console.log("[DEBUG] Attempting to map files:", files.slice(0, 3), `... (${files.length} total)`);

            // Create a mapping object to store results
            const pathMap: Record<string, string> = {};

            // Try to get the client root information first
            let clientRoot = "";
            try {
                const clientInfo = execSync("p4 info", { encoding: "utf8" });
                const clientRootMatch = clientInfo.match(/Client root: (.+)/);
                if (clientRootMatch && clientRootMatch[1]) {
                    clientRoot = clientRootMatch[1].trim();
                    console.log("[DEBUG] Found client root:", clientRoot);
                }
            } catch (infoError) {
                console.error("[DEBUG] Error getting p4 info:", infoError);
            }

            // Create a temporary file for the list of files to be processed
            const tempDir = os.tmpdir();
            const tempFilePath = join(tempDir, `p4_files_${Date.now()}.txt`);

            try {
                // Write depot paths to the temp file, one per line
                writeFileSync(tempFilePath, files.join("\n"), "utf8");
                console.log("[DEBUG] Created temp file with paths:", tempFilePath);

                // Use a simpler approach: execute p4 where on each file individually
                // This is slower but more reliable
                for (const depotPath of files) {
                    try {
                        // Execute p4 where for this specific file
                        console.log("[DEBUG] Processing file:", depotPath);

                        const cmd = `p4 where "${depotPath}"`;
                        const output = execSync(cmd, { encoding: "utf8" });

                        // The output format is typically: "//depot/path/file.txt client/path/file.txt C:/actual/path/file.txt"
                        const parts = output.trim().split(/\s+/);

                        // We need at least 3 parts for a valid mapping
                        if (parts.length >= 3) {
                            const localPath = parts[parts.length - 1]; // Last part is the local path

                            console.log("[DEBUG] Mapped:", depotPath, "->", localPath);
                            pathMap[depotPath] = localPath;
                        } else {
                            console.log("[DEBUG] Failed to parse where output for:", depotPath, "Output:", output);
                        }
                    } catch (fileError) {
                        console.error("[DEBUG] Error processing file:", depotPath, fileError);
                    }
                }
            } finally {
                // Clean up temp file
                try {
                    unlinkSync(tempFilePath);
                    console.log("[DEBUG] Removed temp file:", tempFilePath);
                } catch (unlinkError) {
                    console.error("[DEBUG] Error removing temp file:", unlinkError);
                }
            }

            console.log("[DEBUG] Successfully mapped", Object.keys(pathMap).length, "of", files.length, "files");

            return NextResponse.json({
                success: true,
                pathMap,
            });
        } catch (cmdError: any) {
            console.error("[DEBUG] P4 where command failed:", cmdError.message);

            throw new Error(`P4 command failed: ${cmdError.message}`);
        }
    } catch (error) {
        console.error("[DEBUG] Error mapping file paths:", error);
        return NextResponse.json({ error: "Failed to map file paths", details: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
