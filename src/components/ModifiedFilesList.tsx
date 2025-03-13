'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { ModifiedFile } from '@/types/modifiedFiles';
import { useLocalStorage } from '@/lib/useLocalStorage';
import Pagination from './Pagination';
import ItemsPerPageSelector from './ItemsPerPageSelector';
import DirectoryBrowser from './DirectoryBrowser';
import { TrashIcon } from '@heroicons/react/24/outline';

// Helper function to get the local path from a file object
const getLocalPath = (file: ModifiedFile): string => {
    return file.localPath || (file as any).localFile || '';
};

// Helper functions for formatting file paths
const getFileName = (depotPath?: string): string => {
    if (!depotPath) return '';
    const parts = depotPath.split('/');
    return parts[parts.length - 1];
};

const formatDepotPath = (depotPath?: string): string => {
    if (!depotPath) return '';
    const parts = depotPath.split('/');
    parts.pop(); // Remove the filename
    return parts.join('/');
};

const formatLocalPath = (localPath?: string): string => {
    if (!localPath) return '';
    return localPath.length > 40 ? '...' + localPath.slice(-40) : localPath;
};

// Function to get status color
const getStatusColor = (status?: string): string => {
    if (!status) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

    switch (status.toLowerCase()) {
        case 'edit':
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
        case 'add':
            return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
        case 'delete':
            return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
};

// Function to copy path to clipboard
const copyPathToClipboard = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path)
        .then(() => {
            console.log('Path copied to clipboard');
        })
        .catch(err => {
            console.error('Could not copy path: ', err);
        });
};

// Constants for localStorage
const EXCLUDED_FOLDERS_KEY = 'perforceFriend_excludedFolders';
const INCLUSION_FOLDERS_KEY = 'perforceFriend_inclusionFolders';
const ITEMS_PER_PAGE_KEY = 'perforceFriend_itemsPerPage';

interface ModifiedFilesListProps {
    files: ModifiedFile[];
    isLoading: boolean;
    error: string | null;
    onRefresh: () => void;
    lastChecked: string | null;
    inclusionFolders: string[];
    onInclusionFoldersChange: (folders: string[]) => void;
}

