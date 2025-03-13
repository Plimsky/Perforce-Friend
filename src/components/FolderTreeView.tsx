import { useState, useEffect, useCallback } from 'react';
import { Tree, NodeApi, NodeRendererProps } from 'react-arborist';
import { ChevronRightIcon, ChevronDownIcon, FolderIcon, FolderOpenIcon } from '@heroicons/react/24/outline';
import { saveClientRoot, getClientRoot, saveSelectedFolders, STORAGE_KEYS } from '@/lib/storageUtils';
import { P4Service } from '@/lib/p4Service';
import '../styles/TreeView.css';

// Tree data node type for react-arborist
interface TreeNode {
    id: string;
    name: string;
    path: string;
    isFolder: boolean;
    children?: TreeNode[];
    isSelected?: boolean;
    status?: 'changed' | 'checkedOut' | null;
    isLoading?: boolean;
}

interface FolderTreeViewProps {
    selectedFolders: string[];
    onSelectFolder: (folders: string[]) => void;
}

export default function FolderTreeView({ selectedFolders, onSelectFolder }: FolderTreeViewProps) {
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [clientRoot, setClientRoot] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usingStoredRoot, setUsingStoredRoot] = useState(false);
    const [stylesLoaded, setStylesLoaded] = useState(false);

    // Custom input handling for direct path entry
    const [customPath, setCustomPath] = useState('');

    // Add state for path suggestions
    const [pathSuggestions, setPathSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Add a delay to prevent layout calculations before styles are loaded
    useEffect(() => {
        const timer = setTimeout(() => {
            setStylesLoaded(true);
        }, 100);

        return () => clearTimeout(timer);
    }, []);

    // Handle custom path input
    const handleCustomPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomPath(e.target.value);
    };

    // Load directories from custom path
    const loadCustomPath = () => {
        if (!customPath) return;

        setIsLoading(true);
        setError(null);
        setClientRoot(customPath);

        // Save the custom path to both storage and P4Service
        saveClientRoot(customPath);

        // Also update in P4Service
        const p4Service = P4Service.getInstance();
        p4Service.setClientRoot(customPath);

        fetchDirectories(customPath);
    };

    // Check path and get suggestions when custom path changes
    useEffect(() => {
        const checkPath = async () => {
            if (!customPath) {
                setPathSuggestions([]);
                return;
            }

            try {
                const response = await fetch('/api/system/check-path', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ path: customPath })
                });

                if (!response.ok) {
                    throw new Error('Failed to check path');
                }

                const data = await response.json();

                if (data.success) {
                    // If path exists and is a directory, load it directly
                    if (data.exists && data.isDirectory) {
                        setPathSuggestions(data.suggestions);
                    } else {
                        // Otherwise show suggestions
                        setPathSuggestions(data.suggestions);
                    }

                    setShowSuggestions(data.suggestions.length > 0);
                }
            } catch (error) {
                console.error('Error checking path:', error);
                setPathSuggestions([]);
                setShowSuggestions(false);
            }
        };

        // Use debounce to avoid too many requests
        const timeoutId = setTimeout(checkPath, 500);

        return () => clearTimeout(timeoutId);
    }, [customPath]);

    // Select a suggestion
    const selectSuggestion = (suggestion: string) => {
        setCustomPath(suggestion);
        setShowSuggestions(false);
        loadCustomPath();
    };

    // Fetch client root using various methods
    const getClientRootFromAllSources = (): string | null => {
        // 1. First check P4Service
        const p4Service = P4Service.getInstance();
        const serviceRoot = p4Service.getClientRoot();
        if (serviceRoot) {
            console.log("Found client root in P4Service:", serviceRoot);
            return serviceRoot;
        }

        // 2. Then check localStorage via storageUtils
        const storedRoot = getClientRoot();
        if (storedRoot) {
            console.log("Found client root in localStorage:", storedRoot);
            return storedRoot;
        }

        return null;
    };

    // Fetch client root and initial folder structure
    useEffect(() => {
        // Reset error state
        setError(null);
        setIsLoading(true);

        console.log("FolderTreeView: Initializing...");

        // First, check if we have a client root from any source
        const availableRoot = getClientRootFromAllSources();

        if (availableRoot) {
            console.log("Using available client root:", availableRoot);
            setClientRoot(availableRoot);
            setUsingStoredRoot(true);

            // Ensure the root is saved in both systems for consistency
            saveClientRoot(availableRoot);
            const p4Service = P4Service.getInstance();
            p4Service.setClientRoot(availableRoot);

            // Load directories from client root immediately
            fetchDirectories(availableRoot);

            // Also fetch from API to check for updates, but don't block the UI
            fetchClientRootFromAPI(false);
        } else {
            // If no root is available, fetch from API and block UI with loading state
            fetchClientRootFromAPI(true);
        }
    }, []);

    // Function to fetch client root from API
    const fetchClientRootFromAPI = (showLoading: boolean) => {
        if (showLoading) {
            setIsLoading(true);
        }

        // Fetch client root from API
        fetch('/api/p4/client')
            .then(res => {
                if (!res.ok) {
                    throw new Error(`Error fetching client root: ${res.status} ${res.statusText}`);
                }
                return res.json();
            })
            .then(data => {
                console.log("Client root API response:", data);

                if (data.success && data.clientRoot) {
                    setClientRoot(data.clientRoot);

                    // If this is a real Perforce client root (not a fallback), save it in both systems
                    if (data.clientRootDetected) {
                        console.log("Saving detected client root:", data.clientRoot);
                        saveClientRoot(data.clientRoot);

                        // Also update in P4Service
                        const p4Service = P4Service.getInstance();
                        p4Service.setClientRoot(data.clientRoot);
                    }

                    // If we're not already using a stored root, fetch directories now
                    if (!usingStoredRoot || showLoading) {
                        fetchDirectories(data.clientRoot);
                    }
                } else {
                    console.warn("Client root not available from API, using fallback method");

                    // Check again for a stored root before falling back
                    const storedRoot = getClientRootFromAllSources();
                    if (storedRoot) {
                        console.log("Using previously stored client root as fallback:", storedRoot);
                        setClientRoot(storedRoot);
                        fetchDirectories(storedRoot);
                        return;
                    }

                    if (showLoading) {
                        setError(data.error || "Failed to fetch client root, using fallback");
                        // Use current working directory as fallback
                        getFallbackDirectory();
                    }
                }
            })
            .catch(err => {
                console.error('Error fetching client root:', err);

                // Check again for a stored root before falling back
                const storedRoot = getClientRootFromAllSources();
                if (storedRoot) {
                    console.log("Using previously stored client root after API error:", storedRoot);
                    setClientRoot(storedRoot);
                    fetchDirectories(storedRoot);
                    return;
                }

                if (showLoading) {
                    setError("Failed to connect to server. Using fallback directory.");
                    // Use fallback on error
                    getFallbackDirectory();
                }
            });
    };

    // Get a fallback directory when Perforce client root is not available
    const getFallbackDirectory = async () => {
        try {
            // Try to get the current directory from system API
            const response = await fetch('/api/system/current-directory', {
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`Failed to get current directory: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.directory) {
                console.log("Using fallback directory:", data.directory);
                setClientRoot(data.directory);
                fetchDirectories(data.directory);
            } else {
                // Hard-coded fallback to user's home directory
                console.log("Using home directory as fallback");
                fetchDirectories(process.env.HOME || process.env.USERPROFILE || 'C:\\');
            }
        } catch (error) {
            console.error("Error getting fallback directory:", error);
            // Try with a hard-coded path as last resort
            setIsLoading(false);
            setError("Could not determine a base directory. Please reload or enter a path manually.");
        }
    };

    // Fetch directories for a given path
    const fetchDirectories = async (path: string) => {
        setIsLoading(true);
        setError(null);

        console.log(`FolderTreeView: Fetching directories for path: ${path}`);

        try {
            const response = await fetch('/api/system/directories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Directories response:", data);

            if (data.success) {
                if (data.directories && Array.isArray(data.directories)) {
                    if (data.directories.length === 0) {
                        console.log("No directories found in response");
                    }

                    const items: TreeNode[] = data.directories.map((dir: string) => ({
                        id: dir,
                        name: dir.split(/[/\\]/).pop() || dir,
                        path: dir,
                        isFolder: true,
                        isSelected: selectedFolders.includes(dir),
                        children: [] // Will be loaded when expanded
                    }));

                    console.log(`Processed ${items.length} directories`);
                    setTreeData(items);
                } else {
                    console.error("Invalid directories data:", data.directories);
                    setError("Received invalid directory data from server");
                }
            } else {
                console.error("Failed to fetch directories:", data.error);
                setError(data.error || "Failed to fetch directories");
            }
        } catch (error) {
            console.error('Error fetching directories:', error);
            setError(`Error fetching directories: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle folder expansion (loading children)
    const handleNodeExpand = async (node: NodeApi<TreeNode>) => {
        // If node is already loaded with children or not a folder, do nothing
        if (!node.data.isFolder || (node.children && node.children.length > 0)) {
            return;
        }

        // Set loading state for this node
        setTreeData(prevData => {
            return updateNodeInTree(prevData, node.id, { isLoading: true });
        });

        try {
            console.log(`Expanding node: ${node.data.path}`);
            const response = await fetch('/api/system/directories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: node.data.path })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Subdirectories for ${node.data.path}:`, data);

            if (data.success) {
                const children: TreeNode[] = data.directories.map((dir: string) => ({
                    id: dir,
                    name: dir.split(/[/\\]/).pop() || dir,
                    path: dir,
                    isFolder: true,
                    isSelected: selectedFolders.includes(dir),
                    children: [] // Will be loaded when expanded
                }));

                console.log(`Node ${node.data.path} has ${children.length} children`);

                // Update the tree data with children and remove loading state
                setTreeData(prevData => {
                    return updateNodeInTree(prevData, node.id, {
                        children,
                        isLoading: false
                    });
                });
            } else {
                console.error(`Error loading subdirectories for ${node.data.path}:`, data.error);
                // Remove loading state if there was an error
                setTreeData(prevData => {
                    return updateNodeInTree(prevData, node.id, { isLoading: false });
                });
            }
        } catch (error) {
            console.error(`Error fetching subdirectories for ${node.data.path}:`, error);
            // Remove loading state on error
            setTreeData(prevData => {
                return updateNodeInTree(prevData, node.id, { isLoading: false });
            });
        }
    };

    // Helper function to update a node in the tree
    const updateNodeInTree = (nodes: TreeNode[], nodeId: string, updates: Partial<TreeNode>): TreeNode[] => {
        return nodes.map(item => {
            if (item.id === nodeId) {
                return { ...item, ...updates };
            }
            if (item.children && item.children.length > 0) {
                return {
                    ...item,
                    children: updateNodeInTree(item.children, nodeId, updates)
                };
            }
            return item;
        });
    };

    // Toggle folder selection for inclusion
    const toggleFolderSelection = (node: NodeApi<TreeNode>) => {
        const path = node.data.path;
        const isSelected = !node.data.isSelected;

        // Update the tree data
        setTreeData(prevData => {
            return updateNodeInTree(prevData, node.id, { isSelected });
        });

        // Update the selectedFolders list and persist it
        if (isSelected) {
            const newSelectedFolders = [...selectedFolders, path];
            onSelectFolder(newSelectedFolders);
            saveSelectedFolders(newSelectedFolders);
        } else {
            const newSelectedFolders = selectedFolders.filter(f => f !== path);
            onSelectFolder(newSelectedFolders);
            saveSelectedFolders(newSelectedFolders);
        }
    };

    // Custom node renderer for react-arborist
    const NodeRenderer = useCallback(({ node, style, dragHandle }: NodeRendererProps<TreeNode>) => {
        const { data } = node;
        const isExpanded = node.isOpen;

        return (
            <div
                className="tree-node"
                style={style}
                ref={dragHandle}
            >
                {/* Indent and expand/collapse control */}
                <div className="flex items-center">
                    <button
                        onClick={() => node.toggle()}
                        className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none"
                        disabled={data.isLoading}
                    >
                        {data.isLoading ? (
                            <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
                        ) : isExpanded ? (
                            <ChevronDownIcon className="w-4 h-4" />
                        ) : (
                            <ChevronRightIcon className="w-4 h-4" />
                        )}
                    </button>

                    {/* Folder icon */}
                    <div className="tree-node__icon text-gray-500">
                        {isExpanded ? (
                            <FolderOpenIcon className="w-5 h-5" />
                        ) : (
                            <FolderIcon className="w-5 h-5" />
                        )}
                    </div>
                </div>

                {/* Folder name */}
                <div className="tree-node__label">
                    <span className="text-sm">{data.name}</span>
                </div>

                {/* Checkbox for inclusion */}
                <label className="tree-node__checkbox flex items-center px-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={data.isSelected || false}
                        onChange={() => toggleFolderSelection(node)}
                        className="mr-1 h-4 w-4"
                    />
                </label>
            </div>
        );
    }, [toggleFolderSelection]);

    // Function to retry loading
    const handleRetry = () => {
        setIsLoading(true);
        setError(null);
        setUsingStoredRoot(false);

        // Clear stored client root if retrying (optional, remove if you want to keep it)
        localStorage.removeItem(STORAGE_KEYS.CLIENT_ROOT);

        // Start fresh with API
        fetchClientRootFromAPI(true);
    };

    return (
        <div className="p-2 h-full overflow-auto">
            <div className="font-medium mb-3 p-2 bg-gray-100 dark:bg-gray-800 rounded flex justify-between items-center">
                <span>Workspace Folders</span>
                <button
                    onClick={handleRetry}
                    className="text-xs bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded"
                    title="Reload folders"
                >
                    Reload
                </button>
            </div>

            {isLoading ? (
                <div className="text-center p-4 text-gray-500">
                    <div className="w-8 h-8 mx-auto mb-2 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
                    Loading folders...
                </div>
            ) : error ? (
                <div className="text-center p-4 text-red-500">
                    <div className="mb-2">Error: {error}</div>
                    <button
                        onClick={handleRetry}
                        className="bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded text-sm"
                    >
                        Retry
                    </button>
                </div>
            ) : !stylesLoaded ? (
                // Show a placeholder while waiting for styles to load
                <div className="text-center p-4 text-gray-500">
                    <div className="w-8 h-8 mx-auto mb-2 animate-pulse rounded-full border-2 border-gray-300 border-t-gray-600"></div>
                    Preparing view...
                </div>
            ) : treeData.length === 0 ? (
                <div className="text-center p-4">
                    <p className="text-gray-500 mb-2">No folders found</p>

                    <div className="mt-4 bg-gray-100 dark:bg-gray-800 p-3 rounded">
                        <p className="text-sm mb-2 text-gray-600 dark:text-gray-400">
                            Enter a directory path manually:
                        </p>
                        <div className="flex relative">
                            <input
                                type="text"
                                value={customPath}
                                onChange={handleCustomPathChange}
                                placeholder="e.g., C:/Projects"
                                className="flex-1 px-2 py-1 text-sm border rounded-l dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                            />
                            <button
                                onClick={loadCustomPath}
                                className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded-r text-sm"
                            >
                                Load
                            </button>

                            {/* Path suggestions dropdown */}
                            {showSuggestions && pathSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded shadow-lg z-10 max-h-40 overflow-y-auto">
                                    {pathSuggestions.map((suggestion, index) => (
                                        <div
                                            key={index}
                                            className="px-3 py-1 text-sm hover:bg-blue-100 dark:hover:bg-gray-700 cursor-pointer"
                                            onClick={() => selectSuggestion(suggestion)}
                                        >
                                            {suggestion}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <details className="mt-4 text-xs text-left bg-gray-100 dark:bg-gray-800 p-2 rounded">
                        <summary className="cursor-pointer">Debug Info</summary>
                        <div className="mt-2 text-gray-600 dark:text-gray-400">
                            <p>Client Root: {clientRoot || "Not set"}</p>
                            <p>TreeData: {JSON.stringify(treeData)}</p>
                        </div>
                    </details>
                </div>
            ) : (
                <Tree<TreeNode>
                    data={treeData}
                    width="100%"
                    height={550}
                    indent={20}
                    rowHeight={30}
                    onToggle={(id) => {
                        // Find the node by id and handle expansion if it's a folder
                        const findAndHandleNode = (nodes: TreeNode[]): boolean => {
                            for (const node of nodes) {
                                if (node.id === id) {
                                    if (node.isFolder) {
                                        // Create a node-like object to pass to handleNodeExpand
                                        handleNodeExpand({
                                            data: node,
                                            id,
                                            isOpen: true
                                        } as unknown as NodeApi<TreeNode>);
                                    }
                                    return true;
                                }
                                if (node.children && node.children.length > 0) {
                                    if (findAndHandleNode(node.children)) {
                                        return true;
                                    }
                                }
                            }
                            return false;
                        };

                        findAndHandleNode(treeData);
                    }}
                >
                    {NodeRenderer}
                </Tree>
            )}
        </div>
    );
} 