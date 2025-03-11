// Server-side utilities for Perforce commands

import { execSync } from "child_process";

/**
 * Execute a p4 command and return the output
 * This function will execute the command and log it to the client
 */
export function executeP4Command(command: string): string {
    try {
        // Execute the command
        const output = execSync(command, { encoding: "utf8" });

        // Return the output
        return output;
    } catch (error: any) {
        // If there's an error, throw it
        throw new Error(`P4 command failed: ${error.message}`);
    }
}
