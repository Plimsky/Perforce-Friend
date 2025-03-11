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

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-pulse">Loading checked out files...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="p-4 text-center text-gray-600 dark:text-gray-400">
        No files are currently checked out in this workspace.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row justify-between mb-4 gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <label htmlFor="action-filter" className="mr-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Filter by action:
            </label>
            <select
              id="action-filter"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm py-1 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm"
            >
              <option value="all">All</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-72"
                onClick={() => toggleSort('depotFile')}
              >
                <div className="flex items-center">
                  File
                  {getSortIndicator('depotFile')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-28"
                onClick={() => toggleSort('action')}
              >
                <div className="flex items-center">
                  Action
                  {getSortIndicator('action')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-24"
                onClick={() => toggleSort('rev')}
              >
                <div className="flex items-center">
                  Revision
                  {getSortIndicator('rev')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-36"
                onClick={() => toggleSort('change')}
              >
                <div className="flex items-center">
                  Changelist
                  {getSortIndicator('change')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 w-80"
                onClick={() => toggleSort('clientFile')}
              >
                <div className="flex items-center">
                  Local Path
                  {getSortIndicator('clientFile')}
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {paginatedFiles.map((file, index) => (
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
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(file.action)}`}>
                    {file.action}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {file.rev}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {file.change}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center group">
                    <span className="truncate max-w-xs" title={derivePossibleLocalPath(file, true)}>
                      {derivePossibleLocalPath(file)}
                    </span>
                    {file.clientFile && (
                      <button
                        onClick={(e) => copyPathToClipboard(file.clientFile, e)}
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
                  {isFileOpenable(file) ? (
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
                  ) : (
                    <div className="flex space-x-2">
                      <span className="text-gray-400 dark:text-gray-600 text-xs italic">Path unavailable</span>
                      <button
                        onClick={() => handleResolveFilePath(file)}
                        className="inline-flex items-center px-2 py-1 border border-gray-300 dark:border-gray-600 shadow-sm text-xs font-medium rounded text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        title="Try to resolve the local path for this file"
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                        Resolve
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        Showing {paginatedFiles.length > 0 ?
          `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, sortedFiles.length)} of ${sortedFiles.length}` :
          `0 of ${sortedFiles.length}`
        } filtered files
        {filterAction !== 'all' && ` (filtered by action: ${filterAction})`}
      </div>

      {/* Pagination controls */}
      <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
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