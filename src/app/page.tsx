'use client';

import { useState, useEffect } from 'react';
import P4ConnectionForm, { P4Config } from '../components/P4ConnectionForm';
import CheckedOutFilesList from '../components/CheckedOutFilesList';
import ModifiedFilesList from '../components/ModifiedFilesList';
import P4CommandLogViewer from '../components/P4CommandLogViewer';
import { P4Service } from '../lib/p4Service';
import { P4CheckedOutFile, P4ModifiedFile } from '../types/p4';
import useLocalStorage from '../lib/useLocalStorage';
import { initP4CommandLogger, logP4CommandFromAPI } from '../lib/p4CommandLogger';

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingModifiedFiles, setIsLoadingModifiedFiles] = useState(false);
  const [reconcileStartTime, setReconcileStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [checkedOutFiles, setCheckedOutFiles] = useState<P4CheckedOutFile[]>([]);
  const [modifiedFiles, setModifiedFiles] = useState<P4ModifiedFile[]>([]);
  const [filesError, setFilesError] = useState<string | undefined>(undefined);
  const [modifiedFilesError, setModifiedFilesError] = useState<string | undefined>(undefined);
  const [showModifiedFiles, setShowModifiedFiles] = useLocalStorage<boolean>('perforceFriend_showModifiedFiles', true);
  const [p4ClientRoot, setP4ClientRoot] = useState('');
  const [maxFiles, setMaxFiles] = useState(100);
  const [showClientRootInput, setShowClientRootInput] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [cacheTime, setCacheTime] = useState<string | null>(null);
  const [showCommandLogs, setShowCommandLogs] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: false,
    message: 'Not connected to Perforce server',
    details: {} as Partial<P4Config>
  });

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
          fetchCheckedOutFiles();

          // If showModifiedFiles is true, fetch modified files as well
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

        // Fetch files after successful connection
        await fetchCheckedOutFiles();

        // Fetch modified files if enabled
        if (showModifiedFiles) {
          await fetchModifiedFiles();
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

  const fetchModifiedFiles = async (forceRefresh = false) => {
    try {
      setIsLoadingModifiedFiles(true);
      setModifiedFilesError(undefined);
      setReconcileStartTime(Date.now());
      setElapsedTime(0);
      setUsingCachedData(false);
      setCacheTime(null);

      const p4Service = P4Service.getInstance();

      // Build URL with optional clientRoot parameter
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

      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }

      // Log the command (approximate since the actual command is constructed server-side)
      logP4CommandFromAPI(`p4 reconcile -n${forceRefresh ? ' (force refresh)' : ''}`);

      const response = await fetch(url);
      const data = await response.json();

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
    const newShowModifiedFiles = !showModifiedFiles;
    setShowModifiedFiles(newShowModifiedFiles);

    // If turning on and we don't have data yet, fetch it
    if (newShowModifiedFiles && modifiedFiles.length === 0 && !modifiedFilesError) {
      await fetchModifiedFiles();
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
    if (connectionStatus.isConnected && showModifiedFiles) {
      fetchModifiedFiles(true);
    }
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
                          text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Command Logs
                </button>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md 
                          text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
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
                        text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 
                        focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingFiles || isLoadingModifiedFiles ? 'Refreshing...' : 'Refresh'}
                </button>
                <label className="inline-flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={showModifiedFiles}
                    onChange={handleToggleModifiedFiles}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
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
                        max="1000"
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
                                text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 
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
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Modified Files (Not Checked Out)
                  </h3>
                  <div className="flex items-center space-x-3">
                    {usingCachedData && !isLoadingModifiedFiles && (
                      <div className="flex items-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
                          Using cached data {cacheTime && `(${formatCacheTime(cacheTime)})`}
                        </span>
                        <button
                          onClick={handleForceRefreshModifiedFiles}
                          disabled={isLoadingModifiedFiles}
                          className="text-xs text-primary-600 hover:text-primary-800 underline"
                        >
                          Refresh
                        </button>
                      </div>
                    )}
                    {isLoadingModifiedFiles && (
                      <div className="text-sm text-yellow-600 dark:text-yellow-400">
                        Loading... {elapsedTime > 0 && `(${elapsedTime}s)`}
                      </div>
                    )}
                  </div>
                </div>

                {isLoadingModifiedFiles && elapsedTime > 10 && (
                  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-sm rounded-md">
                    <p>The reconcile command is taking a while to run. This is normal for large workspaces.</p>
                    <p>Please be patient, the command will complete eventually. Perforce is scanning your local files and comparing them with the server.</p>
                    <p className="mt-1 font-medium">Results will be cached for 60 minutes to avoid this delay on subsequent requests.</p>
                  </div>
                )}

                <ModifiedFilesList
                  files={modifiedFiles}
                  isLoading={isLoadingModifiedFiles}
                  error={modifiedFilesError}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* P4 Command Log Viewer */}
      <P4CommandLogViewer isOpen={showCommandLogs} onClose={() => setShowCommandLogs(false)} />
    </main>
  );
} 