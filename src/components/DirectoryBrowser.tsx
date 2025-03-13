'use client';

import { useState, useEffect, useRef } from 'react';
import path from 'path-browserify';

interface Directory {
    name: string;
    path: string;
    isDirectory: boolean;
}

interface DirectoryBrowserProps {
    value: string;
    onChange: (value: string) => void;
    clientRoot: string;
    placeholder?: string;
    onSelect?: (directory: string) => void;
    className?: string;
    inputClassName?: string;
    suggestionsClassName?: string;
    autoAddSelected?: boolean;
    excludedFolders?: string[];
}

export default function DirectoryBrowser({
    value,
    onChange,
    clientRoot,
    placeholder = 'Enter directory path',
    onSelect,
    className = '',
    inputClassName = '',
    suggestionsClassName = '',
    autoAddSelected = false,
    excludedFolders = []
}: DirectoryBrowserProps) {
    const [directories, setDirectories] = useState<Directory[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [currentPath, setCurrentPath] = useState('');
    const [detectedClientRoot, setDetectedClientRoot] = useState(clientRoot || '');
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Add custom CSS for the placeholder text color
    const placeholderStyle = {
        '::placeholder': {
            color: '#9CA3AF'
        }
    };

    // Fetch directories based on the current input value
    const fetchDirectories = async (dirPath: string) => {
        setIsLoading(true);
        setError('');

        try {
            // Update the API call to use the new recursive search endpoint
            const queryParams = new URLSearchParams();

            // If we have a directory, use it as a starting point
            if (dirPath) {
                queryParams.append('directory', dirPath);
            }

            // Add the search query parameter if we have input value
            if (value) {
                queryParams.append('query', value);
            }

            // Add excluded folders
            if (excludedFolders && excludedFolders.length > 0) {
                queryParams.append('excludedFolders', JSON.stringify(excludedFolders));
            }

            // Set a reasonable max depth for recursion
            queryParams.append('maxDepth', '3');

            console.log(`DirectoryBrowser: Fetching directories with params:`, Object.fromEntries(queryParams.entries()));

            const response = await fetch(`/api/system/directories?${queryParams.toString()}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch directories: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            console.log(`DirectoryBrowser: Received ${data.directories?.length || 0} directories`);
            setDirectories(data.directories || []);
            setIsLoading(false);
        } catch (error) {
            console.error('Error fetching directories:', error);
            setError(error instanceof Error ? error.message : String(error));
            setDirectories([]);
            setIsLoading(false);
        }
    };

    // Initialize with clientRoot or try to detect it
    useEffect(() => {
        console.log('DirectoryBrowser: initializing with clientRoot:', clientRoot || '(empty)');
        if (clientRoot) {
            setDetectedClientRoot(clientRoot);
            fetchDirectories(clientRoot);
        } else {
            // If no client root provided, call the API which will try to detect it
            fetchDirectories('');
        }
    }, [clientRoot]);

    // Update when client root changes externally
    useEffect(() => {
        if (clientRoot && clientRoot !== detectedClientRoot) {
            setDetectedClientRoot(clientRoot);
        }
    }, [clientRoot]);

    // Handle clicks outside to close the suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Handle input focus
    const handleFocus = () => {
        setIsOpen(true);

        // If we have a value, try to fetch directories for that path or its parent directory
        if (value) {
            // Get the directory part of the path
            const dirPath = path.dirname(value);
            console.log('DirectoryBrowser: Focus - searching in directory:', dirPath);
            fetchDirectories(dirPath);
        } else if (detectedClientRoot) {
            // Otherwise, use detected client root
            console.log('DirectoryBrowser: Focus - using client root:', detectedClientRoot);
            fetchDirectories(detectedClientRoot);
        } else {
            // Last resort - empty query to let server detect
            console.log('DirectoryBrowser: Focus - no path or client root, using empty query');
            fetchDirectories('');
        }
    };

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        onChange(newValue);
        setIsOpen(true); // Keep suggestions open while typing

        // Automatically trigger search when typing
        // We'll always search from client root for recursive search
        const searchDir = detectedClientRoot || '';

        console.log('DirectoryBrowser: Initiating search from client root:', searchDir, 'for query:', newValue);

        // Fetch directories for suggestions with the new value as search query
        fetchDirectories(searchDir);
    };

    // Replace the getFilteredDirectories function - no longer needed with server-side filtering
    const getFilteredDirectories = () => {
        // The API already filters for us based on the search query
        return directories;
    };

    // Update handleSelectDirectory to ensure proper selection and addition to included folders
    const handleSelectDirectory = (dir: Directory) => {
        let newPath = dir.path;

        // If it's the parent directory, we need special handling
        if (dir.name === '..') {
            // If we already have a path, go to its parent
            if (value) {
                newPath = path.dirname(value);
            } else {
                newPath = dir.path;
            }
        }

        // Update the input value with the selected directory
        onChange(newPath);

        // If autoAddSelected is true or onSelect was triggered explicitly, add to included folders
        if (autoAddSelected && onSelect) {
            onSelect(newPath);
        }

        // Close the dropdown
        setIsOpen(false);

        // When a user selects a directory from search results, we want to show that directory's contents next time
        fetchDirectories(newPath);
    };

    // Add function to select current input directly (for the Add Folder button in UI)
    const handleSelectCurrentInput = () => {
        if (!value) return;

        // If onSelect is provided, call it with the current value
        if (onSelect) {
            onSelect(value);
        }

        // Close the dropdown
        setIsOpen(false);
    };

    // Format path for display - show paths relative to client root when possible
    const formatPath = (fullPath: string) => {
        // If we have a client root, try to make the path relative to it
        if (detectedClientRoot && fullPath.toLowerCase().startsWith(detectedClientRoot.toLowerCase())) {
            // Create relative path from client root
            let relativePath = fullPath.substring(detectedClientRoot.length);

            // Clean up path separators
            relativePath = relativePath.replace(/^[\/\\]+/, '');

            if (relativePath === '') {
                return '/ (Client Root)';
            }

            return relativePath;
        }

        return fullPath;
    };

    // Highlight matching parts of text
    const highlightMatch = (text: string, query: string) => {
        if (!query) return text;

        // Normalize query for search
        const normalizedQuery = query.toLowerCase();

        // For path queries, extract the last segment for highlighting
        let searchTerm = normalizedQuery;
        if (normalizedQuery.includes('/') || normalizedQuery.includes('\\')) {
            const segments = normalizedQuery.split(/[\/\\]/);
            searchTerm = segments[segments.length - 1];
        }

        // If search term is empty after extraction, return the text as is
        if (!searchTerm) return text;

        // Try to find the term in the text
        const index = text.toLowerCase().indexOf(searchTerm);

        if (index >= 0) {
            const before = text.substring(0, index);
            const match = text.substring(index, index + searchTerm.length);
            const after = text.substring(index + searchTerm.length);

            // Use a stronger highlight with better contrast
            return `${before}<span style="background-color: #FBBF24; color: #000000; font-weight: 500; padding: 0 2px;">${match}</span>${after}`;
        }

        return text;
    };

    return (
        <div className={`relative w-full ${className}`} style={{ color: '#1F2937' }}>
            <div className="flex items-center">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={value}
                        onChange={handleInputChange}
                        onFocus={handleFocus}
                        onClick={handleFocus}
                        placeholder={placeholder}
                        className={`w-full px-3 py-2 border rounded-md bg-white text-gray-900 placeholder-gray-500 ${inputClassName}`}
                        aria-label="Directory path"
                    />
                    {value && (
                        <button
                            type="button"
                            onClick={() => {
                                onChange('');
                                fetchDirectories(detectedClientRoot || '');
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            aria-label="Clear input"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    )}
                </div>
                {onSelect && (
                    <button
                        onClick={handleSelectCurrentInput}
                        className="ml-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 shrink-0"
                        disabled={!value}
                    >
                        Add Folder
                    </button>
                )}
            </div>

            {isOpen && (
                <div
                    ref={dropdownRef}
                    className={`absolute z-30 w-full min-w-[300px] max-h-64 overflow-y-auto bg-white border border-gray-300 rounded-md shadow-lg mt-1 ${suggestionsClassName}`}
                    style={{ color: '#374151' }} // Ensure text has good contrast with white background
                >
                    {isLoading ? (
                        <div className="p-4 text-center text-gray-700">
                            <div className="flex justify-center items-center">
                                <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Loading directories...
                            </div>
                        </div>
                    ) : error ? (
                        <div className="p-4 text-center text-red-600">
                            <p className="font-semibold">Error loading directories</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    ) : directories.length === 0 ? (
                        <div className="p-4 text-center text-gray-700">
                            No directories found
                        </div>
                    ) : (
                        <div>
                            {/* Display current path as sticky header */}
                            <div className="sticky top-0 bg-gray-100 p-2 border-b border-gray-300 text-xs font-medium text-gray-800">
                                {value ? `Matching: "${value}"` : 'All Directories'}
                            </div>

                            <ul>
                                {getFilteredDirectories().map((dir, index) => (
                                    <li
                                        key={index}
                                        onClick={() => handleSelectDirectory(dir)}
                                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
                                        style={{ color: '#1F2937' }} // Ensure good contrast
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-600 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                        </svg>
                                        <span className="truncate font-medium">
                                            {dir.name === '..' ? (
                                                'Parent Directory'
                                            ) : value ? (
                                                // Highlight matching parts of directory name
                                                <span dangerouslySetInnerHTML={{
                                                    __html: highlightMatch(formatPath(dir.path), value)
                                                }} />
                                            ) : (
                                                formatPath(dir.path)
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
} 