export default function ModifiedFilesList({
    files,
    isLoading,
    error,
    onRefresh,
    lastChecked,
    inclusionFolders = [],
    onInclusionFoldersChange = () => { }
}: ModifiedFilesListProps) {
    // console.log('ModifiedFilesList render:', {
    //     fileCount: files?.length || 0,
    //     isLoading,
    //     hasError: !!error,
    //     errorMessage: error,
    //     inclusionFolders
    // });

    // Check if error is just a warning (contains 'Note:')
    const isWarning = error && error.startsWith('Note:');

    // State for exclusion filter
    const [excludedFoldersString, setExcludedFoldersString] = useLocalStorage<string>(EXCLUDED_FOLDERS_KEY, '');
    const [searchTerm, setSearchTerm] = useState('');
    const [isExcluding, setIsExcluding] = useState(true);

    // Add a ref to track whether we've already converted array format
    const hasProcessedArrayRef = useRef(false);

    // State for pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useLocalStorage<number>(ITEMS_PER_PAGE_KEY, 20);

    // Client root detection
    const [clientRoot, setClientRoot] = useState<string>('');

    // Input values for directory browsers
    const [newInclusionFolder, setNewInclusionFolder] = useState('');
    const [newExclusionFolder, setNewExclusionFolder] = useState('');

    // Local state for exclusion folders
    const [exclusionFolders, setExclusionFolders] = useState<string[]>([]);

    // Toggle state for panels
    const [showInclusion, setShowInclusion] = useState(false);
    const [showExclusion, setShowExclusion] = useState(false);

    // Auto-show exclusion panel if no exclusion folders are defined
    useEffect(() => {
        if (exclusionFolders.length === 0 && !showExclusion) {
            console.log('[DEBUG] No exclusion folders defined - auto-showing panel');
            setShowExclusion(true);
        }
    }, [exclusionFolders.length, showExclusion]);

    // Get client root on component mount
    useEffect(() => {
        // Get the client root from the API
        fetch('/api/p4/client')
            .then(res => {
                if (!res.ok) {
                    throw new Error(`Error fetching client root: ${res.status} ${res.statusText}`);
                }
                return res.json();
            })
            .then(data => {
                if (data.success && data.clientRoot) {
                    console.log('ModifiedFilesList: Got client root:', data.clientRoot);
                    setClientRoot(data.clientRoot);
                } else if (data.error) {
                    console.warn('ModifiedFilesList: Client root detection failed:', data.error);
                }
            })
            .catch(err => {
                console.error('ModifiedFilesList: Error fetching client root:', err);
                // Continue without client root - DirectoryBrowser will attempt to detect it
            });
    }, []);

    // Parse excluded folders from localStorage
    useEffect(() => {
        console.log('[DEBUG] excludedFoldersString changed:', excludedFoldersString);

        if (excludedFoldersString) {
            try {
                let folders: string[] = [];

                // Handle both old format (array stored directly) and new format (comma-separated string)
                if (typeof excludedFoldersString === 'string') {
                    folders = excludedFoldersString.split(',').filter(f => f.trim() !== '');
                    console.log('[DEBUG] Parsed string excluded folders:', folders);
                    setExclusionFolders(folders);
                } else if (Array.isArray(excludedFoldersString) && !hasProcessedArrayRef.current) {
                    // If excludedFoldersString is actually an array (from old localStorage format)
                    // Only process array format once to avoid infinite loops
                    folders = excludedFoldersString;
                    console.log('[DEBUG] Using array excluded folders:', folders);
                    setExclusionFolders(folders);

                    // Mark that we've processed the array format
                    hasProcessedArrayRef.current = true;

                    // Convert to string format for consistency - this will trigger another render
                    // but won't cause an infinite loop because of the ref flag
                    setExcludedFoldersString(folders.join(','));

                    console.log('Converted array format to string format:', folders);
                    return; // Early return to avoid double setting
                }
            } catch (error) {
                console.error('Error parsing exclusion folders:', error, 'Value:', excludedFoldersString);
                // Reset to empty string to avoid future errors
                setExclusionFolders([]);

                // Only reset the string if we haven't processed array format yet
                if (!hasProcessedArrayRef.current) {
                    hasProcessedArrayRef.current = true;
                    setExcludedFoldersString('');
                }
            }
        } else {
            console.log('[DEBUG] No excluded folders string, setting empty array');
            setExclusionFolders([]);
        }
    }, [excludedFoldersString]);

    // Filtered and paginated files
    const filteredFiles = useMemo(() => {
        if (!files) return [];
        console.log(`[DEBUG] Filtering ${files.length} files with ${exclusionFolders.length} exclusion folders. Excluding: ${isExcluding}`);

        const result = files.filter(file => {
            const localPath = getLocalPath(file);

            // Apply search filter
            if (searchTerm && !localPath.toLowerCase().includes(searchTerm.toLowerCase())) {
                return false;
            }

            // Check if the file is in the inclusion folders (if any are specified)
            const matchesInclusion = inclusionFolders.length === 0 ||
                inclusionFolders.some(folder => localPath.startsWith(folder));

            if (!matchesInclusion) return false;

            // Apply the exclusion filter
            if (isExcluding && exclusionFolders.length > 0) {
                // Check if any exclusion folder matches the start of the local path
                const excluded = exclusionFolders.some(folder => {
                    const folderPath = folder.replace(/\\/g, '/').trim();
                    if (!folderPath) return false;

                    // Normalize the path before comparing
                    const normalizedLocalPath = localPath.replace(/\\/g, '/');

                    // More flexible matching - check if the normalized path contains the folder name
                    // We need to ensure it's a proper folder match (not just a substring of another folder name)
                    const isExcluded = (
                        // Match full path (rare but possible)
                        normalizedLocalPath === folderPath ||
                        // Match at the beginning of the path
                        (normalizedLocalPath.startsWith(folderPath + '/')) ||
                        // Match in the middle/end of the path
                        normalizedLocalPath.includes('/' + folderPath + '/') ||
                        // Match at the end of the path
                        normalizedLocalPath.endsWith('/' + folderPath)
                    );

                    if (isExcluded) {
                        console.log(`[DEBUG] Excluding file ${normalizedLocalPath} due to exclusion folder ${folderPath}`);
                    }

                    return isExcluded;
                });

                return !excluded;
            }

            return true;
        });
        // console.log('Filtered files:', {
        //     originalCount: files.length,
        //     filteredCount: result.length,
        //     searchTerm,
        //     inclusionCount: inclusionFolders.length,
        //     exclusionCount: exclusionFolders.length,
        //     isExcluding
        // });
        return result;
    }, [files, searchTerm, isExcluding, exclusionFolders]);

    const indexOfLastFile = currentPage * itemsPerPage;
    const indexOfFirstFile = indexOfLastFile - itemsPerPage;
    const currentFiles = filteredFiles.slice(indexOfFirstFile, indexOfLastFile);
    // console.log('Paginated files:', {
    //     total: filteredFiles.length,
    //     currentPage,
    //     itemsPerPage,
    //     pageStart: indexOfFirstFile,
    //     pageEnd: indexOfLastFile,
    //     showing: currentFiles.length
    // });
    const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);

    // Reset page when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, exclusionFolders]);

    // Handle page change
    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    // Handle items per page change
    const handleItemsPerPageChange = (newItemsPerPage: number) => {
        setItemsPerPage(newItemsPerPage);
        setCurrentPage(1); // Reset to first page
    };

    // Toggle if we should exclude the folders or not
    const toggleExcluding = () => {
        setIsExcluding(!isExcluding);
    };

    // Add a new folder to inclusion
    const handleAddInclusionFolder = (folder?: string) => {
        const folderToAdd = folder || newInclusionFolder.trim();
        if (!folderToAdd) return;

        if (!inclusionFolders.includes(folderToAdd)) {
            const newFolders = [...inclusionFolders, folderToAdd];
            onInclusionFoldersChange(newFolders);
        }
        setNewInclusionFolder('');
    };

    // Remove a folder from inclusion
    const handleRemoveInclusionFolder = (folder: string) => {
        const newFolders = inclusionFolders.filter(f => f !== folder);
        onInclusionFoldersChange(newFolders);
    };

    // Add a new folder to exclusion
    const handleAddExclusionFolder = (folder?: string) => {
        const folderToAdd = folder || newExclusionFolder.trim();
        if (!folderToAdd) return;

        console.log('[DEBUG] Adding exclusion folder:', folderToAdd);

        if (!exclusionFolders.includes(folderToAdd)) {
            const newFolders = [...exclusionFolders, folderToAdd];
            console.log('[DEBUG] New exclusion folders:', newFolders);
            setExclusionFolders(newFolders);
            setExcludedFoldersString(newFolders.join(','));

            // Force recompute filtered files
            if (isExcluding) {
                console.log('[DEBUG] Forcing recompute of filtered files after adding exclusion folder');
                // We don't need to do anything here as the state change will trigger recomputation
            }
        }
        setNewExclusionFolder('');
    };

    // Remove a folder from exclusion
    const handleRemoveExclusionFolder = (folder: string) => {
        const newFolders = exclusionFolders.filter(f => f !== folder);
        setExclusionFolders(newFolders);
        setExcludedFoldersString(newFolders.join(','));
    };

    // Add sorting state
    const [sortField, setSortField] = useState<string>('depotFile');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Function to handle sorting
    const toggleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Function to get sort indicator
    const getSortIndicator = (field: string) => {
        if (sortField !== field) return null;

        return (
            <span className="ml-1">
                {sortDirection === 'asc' ? '↑' : '↓'}
            </span>
        );
    };

    // Function to open a file in the default editor
    const handleOpenFile = async (file: ModifiedFile) => {
        const localPath = getLocalPath(file);
        if (!localPath) {
            console.error('No local path available for file', file);
            return;
        }

        try {
            const response = await fetch('/api/system/open-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filePath: localPath }),
            });

            const data = await response.json();
            if (!data.success) {
                console.error('Failed to open file:', data.error);
            }
        } catch (error) {
            console.error('Error opening file:', error);
        }
    };

    // Function to checkout a file
    const handleCheckoutFile = async (file: ModifiedFile) => {
        if (!file.depotPath) {
            console.error('No depot path available for file', file);
            return;
        }

        try {
            const response = await fetch('/api/p4/files/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ depotFile: file.depotPath }),
            });

            const data = await response.json();
            if (data.success) {
                console.log('File checked out successfully');
                // Refresh the file list
                onRefresh();
            } else {
                console.error('Failed to checkout file:', data.error);
            }
        } catch (error) {
            console.error('Error checking out file:', error);
        }
    };

    // Apply sorting to filtered files
    const sortedFiles = useMemo(() => {
        return [...filteredFiles].sort((a, b) => {
            let aValue = '';
            let bValue = '';

            if (sortField === 'depotFile') {
                aValue = a.depotPath || '';
                bValue = b.depotPath || '';
            } else if (sortField === 'status') {
                aValue = a.status || '';
                bValue = b.status || '';
            } else if (sortField === 'localFile') {
                aValue = getLocalPath(a);
                bValue = getLocalPath(b);
            }

            if (sortDirection === 'asc') {
                return aValue.localeCompare(bValue);
            } else {
                return bValue.localeCompare(aValue);
            }
        });
    }, [filteredFiles, sortField, sortDirection]);

    // Apply pagination to sorted files
    const paginatedFiles = sortedFiles.slice(indexOfFirstFile, indexOfLastFile);

    return (
        <div className="space-y-4">
            {/* Display error if present (non-warning) */}
            {error && !isWarning && (
                <div className="p-4 mb-4 text-red-500 border border-red-300 rounded bg-red-50 dark:bg-red-900/20 dark:border-red-800">
                    <h3 className="font-semibold mb-2">Error loading modified files</h3>
                    <p>{error}</p>
                    <button
                        onClick={onRefresh}
                        className="mt-2 px-4 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Display warning if present */}
            {isWarning && (
                <div className="p-3 mb-4 text-yellow-800 border border-yellow-300 rounded bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200">
                    <p>{error}</p>
                </div>
            )}

            <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2 md:items-center md:justify-between">
                <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2 md:items-center">
                    <input
                        type="text"
                        placeholder="Filter files..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-3 py-1 border rounded w-full md:w-60 dark:bg-gray-800 dark:border-gray-700"
                    />

                    <div className="flex items-center space-x-2">
                        <button
                            onClick={onRefresh}
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                            Refresh
                        </button>
                        <button
                            onClick={() => setShowInclusion(!showInclusion)}
                            className="px-3 py-1 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        >
                            {showInclusion ? 'Hide Inclusion' : 'Show Inclusion'}
                        </button>
                        <button
                            onClick={() => setShowExclusion(!showExclusion)}
                            className={`px-3 py-1 text-sm rounded ${exclusionFolders.length === 0 && !showExclusion
                                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-800 dark:text-yellow-100 dark:hover:bg-yellow-700'
                                : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                }`}
                        >
                            {showExclusion ? 'Hide Exclusion' : `${exclusionFolders.length === 0 ? 'Define Exclusions' : 'Show Exclusion'}`}
                        </button>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        {lastChecked ? `Last checked: ${format(new Date(lastChecked), 'MMM d, yyyy HH:mm:ss')}` : 'Not checked yet'}
                    </span>
                </div>
            </div>

            <div className="flex items-center space-x-2">
                <label className="flex items-center text-sm">
                    <input
                        type="checkbox"
                        checked={isExcluding}
                        onChange={toggleExcluding}
                        className="mr-2"
                    />
                    {exclusionFolders.length > 0 ? (
                        <>Exclude {exclusionFolders.length} folder{exclusionFolders.length !== 1 ? 's' : ''}</>
                    ) : (
                        <>Exclude folders</>
                    )}
                </label>
                {exclusionFolders.length > 0 ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({isExcluding ? filteredFiles.length : files.length} of {files.length} files shown)
                    </span>
                ) : (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold">
                        Click "{showExclusion ? 'Hide Exclusion' : 'Define Exclusions'}" to {showExclusion ? 'hide' : 'set up'} exclusion folders
                    </span>
                )}
            </div>

            {inclusionFolders.length > 0 && (
                <div className="text-sm text-blue-600 dark:text-blue-400">
                    Only scanning {inclusionFolders.length} folder{inclusionFolders.length !== 1 ? 's' : ''}
                </div>
            )}

            {/* New inclusion folders UI */}
            {showInclusion && (
                <div className="flex flex-col space-y-2 border p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <h3 className="text-md font-semibold text-gray-700 dark:text-gray-300">Include Folders Only</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        Only scan these folders for modified files. Files outside these folders will be excluded.
                    </p>
                    <div className="flex flex-col space-y-2">
                        {inclusionFolders.map((folder, i) => (
                            <div key={i} className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded border">
                                <span className="text-sm">{folder}</span>
                                <button
                                    onClick={() => handleRemoveInclusionFolder(folder)}
                                    className="ml-2 text-red-500 hover:text-red-700"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ))}

                        <div className="mt-2">
                            <DirectoryBrowser
                                value={newInclusionFolder}
                                onChange={setNewInclusionFolder}
                                clientRoot={clientRoot}
                                placeholder="Enter folder path..."
                                onSelect={handleAddInclusionFolder}
                                excludedFolders={exclusionFolders}
                            />
                        </div>

                        <div className="flex justify-end mt-2">
                            <button
                                onClick={() => handleAddInclusionFolder()}
                                disabled={!newInclusionFolder}
                                className="px-3 py-1 text-sm bg-blue-500 text-white rounded disabled:opacity-50"
                            >
                                Add Folder
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Exclusion folders UI - Updated to match first commit layout */}
            <div>
                <button
                    type="button"
                    onClick={() => setShowExclusion(!showExclusion)}
                    className="flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                >
                    <span className="mr-1">{showExclusion ? '▼' : '▶'}</span>
                    Excluded Folders {exclusionFolders.length > 0 && `(${exclusionFolders.length})`}
                </button>

                {showExclusion && (
                    <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                        <div className="flex flex-col space-y-3">
                            <div className="flex items-center">
                                <input
                                    type="text"
                                    value={newExclusionFolder}
                                    onChange={(e) => setNewExclusionFolder(e.target.value)}
                                    placeholder="Enter folder name to exclude (e.g., Binaries)"
                                    className="flex-1 rounded-l-md border border-gray-300 dark:border-gray-700 py-1 px-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddExclusionFolder()}
                                />
                                <button
                                    onClick={() => handleAddExclusionFolder()}
                                    className="rounded-r-md border-t border-r border-b border-gray-300 dark:border-gray-700 py-1 px-3 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    Add
                                </button>
                            </div>

                            {exclusionFolders.length > 0 ? (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {exclusionFolders.map((folder) => (
                                        <div
                                            key={folder}
                                            className="flex items-center bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-md px-2 py-1 text-sm"
                                        >
                                            <span>{folder}</span>
                                            <button
                                                onClick={() => handleRemoveExclusionFolder(folder)}
                                                className="ml-2 text-blue-500 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-100"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    No folders excluded. Add folders like "Intermediate" or "Binaries" to filter them out.
                                </p>
                            )}

                            <div className="mt-2">
                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    Quick add common folders:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {['Binaries', 'Intermediate', 'Build', 'Saved', 'node_modules', '.git', 'dist', 'DLC']
                                        .filter(folder => !exclusionFolders.includes(folder))
                                        .map(folder => (
                                            <button
                                                key={folder}
                                                onClick={() => handleAddExclusionFolder(folder)}
                                                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                                            >
                                                {folder}
                                            </button>
                                        ))}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    Note: Folder names will match anywhere in the file path. For example, "DLC" will match files like "C:/Project/Game/DLC/file.txt" or "C:/DLC/test.txt".
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Files table or loading indicator */}
            {isLoading ? (
                <div className="text-center p-4 animate-pulse border rounded bg-gray-50 dark:bg-gray-800">
                    Loading modified files...
                </div>
            ) : (
                <div>
                    {/* Files table */}
                    {filteredFiles.length === 0 ? (
                        <div className="p-4 text-center border rounded">
                            No modified files found.
                        </div>
                    ) : (
                        <div>
                            <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <colgroup>
                                        <col style={{ width: '288px' }} />
                                        <col style={{ width: '112px' }} />
                                        <col style={{ width: '320px' }} />
                                        <col style={{ width: '160px' }} />
                                    </colgroup>
                                    <thead className="bg-gray-50 dark:bg-gray-800">
                                        <tr>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                                onClick={() => toggleSort('depotFile')}
                                                style={{ width: '288px' }}
                                            >
                                                <div className="flex items-center">
                                                    File
                                                    {getSortIndicator('depotFile')}
                                                </div>
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                                onClick={() => toggleSort('status')}
                                                style={{ width: '112px' }}
                                            >
                                                <div className="flex items-center">
                                                    Status
                                                    {getSortIndicator('status')}
                                                </div>
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                                onClick={() => toggleSort('localFile')}
                                                style={{ width: '320px' }}
                                            >
                                                <div className="flex items-center">
                                                    Local Path
                                                    {getSortIndicator('localFile')}
                                                </div>
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                                style={{ width: '160px' }}
                                            >
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                        {paginatedFiles.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-4 text-center text-gray-500 dark:text-gray-400">
                                                    No files match the current filter criteria
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedFiles.map((file, index) => {
                                                const localPath = getLocalPath(file);
                                                return (
                                                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                                                    {getFileName(file.depotPath)}
                                                                </span>
                                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                    {formatDepotPath(file.depotPath)}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(file.status)}`}>
                                                                {file.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                            <div className="flex items-center group">
                                                                <span className="truncate max-w-xs" title={localPath}>
                                                                    {formatLocalPath(localPath)}
                                                                </span>
                                                                {localPath && (
                                                                    <button
                                                                        onClick={(e) => copyPathToClipboard(localPath, e)}
                                                                        className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                        title="Copy full path"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
                                                                        </svg>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                                            <div className="flex space-x-3">
                                                                {localPath && file.status !== 'delete' && (
                                                                    <button
                                                                        onClick={() => handleOpenFile(file)}
                                                                        className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 shadow-sm text-xs font-medium rounded text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                                                                        title="Open file in default editor"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                                                        </svg>
                                                                        Open
                                                                    </button>
                                                                )}
                                                                {file.status !== 'delete' && (
                                                                    <button
                                                                        onClick={() => handleCheckoutFile(file)}
                                                                        className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 shadow-sm text-xs font-medium rounded text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900 hover:bg-green-100 dark:hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                                                                        title="Check out file for edit"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                                                        </svg>
                                                                        Checkout
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                                Showing {paginatedFiles.length > 0 ?
                                    `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, sortedFiles.length)} of ${sortedFiles.length}` :
                                    `0 of ${sortedFiles.length}`
                                } filtered files
                                {exclusionFolders.length > 0 && ` (${files.length - filteredFiles.length} files excluded by folder filters)`}
                            </div>

                            {/* Pagination controls */}
                            <div className="mt-4 flex flex-col sm:flex-row justify-between items-center">
                                <ItemsPerPageSelector
                                    itemsPerPage={itemsPerPage}
                                    onChange={handleItemsPerPageChange}
                                    options={[10, 20, 50, 100, 200]}
                                />
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={handlePageChange}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
} 