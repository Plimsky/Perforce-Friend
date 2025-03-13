import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/lib/useLocalStorage';
import FolderTreeView from './FolderTreeView';
import TabView from './TabView';
import { getSelectedFolders, getClientRoot, saveClientRoot } from '@/lib/storageUtils';
import { P4Service } from '@/lib/p4Service';

const INCLUSION_FOLDERS_KEY = 'perforceFriend_inclusionFolders';

export default function AppLayout() {
    const [inclusionFoldersString, setInclusionFoldersString] = useLocalStorage<string>(INCLUSION_FOLDERS_KEY, '');
    const [inclusionFolders, setInclusionFolders] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'checkedOut' | 'changed'>('changed');

    // Parse inclusion folders from localStorage on mount
    useEffect(() => {
        // First check if we have inclusion folders saved in the newer format
        const savedFolders = getSelectedFolders();

        if (savedFolders.length > 0) {
            // Use the saved folders from storageUtils
            setInclusionFolders(savedFolders);
            // Also sync them to the old storage format for backward compatibility
            setInclusionFoldersString(savedFolders.join(','));
        } else if (inclusionFoldersString) {
            try {
                const folders = inclusionFoldersString.split(',').filter(f => f.trim() !== '');
                setInclusionFolders(folders);
            } catch (error) {
                console.error('Error parsing inclusion folders:', error);
                setInclusionFolders([]);
            }
        } else {
            setInclusionFolders([]);
        }
    }, [inclusionFoldersString]);

    // Synchronize client root storage on component mount
    useEffect(() => {
        // Sync client root between P4Service and localStorage
        const p4Service = P4Service.getInstance();
        const serviceRoot = p4Service.getClientRoot();
        const storedRoot = getClientRoot();

        console.log("AppLayout: Synchronizing client root storage");
        console.log("- From P4Service:", serviceRoot);
        console.log("- From localStorage:", storedRoot);

        if (serviceRoot && !storedRoot) {
            // If only P4Service has a root, save it to localStorage
            console.log("Saving P4Service root to localStorage:", serviceRoot);
            saveClientRoot(serviceRoot);
        } else if (!serviceRoot && storedRoot) {
            // If only localStorage has a root, save it to P4Service
            console.log("Setting localStorage root in P4Service:", storedRoot);
            p4Service.setClientRoot(storedRoot);
        } else if (serviceRoot && storedRoot && serviceRoot !== storedRoot) {
            // If both have different roots, prefer the P4Service one (it's likely more recent)
            console.log("Client root mismatch! Updating localStorage to match P4Service");
            saveClientRoot(serviceRoot);
        }
    }, []);

    // Handle changes to inclusion folders
    const handleInclusionFoldersChange = (folders: string[]) => {
        setInclusionFolders(folders);
        setInclusionFoldersString(folders.join(','));
    };

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Left panel - Tree view */}
            <div className="w-1/4 border-r border-gray-200 dark:border-gray-700 overflow-auto">
                <FolderTreeView
                    selectedFolders={inclusionFolders}
                    onSelectFolder={handleInclusionFoldersChange}
                />
            </div>

            {/* Right panel - Tabbed view */}
            <div className="w-3/4 overflow-hidden">
                <TabView
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    inclusionFolders={inclusionFolders}
                    onInclusionFoldersChange={handleInclusionFoldersChange}
                />
            </div>
        </div>
    );
} 