import { useState, useEffect, useMemo } from 'react';
import { P4ModifiedFile } from '../types/p4';
import useLocalStorage from '../lib/useLocalStorage';
import Pagination from './Pagination';
import ItemsPerPageSelector from './ItemsPerPageSelector';

// Constants for localStorage
const STORAGE_KEY = 'perforceFriend_excludedFolders';
const ITEMS_PER_PAGE_KEY = 'perforceFriend_itemsPerPage';
const SORT_SETTINGS_KEY = 'perforceFriend_modifiedSortSettings';

// Define available sort columns
type SortColumn = 'depotFile' | 'status' | 'localFile';
type SortDirection = 'asc' | 'desc';

// Define sort settings interface
interface SortSettings {
    column: SortColumn;
    direction: SortDirection;
}

type ModifiedFilesListProps = {
    files: P4ModifiedFile[];
    isLoading: boolean;
    error?: string;
};

export default function ModifiedFilesList({ files, isLoading, error }: ModifiedFilesListProps) {
    // Sort state with direction
    const [sortSettings, setSortSettings] = useLocalStorage<SortSettings>(SORT_SETTINGS_KEY, {
        column: 'depotFile',
        direction: 'asc'
    });
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [excludedFolders, setExcludedFolders] = useLocalStorage<string[]>(STORAGE_KEY, []);
    const [newFolder, setNewFolder] = useState<string>('');
    const [showExcludedFolders, setShowExcludedFolders] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useLocalStorage<number>(ITEMS_PER_PAGE_KEY, 20);

    useEffect(() => {
        console.log("ModifiedFilesList received files:", files);
        console.log("Number of files:", files.length);
        console.log("First few files:", files.slice(0, 3));
    }, [files]);

    // Reset to first page when filter/sort/exclude changes
    useEffect(() => {
        setCurrentPage(1);
    }, [filterStatus, sortSettings, excludedFolders]);

    // Get unique statuses for filter
    const uniqueStatuses = Array.from(new Set(files.map(file => file.status)));

    // Check if a file should be excluded based on its path
    const shouldExcludeFile = (file: P4ModifiedFile): boolean => {
        if (excludedFolders.length === 0) return false;

        const depotPath = file.depotFile.toLowerCase();
        return excludedFolders.some(folder => depotPath.includes(folder.toLowerCase()));
    };

    // Filter files by status and excluded folders
    const filteredFiles = useMemo(() => {
        return files
            .filter(file => filterStatus === 'all' || file.status === filterStatus)
            .filter(file => !shouldExcludeFile(file));
    }, [files, filterStatus, excludedFolders]);

    // Sort files
    const sortedFiles = useMemo(() => {
        return [...filteredFiles].sort((a, b) => {
            let compareResult = 0;

            switch (sortSettings.column) {
                case 'depotFile':
                    compareResult = a.depotFile.localeCompare(b.depotFile);
                    break;
                case 'status':
                    compareResult = a.status.localeCompare(b.status);
                    break;
                case 'localFile':
                    compareResult = (a.localFile || '').localeCompare(b.localFile || '');
                    break;
                default:
                    compareResult = a.depotFile.localeCompare(b.depotFile);
            }

            // Apply sort direction
            return sortSettings.direction === 'asc' ? compareResult : -compareResult;
        });
    }, [filteredFiles, sortSettings]);

    // Calculate pagination
    const totalPages = Math.ceil(sortedFiles.length / itemsPerPage);
    const paginatedFiles = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sortedFiles.slice(startIndex, startIndex + itemsPerPage);
    }, [sortedFiles, currentPage, itemsPerPage]);

    // Toggle sort column and direction
    const toggleSort = (column: SortColumn) => {
        setSortSettings(prevSettings => {
            if (prevSettings.column === column) {
                // Toggle direction if same column
                return {
                    column,
                    direction: prevSettings.direction === 'asc' ? 'desc' : 'asc'
                };
            } else {
                // New column, default to ascending
                return {
                    column,
                    direction: 'asc'
                };
            }
        });
    };

    // Get sort indicator for a column
    const getSortIndicator = (column: SortColumn) => {
        if (sortSettings.column !== column) return null;

        return (
            <span className="ml-1 text-gray-500 dark:text-gray-400">
                {sortSettings.direction === 'asc' ? '▲' : '▼'}
            </span>
        );
    };

    // Handle page change
    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    // Handle items per page change
    const handleItemsPerPageChange = (value: number) => {
        setItemsPerPage(value);
        setCurrentPage(1); // Reset to first page when changing items per page
    };

    // Add a new folder to exclude
    const handleAddExcludedFolder = () => {
        if (newFolder.trim() === '') return;

        if (!excludedFolders.includes(newFolder.trim())) {
            setExcludedFolders([...excludedFolders, newFolder.trim()]);
        }
        setNewFolder('');
    };

    // Add a common folder to exclude
    const addCommonFolder = (folder: string) => {
        if (!excludedFolders.includes(folder)) {
            setExcludedFolders([...excludedFolders, folder]);
        }
    };

    // Common folders that are typically excluded
    const commonExcludedFolders = ['Binaries', 'Intermediate', 'Saved', 'DerivedDataCache', '.git', 'node_modules'];

    // Remove a folder from the excluded list
    const handleRemoveExcludedFolder = (folder: string) => {
        setExcludedFolders(excludedFolders.filter(f => f !== folder));
    };

    // Get file name from path
    const getFileName = (path: string) => {
        const parts = path.split('/');
        return parts[parts.length - 1];
    };

    // Format depot path for display
    const formatDepotPath = (path: string) => {
        const parts = path.split('/');
        if (parts.length <= 3) return path;

        const fileName = parts[parts.length - 1];
        const folder = parts[parts.length - 2];
        return `.../${folder}/${fileName}`;
    };

    // Format local path for display
    const formatLocalPath = (path: string) => {
        if (!path) return 'Unknown local path';

        // Check if path is too long to display in full
        if (path.length <= 40) return path;

        const parts = path.split(/[\/\\]/); // Split on forward slash or backslash
        if (parts.length <= 3) return path;

        const fileName = parts[parts.length - 1];
        const folder = parts[parts.length - 2];

        // Return shortened path with ellipsis
        return `.../${folder}/${fileName}`;
    };

    // Copy the full path to clipboard
    const copyPathToClipboard = (path: string, event: React.MouseEvent) => {
        event.stopPropagation();
        navigator.clipboard.writeText(path)
            .then(() => {
                // Visual feedback for copy
                const target = event.currentTarget as HTMLElement;
                const originalText = target.innerText;
                target.innerText = 'Copied!';

                setTimeout(() => {
                    target.innerText = originalText;
                }, 1000);
            })
            .catch(err => {
                console.error('Failed to copy path:', err);
            });
    };

    // Determine color based on file status
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'edit':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100';
            case 'add':
                return 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100';
            case 'delete':
                return 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100';
            case 'move/add':
                return 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100';
            case 'move/delete':
                return 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100';
            case 'branch':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100';
            case 'integrate':
                return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
        }
    };

    // Handle opening a file in external editor
    const handleOpenFile = async (file: P4ModifiedFile) => {
        try {
            if (!file.localFile) {
                alert('Local file path not available');
                return;
            }

            // Call API to open file
            const response = await fetch('/api/system/open-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filePath: file.localFile }),
            });

            const data = await response.json();

            if (!response.ok) {
                alert(`Failed to open file: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error opening file:', error);
            alert('Failed to open file');
        }
    };

    // Handle checking out a file for edit
    const handleCheckoutFile = async (file: P4ModifiedFile) => {
        try {
            // Cannot check out deleted files, so skip this
            if (file.status === 'delete') {
                alert(`Cannot check out deleted file: ${file.depotFile}`);
                return;
            }

            // Call API to checkout file
            const response = await fetch('/api/p4/files/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ depotFile: file.depotFile }),
            });

            const data = await response.json();

            if (!response.ok) {
                alert(`Failed to checkout file: ${data.error || 'Unknown error'}`);
            } else {
                alert(`File checked out: ${file.depotFile}`);
            }
        } catch (error) {
            console.error('Error checking out file:', error);
            alert('Failed to checkout file');
        }
    };

    if (isLoading) {
        return (
            <div className="p-4 text-center">
                <div className="animate-pulse">Loading modified files...</div>
            </div>
        );
    }

    if (error) {
        // If the "error" is actually just a message about limited results, show it differently
        if (error.includes('Only showing') && error.includes('files')) {
            return (
                <div className="w-full">
                    <div className="p-3 mb-4 text-blue-600 bg-blue-50 dark:bg-blue-900 dark:text-blue-200 rounded-md">
                        <p className="text-sm">{error}</p>
                    </div>

                    {/* Continue with rendering the normal component after the message */}
                    <div className="flex flex-col sm:flex-row justify-between mb-4 gap-2">
                        <div className="flex flex-wrap gap-3">
                            <div className="flex items-center">
                                <label htmlFor="filter-status" className="mr-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Filter by status:
                                </label>
                                <select
                                    id="filter-status"
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm py-1 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm"
                                >
                                    <option value="all">All</option>
                                    {uniqueStatuses.map(status => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <button
                                type="button"
                                onClick={() => setShowExcludedFolders(!showExcludedFolders)}
                                className="flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                            >
                                <span className="mr-1">{showExcludedFolders ? '▼' : '▶'}</span>
                                Excluded Folders {excludedFolders.length > 0 && `(${excludedFolders.length})`}
                            </button>

                            {showExcludedFolders && (
                                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                                    <div className="flex flex-col space-y-3">
                                        <div className="flex items-center">
                                            <input
                                                type="text"
                                                value={newFolder}
                                                onChange={(e) => setNewFolder(e.target.value)}
                                                placeholder="Enter folder name to exclude (e.g., Binaries)"
                                                className="flex-1 rounded-l-md border border-gray-300 dark:border-gray-700 py-1 px-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddExcludedFolder()}
                                            />
                                            <button
                                                onClick={handleAddExcludedFolder}
                                                className="rounded-r-md border-t border-r border-b border-gray-300 dark:border-gray-700 py-1 px-3 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                                            >
                                                Add
                                            </button>
                                        </div>

                                        {excludedFolders.length > 0 ? (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {excludedFolders.map((folder) => (
                                                    <div
                                                        key={folder}
                                                        className="flex items-center bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-md px-2 py-1 text-sm"
                                                    >
                                                        <span>{folder}</span>
                                                        <button
                                                            onClick={() => handleRemoveExcludedFolder(folder)}
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
                                                {commonExcludedFolders
                                                    .filter(folder => !excludedFolders.includes(folder))
                                                    .map(folder => (
                                                        <button
                                                            key={folder}
                                                            onClick={() => addCommonFolder(folder)}
                                                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                                                        >
                                                            {folder}
                                                        </button>
                                                    ))}
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed" style={{ tableLayout: 'fixed', width: '100%' }}>
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
                                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-72"
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
                                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-28"
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
                                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-80"
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
                                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40"
                                        style={{ width: '160px' }}
                                    >
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                                {paginatedFiles.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                            No files match the current filter criteria
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedFiles.map((file, index) => (
                                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                                        {getFileName(file.depotFile)}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {formatDepotPath(file.depotFile)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(file.status)}`}>
                                                    {file.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                <div className="flex items-center group">
                                                    <span className="truncate max-w-xs" title={file.localFile}>
                                                        {formatLocalPath(file.localFile)}
                                                    </span>
                                                    {file.localFile && (
                                                        <button
                                                            onClick={(e) => copyPathToClipboard(file.localFile, e)}
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
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <div className="flex space-x-3">
                                                    {file.localFile && file.status !== 'delete' && (
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
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                        Showing {paginatedFiles.length > 0 ?
                            `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, sortedFiles.length)} of ${sortedFiles.length}` :
                            `0 of ${sortedFiles.length}`
                        } filtered files
                        {excludedFolders.length > 0 && ` (${files.length - filteredFiles.length} files excluded by folder filters)`}
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
            );
        } else {
            // Display actual errors in red
            return (
                <div className="p-4 text-center text-red-600 dark:text-red-400">
                    {error}
                </div>
            );
        }
    }

    if (files.length === 0) {
        return (
            <div className="p-4 text-center text-gray-600 dark:text-gray-400">
                No modified files found that aren't checked out.
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row justify-between mb-4 gap-2">
                <div className="flex flex-wrap gap-3">
                    <div className="flex items-center">
                        <label htmlFor="filter-status" className="mr-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                            Filter by status:
                        </label>
                        <select
                            id="filter-status"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm py-1 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm"
                        >
                            <option value="all">All</option>
                            {uniqueStatuses.map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <button
                        type="button"
                        onClick={() => setShowExcludedFolders(!showExcludedFolders)}
                        className="flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                    >
                        <span className="mr-1">{showExcludedFolders ? '▼' : '▶'}</span>
                        Excluded Folders {excludedFolders.length > 0 && `(${excludedFolders.length})`}
                    </button>

                    {showExcludedFolders && (
                        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                            <div className="flex flex-col space-y-3">
                                <div className="flex items-center">
                                    <input
                                        type="text"
                                        value={newFolder}
                                        onChange={(e) => setNewFolder(e.target.value)}
                                        placeholder="Enter folder name to exclude (e.g., Binaries)"
                                        className="flex-1 rounded-l-md border border-gray-300 dark:border-gray-700 py-1 px-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddExcludedFolder()}
                                    />
                                    <button
                                        onClick={handleAddExcludedFolder}
                                        className="rounded-r-md border-t border-r border-b border-gray-300 dark:border-gray-700 py-1 px-3 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                                    >
                                        Add
                                    </button>
                                </div>

                                {excludedFolders.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {excludedFolders.map((folder) => (
                                            <div
                                                key={folder}
                                                className="flex items-center bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-md px-2 py-1 text-sm"
                                            >
                                                <span>{folder}</span>
                                                <button
                                                    onClick={() => handleRemoveExcludedFolder(folder)}
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
                                        {commonExcludedFolders
                                            .filter(folder => !excludedFolders.includes(folder))
                                            .map(folder => (
                                                <button
                                                    key={folder}
                                                    onClick={() => addCommonFolder(folder)}
                                                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                                                >
                                                    {folder}
                                                </button>
                                            ))}
                                    </div>
                                </div>

                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed" style={{ tableLayout: 'fixed', width: '100%' }}>
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
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-72"
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
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-28"
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
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-80"
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
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40"
                                style={{ width: '160px' }}
                            >
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                        {paginatedFiles.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                    No files match the current filter criteria
                                </td>
                            </tr>
                        ) : (
                            paginatedFiles.map((file, index) => (
                                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                                {getFileName(file.depotFile)}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {formatDepotPath(file.depotFile)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(file.status)}`}>
                                            {file.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        <div className="flex items-center group">
                                            <span className="truncate max-w-xs" title={file.localFile}>
                                                {formatLocalPath(file.localFile)}
                                            </span>
                                            {file.localFile && (
                                                <button
                                                    onClick={(e) => copyPathToClipboard(file.localFile, e)}
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
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex space-x-3">
                                            {file.localFile && file.status !== 'delete' && (
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
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                Showing {paginatedFiles.length > 0 ?
                    `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, sortedFiles.length)} of ${sortedFiles.length}` :
                    `0 of ${sortedFiles.length}`
                } filtered files
                {excludedFolders.length > 0 && ` (${files.length - filteredFiles.length} files excluded by folder filters)`}
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
    );
} 