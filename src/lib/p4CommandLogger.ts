"use client";

// This is a utility for logging P4 commands from both client and server sides
import { P4Service } from "./p4Service";
import { P4CommandLog } from "../types/p4";

// How often to check for new commands (ms)
const CHECK_INTERVAL = 1000;

// Cookie/localStorage key for temporary command storage
const P4_TEMP_COMMAND_KEY = "p4_temp_command";

// Initialize the command logger
export function initP4CommandLogger() {
    let intervalId: NodeJS.Timeout | null = null;

    // Start polling for commands in localStorage
    const startPolling = () => {
        intervalId = setInterval(() => {
            const tempCommandJson = localStorage.getItem(P4_TEMP_COMMAND_KEY);
            if (tempCommandJson) {
                try {
                    // Clear the temporary storage immediately to prevent duplicate processing
                    localStorage.removeItem(P4_TEMP_COMMAND_KEY);

                    // Parse the command
                    const commandData = JSON.parse(tempCommandJson);
                    if (commandData.command) {
                        // Log the command
                        const p4Service = P4Service.getInstance();
                        p4Service.logCommand(commandData.command);
                    }
                } catch (e) {
                    console.error("Error processing P4 command from storage:", e);
                }
            }
        }, CHECK_INTERVAL);
    };

    // Add a function to the window object for API routes to call
    // This can be called from API response handling
    // @ts-ignore - Add to window
    window.logP4Command = (command: string) => {
        const p4Service = P4Service.getInstance();
        p4Service.logCommand(command);
    };

    // Start polling
    startPolling();

    // Return cleanup function
    return () => {
        if (intervalId) {
            clearInterval(intervalId);
        }
        // @ts-ignore - Remove from window
        delete window.logP4Command;
    };
}

// For use in client-side code directly
export function logP4Command(command: string) {
    const p4Service = P4Service.getInstance();
    p4Service.logCommand(command);
}

// Function to be called in API fetch handlers or responses
// Usage: logP4CommandFromAPI('p4 opened');
export function logP4CommandFromAPI(command: string) {
    try {
        // Store the command in localStorage for the polling function to find
        const commandData = {
            command,
            timestamp: new Date().toISOString(),
        };
        localStorage.setItem(P4_TEMP_COMMAND_KEY, JSON.stringify(commandData));
    } catch (e) {
        console.error("Error storing P4 command in localStorage:", e);
    }
}
