import { useState, useMemo, useEffect } from 'react';
import { P4CheckedOutFile } from '../types/p4';
import useLocalStorage from '../lib/useLocalStorage';
import Pagination from './Pagination';
import ItemsPerPageSelector from './ItemsPerPageSelector';

// Constants for localStorage
const ITEMS_PER_PAGE_KEY = 'perforceFriend_checkedOutItemsPerPage';
const SORT_SETTINGS_KEY = 'perforceFriend_checkedOutSortSettings';

// Define available sort columns
type SortColumn = 'depotFile' | 'action' | 'rev' | 'change' | 'clientFile';
type SortDirection = 'asc' | 'desc';

// Define sort settings interface
interface SortSettings {
  column: SortColumn;
  direction: SortDirection;
}

type CheckedOutFilesListProps = {
  files: P4CheckedOutFile[];
  isLoading: boolean;
  error?: string;
};

export default function CheckedOutFilesList({ files, isLoading, error }: CheckedOutFilesListProps) {
  const [filterAction, setFilterAction] = useState<string>('all');

  // Sort state with direction
  const [sortSettings, setSortSettings] = useLocalStorage<SortSettings>(SORT_SETTINGS_KEY, {
    column: 'depotFile',
    direction: 'asc'
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useLocalStorage<number>(ITEMS_PER_PAGE_KEY, 20);

  // Reset to first page when filter/sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterAction, sortSettings]);

  // Filter files by action
  const filteredFiles = useMemo(() => {
    return filterAction === 'all'
      ? files
      : files.filter(file => file.action === filterAction);
  }, [files, filterAction]);

  // Sort files
  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      let compareResult = 0;

      switch (sortSettings.column) {
        case 'depotFile':
          compareResult = a.depotFile.localeCompare(b.depotFile);
          break;
        case 'action':
          compareResult = a.action.localeCompare(b.action);
          break;
        case 'rev':
          compareResult = a.rev.localeCompare(b.rev);
          break;
        case 'change':
          compareResult = a.change.localeCompare(b.change);
          break;
        case 'clientFile':
          compareResult = (a.clientFile || '').localeCompare(b.clientFile || '');
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

  // Get unique actions for filter
  const uniqueActions = Array.from(new Set(files.map(file => file.action)));

  // Get file extension from path
  const getFileExtension = (path: string) => {
    const parts = path.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
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
  const formatLocalPath = (path: string, displayFullPath: boolean = false) => {
    if (!path) return 'Unknown local path';

    // Check if path is too long to display in full
    if (path.length <= 40 || displayFullPath) return path;

    const parts = path.split(/[\/\\]/); // Split on forward slash or backslash
    if (parts.length <= 3) return path;

    const fileName = parts[parts.length - 1];
    const folder = parts[parts.length - 2];
    return `.../${folder}/${fileName}`;
  };

  // Try to derive a likely local path for display when clientFile is not available
  const derivePossibleLocalPath = (file: P4CheckedOutFile, displayFullPath: boolean = false): string => {
    if (file.clientFile) return formatLocalPath(file.clientFile, displayFullPath);

    // If we have client name but no clientFile, we can try to guess
    if (file.client) {
      const depotParts = file.depotFile.split('/');
      // Remove the first two parts (//depot) and use the rest
      if (depotParts.length > 2) {
        const relativePath = depotParts.slice(2).join('/');
        return `Workspace: ${file.client}/${relativePath}`;
      }
    }

    // If the depot path is something like //depot/folder/file.txt
    // Then display something helpful about this being a depot path
    return `Depot path: ${file.depotFile}`;
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

  // Determine color based on file action
  const getActionColor = (action: string) => {
    switch (action) {
      case 'add':
        return 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100';
      case 'edit':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100';
      case 'delete':
        return 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100';
      case 'integrate':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
    }
  };

  // Handle opening a file in external editor
  const handleOpenFile = async (file: P4CheckedOutFile) => {
    try {
      if (!file.clientFile) {
        alert('Local file path not available. Try refreshing the data or check your Perforce configuration.');
        return;
      }

      // Call API to open file
      const response = await fetch('/api/system/open-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath: file.clientFile }),
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

  // Determine if a file is openable (has a valid local path)
  const isFileOpenable = (file: P4CheckedOutFile): boolean => {
    return !!file.clientFile && file.clientFile.trim() !== '';
  };

  // Try to manually resolve a file's local path
  const handleResolveFilePath = async (file: P4CheckedOutFile) => {
    try {
      // Tell the user we're attempting to resolve the path
      alert(`Attempting to manually resolve local path for: ${file.depotFile}`);

      // Call a dedicated endpoint to try to resolve this path
      const response = await fetch('/api/p4/files/where', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: [file.depotFile] }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.pathMap && data.pathMap[file.depotFile]) {
        // Show success message with the found path
        alert(`Found local path: ${data.pathMap[file.depotFile]}`);

        // We should refresh the file list, but for now just show the path
        console.log('Local path found:', data.pathMap[file.depotFile]);

        // You could add code here to update the file object with the new path
        // This would require modifying the parent component to accept updates
      } else {
        alert(`Failed to resolve path: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error resolving file path:', error);
      alert('Failed to resolve file path');
    }
  };

  // Create UI elements for filters and controls
  const renderFiltersAndControls = () => {
    return (
      <>
        <div className="flex flex-col sm:flex-row justify-between mb-4 gap-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <label htmlFor="filterAction" className="mr-2 text-sm text-gray-600 dark:text-gray-400">Action:</label>
              <select
                id="filterAction"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="border border-gray-300 dark:border-gray-700 rounded-sm px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="all">All</option>
                <option value="edit">Edit</option>
                <option value="add">Add</option>
                <option value="delete">Delete</option>
                <option value="branch">Branch</option>
                <option value="integrate">Integrate</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ItemsPerPageSelector
              itemsPerPage={itemsPerPage}
              onChange={handleItemsPerPageChange}
              options={[10, 20, 50, 100]}
            />
          </div>
        </div>
      </>
    );
  };

  // For empty files list
  if (files.length === 0 && !isLoading && !error) {
    return (
      <div className="w-full">
        {renderFiltersAndControls()}
        <div className="p-4 text-center text-gray-600 dark:text-gray-400">
          No files are currently checked out in this workspace.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {renderFiltersAndControls()}

      {/* Display error if present */}
      {error && (
        <div className="p-4 mb-4 text-center text-red-600 dark:text-red-400 border border-red-300 rounded bg-red-50 dark:bg-red-900/20">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="p-4 text-center border rounded-sm bg-gray-50 dark:bg-gray-800">
          <div className="animate-pulse">Loading checked out files...</div>
        </div>
      ) : files.length === 0 ? (
        <div className="p-4 text-center text-gray-600 dark:text-gray-400 border rounded">
          No files are currently checked out in this workspace.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border rounded-lg dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                    onClick={() => toggleSort('depotFile')}
                  >
                    Depot File {getSortIndicator('depotFile')}
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                    onClick={() => toggleSort('action')}
                  >
                    Action {getSortIndicator('action')}
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                    onClick={() => toggleSort('rev')}
                  >
                    Rev {getSortIndicator('rev')}
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                    onClick={() => toggleSort('clientFile')}
                  >
                    Local File {getSortIndicator('clientFile')}
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {paginatedFiles.map((file, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {getFileName(file.depotFile)}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDepotPath(file.depotFile)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getActionColor(file.action)}`}>
                        {file.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {file.rev}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center group">
                        <span className="truncate max-w-xs" title={file.clientFile}>
                          {formatLocalPath(file.clientFile || '')}
                        </span>
                        {file.clientFile && (
                          <button
                            onClick={(e) => copyPathToClipboard(file.clientFile || '', e)}
                            className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy path to clipboard"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {isFileOpenable(file) ? (
                          <button
                            onClick={() => handleOpenFile(file)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                            title="Open file"
                          >
                            Open
                          </button>
                        ) : (
                          !file.clientFile && (
                            <button
                              onClick={() => handleResolveFilePath(file)}
                              className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                              title="Resolve local path"
                            >
                              Resolve Path
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </>
      )}
    </div>
  );
} 