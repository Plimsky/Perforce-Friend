'use client';

import { useState, useEffect } from 'react';
import { P4CommandLog } from '../types/p4';
import { P4Service } from '../lib/p4Service';

interface P4CommandLogViewerProps {
    isOpen: boolean;
    onClose: () => void;
}

// Helper function to parse command details
function parseCommandDetails(command: string): {
    baseCommand: string;
    details: { [key: string]: string }
} {
    // Extract base command and details section
    const detailsMatch = command.match(/^(.*?)(?:\s+\[(.*)\])?$/);

    if (!detailsMatch) {
        return { baseCommand: command, details: {} };
    }

    const baseCommand = detailsMatch[1];
    const detailsStr = detailsMatch[2] || '';

    // Parse details into key-value pairs
    const details: { [key: string]: string } = {};
    if (detailsStr) {
        detailsStr.split(' | ').forEach(pair => {
            const [key, value] = pair.split(': ');
            if (key && value) {
                details[key] = value;
            }
        });
    }

    return { baseCommand, details };
}

export default function P4CommandLogViewer({ isOpen, onClose }: P4CommandLogViewerProps) {
    const [logs, setLogs] = useState<P4CommandLog[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            loadLogs();
        }
    }, [isOpen]);

    const loadLogs = () => {
        const p4Service = P4Service.getInstance();
        const commandLogs = p4Service.getCommandLogs();
        setLogs(commandLogs);
    };

    const clearLogs = () => {
        const p4Service = P4Service.getInstance();
        p4Service.clearCommandLogs();
        setLogs([]);
    };

    const formatDate = (isoDate: string) => {
        try {
            const date = new Date(isoDate);
            return date.toLocaleString();
        } catch (e) {
            return isoDate;
        }
    };

    const filteredLogs = searchTerm.trim() === ''
        ? logs
        : logs.filter(log => log.command.toLowerCase().includes(searchTerm.toLowerCase()));

    // Add additional columns
    const formatTime = (timeStr: string | undefined) => {
        if (!timeStr) return '';

        // If it's just a number with 's' suffix like '2.3s'
        if (timeStr.endsWith('s') && !isNaN(parseFloat(timeStr))) {
            const seconds = parseFloat(timeStr);
            if (seconds < 1) {
                return `${(seconds * 1000).toFixed(0)}ms`;
            }
            return `${seconds.toFixed(1)}s`;
        }

        return timeStr;
    };

    // Handle command styling based on status
    const getCommandStyle = (command: string) => {
        if (command.includes('COMPLETED')) {
            return 'text-green-700 dark:text-green-400';
        } else if (command.includes('FAILED') || command.includes('SKIPPED')) {
            return 'text-red-600 dark:text-red-400';
        }
        return 'text-gray-900 dark:text-gray-100';
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-4/5 h-4/5 max-w-7xl overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Perforce Command Logs</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6">
                    <div className="flex space-x-4 mb-4">
                        <div className="grow">
                            <input
                                type="text"
                                placeholder="Search commands..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-xs focus:outline-hidden focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                            />
                        </div>
                        <button
                            onClick={clearLogs}
                            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                            Clear Logs
                        </button>
                        <button
                            onClick={loadLogs}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            Refresh
                        </button>
                    </div>

                    <div className="mt-4 h-[calc(100vh-16rem)] overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-md">
                        {filteredLogs.length > 0 ? (
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">Timestamp</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Command</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Time</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Status</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Folder</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredLogs.map((log, index) => {
                                        const { baseCommand, details } = parseCommandDetails(log.command);
                                        const executionTime = formatTime(details.executionTime);
                                        const status = details.status || (
                                            baseCommand.includes('COMPLETED') ? 'completed' :
                                                baseCommand.includes('FAILED') ? 'failed' :
                                                    baseCommand.includes('SKIPPED') ? 'skipped' : ''
                                        );
                                        const folder = details.folder || '';

                                        return (
                                            <tr key={index} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'}>
                                                <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                                    {formatDate(log.timestamp)}
                                                </td>
                                                <td className={`px-3 py-3 text-sm font-mono break-all ${getCommandStyle(log.command)}`}>
                                                    {baseCommand.replace(/ - COMPLETED$/, '')}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                                    {executionTime}
                                                </td>
                                                <td className={`px-3 py-3 whitespace-nowrap text-xs ${status === 'success' || status === 'completed' ? 'text-green-600 dark:text-green-400' :
                                                    status === 'error' || status === 'failed' ? 'text-red-600 dark:text-red-400' :
                                                        status === 'skipped' ? 'text-yellow-600 dark:text-yellow-400' :
                                                            'text-gray-500 dark:text-gray-400'
                                                    }`}>
                                                    {status}
                                                </td>
                                                <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 truncate" title={folder}>
                                                    {folder}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                                {searchTerm ? 'No matching command logs found.' : 'No command logs found.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
} 