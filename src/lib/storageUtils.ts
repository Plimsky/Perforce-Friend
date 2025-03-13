/**
 * Storage keys for localStorage
 */
export const STORAGE_KEYS = {
    CLIENT_ROOT: "perforce_friend_client_root",
    EXCLUDED_FOLDERS: "perforceFriend_excludedFolders",
    SELECTED_FOLDERS: "perforce_friend_selected_folders",
};

/**
 * Saves client root to localStorage
 */
export const saveClientRoot = (clientRoot: string): void => {
    try {
        if (typeof window !== "undefined" && clientRoot) {
            localStorage.setItem(STORAGE_KEYS.CLIENT_ROOT, clientRoot);
            console.log("Client root saved to localStorage:", clientRoot);
        }
    } catch (error) {
        console.error("Error saving client root to localStorage:", error);
    }
};

/**
 * Gets client root from localStorage
 */
export const getClientRoot = (): string | null => {
    try {
        if (typeof window !== "undefined") {
            const clientRoot = localStorage.getItem(STORAGE_KEYS.CLIENT_ROOT);
            if (clientRoot) {
                console.log("Retrieved client root from localStorage:", clientRoot);
                return clientRoot;
            }
        }
        return null;
    } catch (error) {
        console.error("Error retrieving client root from localStorage:", error);
        return null;
    }
};

/**
 * Saves selected folders to localStorage
 */
export const saveSelectedFolders = (folders: string[]): void => {
    try {
        if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEYS.SELECTED_FOLDERS, JSON.stringify(folders));
        }
    } catch (error) {
        console.error("Error saving selected folders to localStorage:", error);
    }
};

/**
 * Gets selected folders from localStorage
 */
export const getSelectedFolders = (): string[] => {
    try {
        if (typeof window !== "undefined") {
            const folders = localStorage.getItem(STORAGE_KEYS.SELECTED_FOLDERS);
            if (folders) {
                return JSON.parse(folders);
            }
        }
        return [];
    } catch (error) {
        console.error("Error retrieving selected folders from localStorage:", error);
        return [];
    }
};
