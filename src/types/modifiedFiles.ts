/**
 * Represents a file that has been modified in Perforce
 */
export interface ModifiedFile {
    /**
     * The local path of the file on disk
     */
    localPath?: string;

    /**
     * Alternative property for local path (used in some API responses)
     */
    localFile?: string;

    /**
     * The path of the file in the Perforce depot
     */
    depotPath?: string;

    /**
     * The status of the file (e.g., 'edit', 'add', 'delete')
     */
    status: string;

    /**
     * The action performed on the file (e.g., 'reconcile', 'submit')
     */
    action?: string;
}
