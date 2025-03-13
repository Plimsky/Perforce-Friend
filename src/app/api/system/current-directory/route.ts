import { NextResponse } from "next/server";
import { execSync } from "child_process";
import os from "os";
import path from "path";

/**
 * API endpoint to get the current working directory
 */
export async function GET() {
    try {
        // Get the current working directory
        let directory = process.cwd();

        // If on Windows, make sure we have forward slashes
        if (os.platform() === "win32") {
            directory = directory.replace(/\\/g, "/");

            // Also try to get the user's desktop or documents folder as a backup
            try {
                const userProfile = process.env.USERPROFILE || "C:\\Users\\Default";
                const documentsPath = path.join(userProfile, "Documents");

                // Check if the documents folder exists
                try {
                    execSync(`if exist "${documentsPath}" echo exists`, { stdio: "pipe" });
                    directory = documentsPath.replace(/\\/g, "/");
                } catch (err) {
                    // If documents doesn't exist, try desktop
                    const desktopPath = path.join(userProfile, "Desktop");
                    try {
                        execSync(`if exist "${desktopPath}" echo exists`, { stdio: "pipe" });
                        directory = desktopPath.replace(/\\/g, "/");
                    } catch (err) {
                        // Use userProfile if nothing else works
                        directory = userProfile.replace(/\\/g, "/");
                    }
                }
            } catch (err) {
                console.error("Error getting user folders:", err);
                // Keep using cwd if there was an error
            }
        }

        console.log(`Current directory API: Returning ${directory}`);

        return NextResponse.json({
            success: true,
            directory,
        });
    } catch (error) {
        console.error("Error getting current directory:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Error getting current directory",
            },
            { status: 500 },
        );
    }
}
