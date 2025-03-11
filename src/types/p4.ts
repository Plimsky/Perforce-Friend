/**
 * Represents a file checked out in a Perforce workspace
 */
export type P4CheckedOutFile = {
    /**
     * Depot path of the file
     */
    depotFile: string;

    /**
     * Local path of the file
     */
    clientFile: string;

    /**
     * Revision number
     */
    rev: string;

    /**
     * Action being performed on file (edit, add, delete, etc.)
     */
    action: string;

    /**
     * Type of file (text, binary, etc.)
     */
    type: string;

    /**
     * Changelist number (default or specific)
     */
    change: string;

    /**
     * User that has the file checked out
     */
    user?: string;

    /**
     * Workspace that has the file checked out
     */
    client?: string;
};

/**
 * Represents a file that is modified but not checked out
 */
export type P4ModifiedFile = {
    /**
     * Depot path of the file
     */
    depotFile: string;

    /**
     * Client workspace path of the file
     */
    clientFile: string;

    /**
     * Local path of the file (might be different from clientFile)
     */
    localFile: string;

    /**
     * Status of the file ('modified' or 'local-only')
     */
    status: string;

    /**
     * Type of file (text, binary, etc.)
     */
    type: string;
};

/**
 * Represents a log entry for a P4 command execution
 */
export type P4CommandLog = {
    /**
     * The P4 command that was executed
     */
    command: string;

    /**
     * Timestamp when the command was executed
     */
    timestamp: string;
};
