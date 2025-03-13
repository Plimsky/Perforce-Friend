'use client';

import { useState, useEffect, useRef } from 'react';
import P4ConnectionForm, { P4Config } from '../components/P4ConnectionForm';
import CheckedOutFilesList from '../components/CheckedOutFilesList';
import ModifiedFilesList from '@/components/ModifiedFilesList';
import P4CommandLogViewer from '../components/P4CommandLogViewer';
import DirectoryBrowser from '../components/DirectoryBrowser';
import { P4Service } from '../lib/p4Service';
import { P4CheckedOutFile, P4ModifiedFile } from '../types/p4';
import { useLocalStorage } from '@/lib/useLocalStorage';
import { initP4CommandLogger, logP4CommandFromAPI } from '../lib/p4CommandLogger';
import path from 'path-browserify';
import { ModifiedFile } from '@/types/modifiedFiles';

// Constants for localStorage keys
const INCLUSION_FOLDERS_KEY = 'perforceFriend_inclusionFolders';

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingModifiedFiles, setIsLoadingModifiedFiles] = useState(false);
  const [reconcileStartTime, setReconcileStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [checkedOutFiles, setCheckedOutFiles] = useState<P4CheckedOutFile[]>([]);
  const [modifiedFiles, setModifiedFiles] = useState<ModifiedFile[]>([]);
  const [filesError, setFilesError] = useState<string | undefined>(undefined);
  const [modifiedFilesError, setModifiedFilesError] = useState<string | undefined>(undefined);
  const [showModifiedFiles, setShowModifiedFiles] = useLocalStorage<boolean>('perforceFriend_showModifiedFiles', true);
  const [p4ClientRoot, setP4ClientRoot] = useState('');
  const [maxFiles, setMaxFiles] = useState(1000);
  const [showClientRootInput, setShowClientRootInput] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [cacheTime, setCacheTime] = useState<string | null>(null);
  const [showCommandLogs, setShowCommandLogs] = useState(false);
  const [showInclusionFolders, setShowInclusionFolders] = useState(false);
  const [inclusionFoldersString, setInclusionFoldersString] = useLocalStorage<string>(INCLUSION_FOLDERS_KEY, '');
  const [inclusionFolders, setInclusionFolders] = useState<string[]>([]);
  const [newInclusionFolder, setNewInclusionFolder] = useState('');
  const [hasRunInitialScan, setHasRunInitialScan] = useLocalStorage<boolean>('perforceFriend_hasRunInitialScan', false);
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: false,
    message: 'Not connected to Perforce server',
    details: {} as Partial<P4Config>
  });
  const [runScanOnLoad, setRunScanOnLoad] = useState<boolean>(false);
  const hasProcessedArrayRef = useRef(false);

  // Track elapsed time when loading modified files
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;

    if (isLoadingModifiedFiles && reconcileStartTime) {
      timerId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - reconcileStartTime) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    } else if (timerId) {
      clearInterval(timerId);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isLoadingModifiedFiles, reconcileStartTime]);

  // Try to reconnect on component mount
  useEffect(() => {
    const attemptReconnect = async () => {
      try {
        setIsConnecting(true);
        const p4Service = P4Service.getInstance();

        // Check if service already has a connection (from localStorage)
        const status = p4Service.getConnectionStatus();
        if (status.isConnected) {
          setConnectionStatus({
            isConnected: true,
            message: 'Connected to Perforce server',
            details: status.details
          });

          // Fetch checked out files initially
          await fetchCheckedOutFiles();

          // If showModifiedFiles is true, fetch modified files after checked out files are loaded
          if (showModifiedFiles) {
            fetchModifiedFiles();
          }
        }
      } catch (error) {
        console.error('Error during reconnection:', error);
        setConnectionStatus({
          isConnected: false,
          message: 'Failed to reconnect to Perforce server',
          details: {}
        });
      } finally {
        setIsConnecting(false);
      }
    };

    attemptReconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Parse inclusion folders from localStorage
  useEffect(() => {
    if (inclusionFoldersString) {
      try {
        let folders: string[] = [];

        // Handle both old format (array stored directly) and new format (comma-separated string)
        if (typeof inclusionFoldersString === 'string') {
          folders = inclusionFoldersString.split(',').filter(f => f.trim() !== '');
          setInclusionFolders(folders);
        } else if (Array.isArray(inclusionFoldersString) && !hasProcessedArrayRef.current) {
          // If inclusionFoldersString is actually an array (from old localStorage format)
          // Only process array format once to avoid infinite loops
          folders = inclusionFoldersString;
          setInclusionFolders(folders);

          // Mark that we've processed the array format
          hasProcessedArrayRef.current = true;

          // Convert to string format for consistency
          setInclusionFoldersString(folders.join(','));

          console.log('Converted array format to string format:', folders);

          // If we have inclusion folders, run scan on load
          if (folders.length > 0) {
            setRunScanOnLoad(true);
          }

          return; // Early return to avoid double processing
        }

        // If we have inclusion folders, run scan on load (for string format)
        if (folders.length > 0) {
          setRunScanOnLoad(true);
        }

      } catch (error) {
        console.error('Error parsing inclusion folders:', error, 'Value:', inclusionFoldersString);
        // Reset to empty string to avoid future errors
        setInclusionFolders([]);

        // Only reset if we haven't processed array format yet
        if (!hasProcessedArrayRef.current) {
          hasProcessedArrayRef.current = true;
          setInclusionFoldersString('');
        }
      }
    }
  }, [inclusionFoldersString]);

  // Initial fetch on page load, but only if we have inclusion folders
  useEffect(() => {
    if (runScanOnLoad) {
      fetchModifiedFiles();
      setRunScanOnLoad(false);
    }
  }, [runScanOnLoad]);

  const handleConnect = async (config: P4Config) => {
    try {
      setIsConnecting(true);

      const p4Service = P4Service.getInstance();
      const result = await p4Service.connect(config);

      // Log the command
      logP4CommandFromAPI('p4 connect');

      if (result.success) {
        // Update connection status
        setConnectionStatus({
          isConnected: true,
          message: result.message,
          details: config
        });

        // Set client root if returned from API
        if (result.clientRoot) {
          console.log('Setting client root from API:', result.clientRoot);
          setP4ClientRoot(result.clientRoot);
        }

        // Fetch checked out files after successful connection
        await fetchCheckedOutFiles();

        // Fetch modified files if enabled (but don't auto-run full scan)
        if (showModifiedFiles) {
          // Only auto-run if inclusion folders are defined, or we've already done an initial scan
          const shouldAutoRun = inclusionFolders.length > 0 || hasRunInitialScan;
          await fetchModifiedFiles(false, shouldAutoRun);
        }
      } else {
        setConnectionStatus({
          isConnected: false,
          message: result.message,
          details: {}
        });
      }
    } catch (error) {
      console.error('Error connecting to Perforce:', error);
      setConnectionStatus({
        isConnected: false,
        message: error instanceof Error ? error.message : 'Failed to connect to Perforce',
        details: {}
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const fetchCheckedOutFiles = async () => {
    try {
      setIsLoadingFiles(true);
      setFilesError(undefined);

      const p4Service = P4Service.getInstance();
      const result = await p4Service.getCheckedOutFiles();

      // Log the command
      logP4CommandFromAPI('p4 opened');

      if (result.success && result.files) {
        setCheckedOutFiles(result.files);
      } else {
        setFilesError(result.message);
        setCheckedOutFiles([]);
      }
    } catch (error) {
      console.error('Error fetching checked out files:', error);
      setFilesError(error instanceof Error ? error.message : 'Failed to fetch checked out files');
      setCheckedOutFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const fetchModifiedFiles = async (forceRefresh = false, forceRun = false) => {
    try {
      // If we're still loading checked out files and this is not a forced refresh, wait until that's done
      if (isLoadingFiles && showModifiedFiles && !forceRefresh) {
        console.log('Waiting for checked out files to finish loading before loading modified files');
        return;
      }

      // Skip running the command if:
      // 1. No inclusion folders are specified
      // 2. We haven't explicitly decided to run it (via Scan button or forceRun parameter)
      // 3. We haven't done the initial scan yet
      if (!inclusionFolders.length && !forceRun && !hasRunInitialScan && !forceRefresh) {
        // Set an empty result without running the command
        setModifiedFiles([]);
        setIsLoadingModifiedFiles(false);
        return;
      }

      setIsLoadingModifiedFiles(true);
      setModifiedFilesError(undefined);
      setReconcileStartTime(Date.now());
      setElapsedTime(0);
      setUsingCachedData(false);
      setCacheTime(null);

      // If this is a manual scan of the full workspace, mark that we've done the initial scan
      if (forceRun && !inclusionFolders.length) {
        setHasRunInitialScan(true);
      }

      const p4Service = P4Service.getInstance();

      // Build URL with optional parameters
      let url = '/api/p4/files/modified';
      const params = new URLSearchParams();

      if (p4ClientRoot) {
        params.append('clientRoot', p4ClientRoot);
      }

      if (maxFiles) {
        params.append('maxFiles', maxFiles.toString());
      }

      if (forceRefresh) {
        params.append('forceRefresh', 'true');
      }

      // Add inclusion folders if specified
      if (inclusionFolders.length > 0) {
        params.append('inclusionFolders', inclusionFolders.join(','));
      }

      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }

      // Call the API
      const response = await fetch(`${url}?${params.toString()}`);
      const data = await response.json();

      // Check for command logs in the response and log them
      if (data.commandLogs && Array.isArray(data.commandLogs)) {
        // Log each command for visibility - pass the full command with details
        data.commandLogs.forEach((log: any) => {
          // Only log completed commands or errors/skipped to avoid cluttering the log
          if (log.command && (log.command.includes('COMPLETED') ||
            log.status === 'error' ||
            log.status === 'skipped')) {
            // Use the formatted command string with all details included
            logP4CommandFromAPI(log.command);
          }
        });
      } else {
        // Fallback to simple command logging if detailed logs aren't available
        let folderInfo = '';
        if (inclusionFolders.length > 0) {
          folderInfo = ` (folders: ${inclusionFolders.join(', ')})`;
        }
        logP4CommandFromAPI(`p4 reconcile -n${forceRefresh ? ' (force refresh)' : ''}${folderInfo}`);
      }

      if (!response.ok) {
        // Check if the error is because of workspace path issues
        if (data.error && (data.error.includes('workspace') || data.error.includes('client'))) {
          setShowClientRootInput(true);

          // If we got a client root path in the error details, pre-fill it
          if (data.details && data.details.includes('located at:')) {
            const pathMatch = data.details.match(/located at: (.+)$/);
            if (pathMatch && pathMatch[1] && !p4ClientRoot) {
              setP4ClientRoot(pathMatch[1]);
            }
          }
        } else if (data.error && data.error.includes('buffer')) {
          // Handle buffer overflow errors
          setShowClientRootInput(true);
          setModifiedFilesError(`${data.error}. Try reducing the number of files.`);
        } else if (data.error && data.error.includes('timed out')) {
          // Handle timeout errors
          setShowClientRootInput(true);
          setModifiedFilesError(`${data.error}. Please try again or use a more specific folder path.`);
        }

        throw new Error(data.error || 'Failed to get modified files');
      }

      if (data.success && data.files) {
        console.log("Received modified files from API:", data.files.length);
        console.log("First few files:", data.files.slice(0, 3));
        setModifiedFiles(data.files);

        // Check if data is from cache
        if (data.fromCache) {
          setUsingCachedData(true);
          setCacheTime(data.cacheTime);
        }

        // Show warning if limit was applied
        if (data.limitApplied) {
          setModifiedFilesError(`Note: Only showing ${data.files.length} files. There may be more modified files.`);
        } else {
          setModifiedFilesError(undefined);
        }
      } else {
        setModifiedFilesError(data.message || 'No data returned');
        setModifiedFiles([]);
      }

      // Show warning if provided in the response
      if (data.warning) {
        setModifiedFilesError(data.warning);
      }
    } catch (error) {
      console.error('Error fetching modified files:', error);
      setModifiedFilesError(error instanceof Error ? error.message : 'Failed to fetch modified files');
      setModifiedFiles([]);
    } finally {
      setIsLoadingModifiedFiles(false);
      setReconcileStartTime(null);
    }
  };

  const handleToggleModifiedFiles = async () => {
    const newValue = !showModifiedFiles;
    setShowModifiedFiles(newValue);

    // If turning on modified files and we have a connection, fetch them
    if (newValue && connectionStatus.isConnected) {
      // Only auto-run if inclusion folders are defined, or we've already done an initial scan
      const shouldAutoRun = inclusionFolders.length > 0 || hasRunInitialScan;
      await fetchModifiedFiles(false, shouldAutoRun);
    }
  };

  const handleLogout = () => {
    const p4Service = P4Service.getInstance();
    p4Service.disconnect();
    setConnectionStatus({
      isConnected: false,
      message: 'Logged out from Perforce server',
      details: {}
    });
    setCheckedOutFiles([]);
    setModifiedFiles([]);
  };

  const handleRefreshFiles = () => {
    if (connectionStatus.isConnected) {
      fetchCheckedOutFiles();
      if (showModifiedFiles) {
        fetchModifiedFiles();
      }
    }
  };

  const handleForceRefreshModifiedFiles = () => {
    fetchModifiedFiles(true, true);
  };

  const handleScanModifiedFiles = () => {
    fetchModifiedFiles(false, true);
  };

  const handleClientRootChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setP4ClientRoot(e.target.value);
  };

  const handleMaxFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setMaxFiles(value);
    }
  };

  // Format the cache time in a readable format
  const formatCacheTime = (isoTime: string | null) => {
    if (!isoTime) return '';

    try {
      const date = new Date(isoTime);
      return date.toLocaleTimeString();
    } catch (e) {
      return '';
    }
  };

  // Initialize command logger
  useEffect(() => {
    const cleanup = initP4CommandLogger();
    return cleanup;
  }, []);

  // Function to add a new inclusion folder
  const handleAddInclusionFolder = (folder?: string) => {
    // Allow the folder to be passed from DirectoryBrowser's onSelect
    const folderToAdd = folder || newInclusionFolder.trim();

    if (!folderToAdd) return;

    // Use the full path as provided - DirectoryBrowser now handles both absolute and relative paths
    let folderPath = folderToAdd;

    console.log(`Adding inclusion folder: ${folderPath}`);

    // Check if this folder is already in the list
    if (!inclusionFolders.includes(folderPath)) {
      const newFolders = [...inclusionFolders, folderPath];
      setInclusionFolders(newFolders);
      setInclusionFoldersString(newFolders.join(','));

      // If we're showing modified files, refresh the list with the new inclusion folder
      if (showModifiedFiles) {
        // Pass true to force a refresh with the updated inclusion folders
        fetchModifiedFiles(true);
      }
    }

    // Clear the input
    setNewInclusionFolder('');
  };

  // Format a path for display - make it relative to client root if possible
  const formatFolderPath = (folderPath: string) => {
    if (!p4ClientRoot || !folderPath.startsWith(p4ClientRoot)) {
      return folderPath;
    }

    // Get the path relative to client root
    let relativePath = folderPath.substring(p4ClientRoot.length);

    // Remove leading slash or backslash if present
    if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
      relativePath = relativePath.substring(1);
    }

    // If empty, it's the root itself
    if (!relativePath) {
      return '(Workspace Root)';
    }

    return relativePath;
  };

  // Handle removing an inclusion folder
  const handleRemoveInclusionFolder = (folder: string) => {
    const newFolders = inclusionFolders.filter(f => f !== folder);
    setInclusionFolders(newFolders);
    setInclusionFoldersString(newFolders.join(','));
  };

  // Update localStorage when inclusion folders change
  const handleInclusionFoldersChange = (folders: string[]) => {
    setInclusionFolders(folders);
    setInclusionFoldersString(folders.join(','));
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Perforce Friend
          </h1>

          <div className="flex space-x-3">
            {connectionStatus.isConnected && (
              <>
                <button
                  onClick={() => setShowCommandLogs(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md 
                          text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Command Logs
                </button>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md 
                      text-white bg-gray-600 hover:bg-gray-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-gray-600 dark:text-gray-300 mb-6">
          A modern web client for Perforce version control
        </p>

        <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              Server Status
            </h2>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${connectionStatus.isConnected
              ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
              : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
              }`}>
              {connectionStatus.isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>

          <p className="text-gray-600 dark:text-gray-300 mb-2">
            {connectionStatus.message}
          </p>

          {connectionStatus.isConnected && connectionStatus.details && (
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              <p>Server: {connectionStatus.details.port}</p>
              <p>User: {connectionStatus.details.user}</p>
              {connectionStatus.details.client && (
                <p>Workspace: {connectionStatus.details.client}</p>
              )}
            </div>
          )}
        </div>

        {!connectionStatus.isConnected && (
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
              Connect to Perforce
            </h2>
            <P4ConnectionForm onConnect={handleConnect} isLoading={isConnecting} />
          </div>
        )}

        {connectionStatus.isConnected && (
          <div className="space-y-6">
            <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:justify-between sm:items-center">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                Workspace Files
              </h2>
              <div className="flex space-x-3 items-center">
                <button
                  onClick={handleRefreshFiles}
                  disabled={isLoadingFiles || isLoadingModifiedFiles}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md 
                        text-white bg-primary-600 hover:bg-primary-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 
                        focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingFiles || isLoadingModifiedFiles ? 'Refreshing...' : 'Refresh'}
                </button>
                <label className="inline-flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={showModifiedFiles}
                    onChange={handleToggleModifiedFiles}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded-sm"
                  />
                  <span>Show Modified Files</span>
                </label>
              </div>
            </div>

            {/* Client root input for modified files */}
            {showModifiedFiles && showClientRootInput && (
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-yellow-50 dark:bg-yellow-900">
                <h3 className="text-md font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                  Perforce Workspace Configuration
                </h3>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                  Your current directory is not in your Perforce workspace or there were too many files to process. Please specify:
                </p>

                <div className="flex flex-col space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <label htmlFor="clientRoot" className="block text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                        Workspace Root Path:
                      </label>
                      <input
                        id="clientRoot"
                        type="text"
                        value={p4ClientRoot}
                        onChange={handleClientRootChange}
                        placeholder="e.g., C:\path\to\workspace or /path/to/workspace"
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 py-2 px-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>

                    <div className="sm:w-32">
                      <label htmlFor="maxFiles" className="block text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                        Max Files:
                      </label>
                      <input
                        id="maxFiles"
                        type="number"
                        min="10"
                        max="5000"
                        value={maxFiles}
                        onChange={handleMaxFilesChange}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 py-2 px-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => fetchModifiedFiles()}
                      disabled={isLoadingModifiedFiles || !p4ClientRoot}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md 
                                text-white bg-primary-600 hover:bg-primary-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 
                                focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingModifiedFiles ? 'Loading...' : 'Apply'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Checked Out Files
              </h3>
              <CheckedOutFilesList
                files={checkedOutFiles}
                isLoading={isLoadingFiles}
                error={filesError}
              />
            </div>

            {showModifiedFiles && (
              <div className="mt-8">
                {/* Modified files panel header */}
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Modified Files {isLoadingModifiedFiles && !usingCachedData && reconcileStartTime && (
                      <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                        (Running p4 reconcile: {elapsedTime}s)
                      </span>
                    )}
                  </h2>

                  <div className="flex space-x-2">
                    {!inclusionFolders.length && !hasRunInitialScan ? (
                      <button
                        onClick={handleScanModifiedFiles}
                        className={`inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-sm font-medium rounded ${inclusionFolders.length
                          ? 'text-white bg-green-600 hover:bg-green-700 ring-2 ring-green-300 dark:ring-green-500 ring-offset-2'
                          : 'text-white bg-green-600 hover:bg-green-700'
                          } focus:outline-hidden`}
                        disabled={isLoadingModifiedFiles}
                      >
                        {isLoadingModifiedFiles ? 'Scanning...' : inclusionFolders.length ? 'Scan Selected Folders' : 'Scan Workspace'}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleScanModifiedFiles}
                          className={`inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-sm font-medium rounded ${inclusionFolders.length
                            ? 'text-white bg-green-600 hover:bg-green-700 ring-2 ring-green-300 dark:ring-green-500 ring-offset-2'
                            : 'text-white bg-green-600 hover:bg-green-700'
                            } focus:outline-hidden`}
                          disabled={isLoadingModifiedFiles}
                        >
                          {isLoadingModifiedFiles ? 'Scanning...' : inclusionFolders.length ? 'Scan Selected Folders' : 'Scan Workspace'}
                        </button>
                        <button
                          onClick={handleForceRefreshModifiedFiles}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 shadow-xs text-sm font-medium rounded-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-hidden"
                          disabled={isLoadingModifiedFiles}
                        >
                          {isLoadingModifiedFiles ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Instructions when no scan has been performed */}
                {!inclusionFolders.length && !hasRunInitialScan && !isLoadingModifiedFiles && (
                  <div className="mb-4 p-4 border border-blue-200 dark:border-blue-800 rounded-md bg-blue-50 dark:bg-blue-900">
                    <h3 className="text-md font-medium text-blue-900 dark:text-blue-100 mb-2">
                      Workspace Scan Required
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      A full workspace scan with p4 reconcile is required to detect modified files. This operation can be time-consuming for large workspaces.
                    </p>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      You have two options:
                    </p>
                    <ul className="list-disc list-inside text-sm text-blue-800 dark:text-blue-200 mb-3">
                      <li className="mb-1">Click the "Scan Workspace" button to scan your entire workspace</li>
                      <li>Specify individual folders to scan instead (faster) using the "Specify Folders" button</li>
                    </ul>
                    <div className="flex justify-end">
                      <button
                        onClick={handleScanModifiedFiles}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-sm"
                      >
                        Scan Now
                      </button>
                    </div>
                  </div>
                )}

                {/* Inclusion folders UI */}
                {showInclusionFolders && (
                  <div className="mb-4 p-4 border border-blue-200 dark:border-blue-800 rounded-md bg-blue-50 dark:bg-blue-900">
                    <h3 className="text-md font-medium text-blue-900 dark:text-blue-100 mb-2">
                      Specify folders for p4 reconcile
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      Running p4 reconcile on specific folders can significantly improve performance.
                      Leave empty to run on the entire workspace.
                    </p>

                    <div className="mb-3">
                      {p4ClientRoot ? (
                        <div className="flex flex-col space-y-2">
                          <DirectoryBrowser
                            value={newInclusionFolder}
                            onChange={setNewInclusionFolder}
                            clientRoot={p4ClientRoot}
                            placeholder="Browse or enter folder path"
                            onSelect={handleAddInclusionFolder}
                            className="flex-1"
                            inputClassName="bg-white text-gray-900 border-gray-300"
                          />
                          <div className="text-xs text-blue-700 dark:text-blue-300">
                            Type to search directories recursively. Click a folder to add it for scanning.
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col space-y-2">
                          <DirectoryBrowser
                            value={newInclusionFolder}
                            onChange={setNewInclusionFolder}
                            clientRoot=""
                            placeholder="Enter folder path (relative to workspace root)"
                            onSelect={handleAddInclusionFolder}
                            className="flex-1"
                            inputClassName="bg-white text-gray-900 border-gray-300"
                          />
                          <div className="text-xs text-yellow-600 dark:text-yellow-400">
                            Note: For better directory browsing, set your client root in the settings above.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* List of current inclusion folders */}
                    <div className="space-y-2">
                      {inclusionFolders.length > 0 ? (
                        <div>
                          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">Selected Folders:</h4>
                          <ul className="space-y-1">
                            {inclusionFolders.map((folder, index) => (
                              <li key={index} className="flex items-center justify-between bg-white dark:bg-gray-700 p-2 rounded-sm">
                                <span className="text-sm text-gray-800 dark:text-gray-200" title={folder}>
                                  {formatFolderPath(folder)}
                                </span>
                                <button
                                  onClick={() => handleRemoveInclusionFolder(folder)}
                                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </li>
                            ))}
                          </ul>

                          {/* Add a clear call-to-action */}
                          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-green-800 dark:text-green-200">Folders selected!</p>
                              <p className="text-xs text-green-700 dark:text-green-300">Click the "Scan Selected Folders" button above to run p4 reconcile on these locations.</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          No folders selected yet. Add folders above to scan specific locations, or use "Scan Workspace" to scan everything.
                        </div>
                      )}
                    </div>

                    {inclusionFolders.length > 0 && (
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={handleForceRefreshModifiedFiles}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-sm"
                          disabled={isLoadingModifiedFiles}
                        >
                          {isLoadingModifiedFiles ? 'Running...' : 'Run On Specified Folders'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Cache information */}
                {usingCachedData && cacheTime && (
                  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-sm rounded-md">
                    Using cached data from {formatCacheTime(cacheTime)}. Click Refresh to get latest changes.
                  </div>
                )}

                {/* Modified files list - show empty state if no scan has been run */}
                {!inclusionFolders.length && !hasRunInitialScan && !isLoadingModifiedFiles ? (
                  <div className="p-8 text-center border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900">
                    <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-gray-100">No scan performed yet</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Use the Scan button above to check for modified files</p>
                  </div>
                ) : (
                  <ModifiedFilesList
                    files={modifiedFiles}
                    isLoading={isLoadingModifiedFiles}
                    error={modifiedFilesError || null}
                    onRefresh={fetchModifiedFiles}
                    lastChecked={reconcileStartTime ? new Date(reconcileStartTime).toISOString() : null}
                    inclusionFolders={inclusionFolders}
                    onInclusionFoldersChange={handleInclusionFoldersChange}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* P4 Command Log Viewer */}
      <P4CommandLogViewer isOpen={showCommandLogs} onClose={() => setShowCommandLogs(false)} />

      {/* Floating scroll-to-top button - replaces the previous scan button */}
      <div className="fixed bottom-4 right-4 z-10">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center justify-center p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
          title="Scroll to top"
          aria-label="Scroll to top of page"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </main>
  );
} 