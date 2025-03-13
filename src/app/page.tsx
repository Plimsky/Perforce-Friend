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
import AppLayout from '@/components/AppLayout';

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

  // Update the Initial fetch useEffect to not run automatically
  useEffect(() => {
    // Disable the automatic scan on page load - the user will use the Scan button instead
    if (runScanOnLoad) {
      // Instead of fetching files, just reset the flag
      setRunScanOnLoad(false);

      // Only set an empty array without running the command
      setModifiedFiles([]);
      setIsLoadingModifiedFiles(false);
    }
  }, [runScanOnLoad]);

  // Update the handleConnect function to not auto-run the scan
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

        // Don't automatically run the fetch modified files on connect
        // Just initialize it with an empty array
        if (showModifiedFiles) {
          setModifiedFiles([]);
          setIsLoadingModifiedFiles(false);
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

      // Only use skipScan=false when forceRun is true to ensure the command only runs when requested
      const skipScan = !forceRun;

      const p4Service = P4Service.getInstance();

      if (p4Service) {
        const result = await p4Service.getModifiedFiles(skipScan);

        if (result.success && result.files) {
          setModifiedFiles(result.files);
          console.log("Received modified files from API:", result.files.length);
          console.log("First few files:", result.files.slice(0, 3));

          // Check if data is from cache
          if ('fromCache' in result && result.fromCache) {
            setUsingCachedData(true);
            // Ensure cacheTime is a string or null
            setCacheTime('cacheTime' in result && typeof result.cacheTime === 'string' ? result.cacheTime : null);
          }

          // Show warning if limit was applied
          if ('limitApplied' in result && result.limitApplied) {
            setModifiedFilesError(`Note: Only showing ${result.files.length} files. There may be more modified files.`);
          } else {
            setModifiedFilesError(undefined);
          }
        } else {
          setModifiedFilesError(result.message || 'No data returned');
          setModifiedFiles([]);
        }

        // Show warning if provided in the response
        if ('warning' in result && result.warning && typeof result.warning === 'string') {
          setModifiedFilesError(result.warning);
        }

        // Check for command logs in the response and log them
        if ('commandLogs' in result && Array.isArray(result.commandLogs)) {
          // Log each command for visibility - pass the full command with details
          result.commandLogs.forEach((log: any) => {
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
      }
    } catch (error) {
      console.error('Error fetching modified files:', error);
      setModifiedFilesError(error instanceof Error ? error.message : 'Failed to fetch modified files');
      setModifiedFiles([]);
    } finally {
      setIsLoadingModifiedFiles(false);
    }
  };

  // Update the handleToggleModifiedFiles function to not auto-run the scan
  const handleToggleModifiedFiles = async () => {
    const newValue = !showModifiedFiles;
    setShowModifiedFiles(newValue);

    // If turning on modified files, don't auto-run the scan
    // Just initialize with an empty array
    if (newValue && connectionStatus.isConnected) {
      setModifiedFiles([]);
      setIsLoadingModifiedFiles(false);
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
    // Force refresh with scan
    fetchModifiedFiles(true, true);
  };

  const handleScanModifiedFiles = () => {
    // Set forceRun to true to execute the scan command
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

  // Check connection on page load
  useEffect(() => {
    checkConnection();
  }, []);

  // Check connection to Perforce server
  const checkConnection = async () => {
    setIsConnecting(true);
    try {
      const p4Service = P4Service.getInstance();
      const status = p4Service.getConnectionStatus();

      if (!status.isConnected) {
        // Try to reconnect
        await p4Service.reconnect();
        // Get updated status
        const updatedStatus = p4Service.getConnectionStatus();
        setConnectionStatus({
          isConnected: updatedStatus.isConnected,
          message: updatedStatus.isConnected
            ? 'Connected to Perforce server'
            : 'Not connected to Perforce server',
          details: updatedStatus.details
        });
      } else {
        setConnectionStatus({
          isConnected: true,
          message: 'Connected to Perforce server',
          details: status.details
        });
      }
    } catch (error) {
      setConnectionStatus({
        isConnected: false,
        message: 'Failed to connect to Perforce server',
        details: {}
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <main className="min-h-screen">
      {/* Connection status header */}
      <div className={`py-1 px-4 text-sm ${connectionStatus.isConnected
        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
        }`}>
        {connectionStatus.message}
      </div>

      {/* Main content */}
      {connectionStatus.isConnected ? (
        <AppLayout />
      ) : (
        <div className="flex justify-center items-center h-screen">
          <div className="p-4 bg-white dark:bg-gray-800 shadow rounded max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Perforce Connection Required</h2>
            <p className="mb-4">Please ensure your Perforce server is running and properly configured.</p>
            <button
              onClick={checkConnection}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Try Again'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
} 