import React from 'react';

interface ItemsPerPageSelectorProps {
    itemsPerPage: number;
    onChange: (value: number) => void;
    options?: number[];
}

const ItemsPerPageSelector: React.FC<ItemsPerPageSelectorProps> = ({
    itemsPerPage,
    onChange,
    options = [10, 20, 50, 100]
}) => {
    return (
        <div className="flex items-center text-sm">
            <label htmlFor="items-per-page" className="mr-2 text-gray-600 dark:text-gray-400">
                Items per page:
            </label>
            <select
                id="items-per-page"
                value={itemsPerPage}
                onChange={(e) => onChange(parseInt(e.target.value, 10))}
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm py-1 px-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm"
            >
                {options.map(option => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default ItemsPerPageSelector; 