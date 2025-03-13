import { useState, useEffect } from 'react';
import ModifiedFilesList from './ModifiedFilesList';
import CheckedOutFilesList from './CheckedOutFilesList';
import { ModifiedFile } from '@/types/modifiedFiles';
import { P4CheckedOutFile } from '@/types/p4';

interface TabViewProps {
    activeTab: 'checkedOut' | 'changed';
    onTabChange: (tab: 'checkedOut' | 'changed') => void;
    inclusionFolders: string[];
    onInclusionFoldersChange: (folders: string[]) => void;
}

export default function TabView({
    activeTab,
    onTabChange,
    inclusionFolders,
    onInclusionFoldersChange
}: TabViewProps) {
    const [checkedOutFiles, setCheckedOutFiles] = useState<P4CheckedOutFile[]>([]);
    const [modifiedFiles, setModifiedFiles] = useState<ModifiedFile[]>([]);
    const [isLoadingCheckedOut, setIsLoadingCheckedOut] = useState(false);
    const [isLoadingModified, setIsLoadingModified] = useState(false);
    const [checkedOutError, setCheckedOutError] = useState<string | null>(null);
    const [modifiedError, setModifiedError] = useState<string | null>(null);
    const [lastChecked, setLastChecked] = useState<string | null>(null);

    // Update any useEffects that might be automatically loading modified files
    useEffect(() => {
        // Don't automatically load modified files on tab change or component mount
        // We'll rely on the explicit Scan button for this
        if (activeTab === 'checkedOut') {
            loadCheckedOutFiles();
        }
        // We deliberately don't call loadModifiedFiles() here to avoid automatic scanning
    }, [activeTab]);

    // Load checked out files
    const loadCheckedOutFiles = async () => {
        setIsLoadingCheckedOut(true);
        try {
            const response = await fetch('/api/p4/files/opened');
            const data = await response.json();

            if (data.success) {
                setCheckedOutFiles(data.files || []);
                setCheckedOutError(null);
            } else {
                setCheckedOutError(data.error || 'Failed to load checked out files');
            }
        } catch (error) {
            setCheckedOutError('Error loading checked out files');
            console.error('Error loading checked out files:', error);
        } finally {
            setIsLoadingCheckedOut(false);
        }
    };

    // Load modified files
    const loadModifiedFiles = async (skipScan: boolean = false) => {
        setIsLoadingModified(true);
        try {
            // Build URL with parameters
            const url = new URL('/api/p4/files/modified', window.location.origin);
            url.searchParams.set('maxFiles', '1000');

            // Add inclusion folders if specified
            if (inclusionFolders.length > 0) {
                url.searchParams.set('inclusionFolders', inclusionFolders.join(','));
            }

            // Set skipScan parameter - when called from the refresh button, this will be false
            // and the scan will run. When called automatically, this will be true and the scan won't run.
            url.searchParams.set('skipScan', skipScan ? 'true' : 'false');

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store'
            });

            const data = await response.json();

            if (data.success) {
                setModifiedFiles(data.files || []);
                setLastChecked(new Date().toISOString());
                setModifiedError(null);
            } else {
                setModifiedError(data.error || 'Failed to load modified files');
            }
        } catch (error) {
            setModifiedError('Error loading modified files');
            console.error('Error loading modified files:', error);
        } finally {
            setIsLoadingModified(false);
        }
    };

    // Handle refresh action
    const handleRefresh = () => {
        if (activeTab === 'checkedOut') {
            loadCheckedOutFiles();
        } else {
            // When user explicitly requests refresh, run the scan (skipScan = false)
            loadModifiedFiles(false);
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Tab navigation */}
            <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'changed'
                        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    onClick={() => onTabChange('changed')}
                >
                    Changed Files
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'checkedOut'
                        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    onClick={() => onTabChange('checkedOut')}
                >
                    Checked Out Files
                </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto p-4">
                {activeTab === 'checkedOut' ? (
                    <CheckedOutFilesList
                        files={checkedOutFiles}
                        isLoading={isLoadingCheckedOut}
                        error={checkedOutError || undefined}
                    />
                ) : (
                    <ModifiedFilesList
                        files={modifiedFiles}
                        isLoading={isLoadingModified}
                        error={modifiedError}
                        onRefresh={loadModifiedFiles}
                        lastChecked={lastChecked}
                        inclusionFolders={inclusionFolders}
                        onInclusionFoldersChange={onInclusionFoldersChange}
                    />
                )}
            </div>
        </div>
    );
} 