import React from 'react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    pagesToShow?: number;
}

const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    onPageChange,
    pagesToShow = 5
}) => {
    if (totalPages <= 1) return null;

    // Determine which page numbers to show
    let startPage = Math.max(1, currentPage - Math.floor(pagesToShow / 2));
    let endPage = startPage + pagesToShow - 1;

    if (endPage > totalPages) {
        endPage = totalPages;
        startPage = Math.max(1, endPage - pagesToShow + 1);
    }

    const pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
    }

    return (
        <div className="flex items-center justify-center space-x-2 mt-4">
            <button
                onClick={() => onPageChange(1)}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded-md text-sm ${currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800'
                    : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    } border border-gray-300 dark:border-gray-600`}
                aria-label="First page"
            >
                «
            </button>

            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded-md text-sm ${currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800'
                    : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    } border border-gray-300 dark:border-gray-600`}
                aria-label="Previous page"
            >
                ‹
            </button>

            {startPage > 1 && (
                <span className="px-3 py-1 text-gray-500 dark:text-gray-400">...</span>
            )}

            {pageNumbers.map(number => (
                <button
                    key={number}
                    onClick={() => onPageChange(number)}
                    className={`px-3 py-1 rounded-md text-sm ${currentPage === number
                        ? 'bg-primary-600 text-white dark:bg-primary-700'
                        : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                        } border border-gray-300 dark:border-gray-600`}
                    aria-label={`Page ${number}`}
                    aria-current={currentPage === number ? 'page' : undefined}
                >
                    {number}
                </button>
            ))}

            {endPage < totalPages && (
                <span className="px-3 py-1 text-gray-500 dark:text-gray-400">...</span>
            )}

            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded-md text-sm ${currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800'
                    : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    } border border-gray-300 dark:border-gray-600`}
                aria-label="Next page"
            >
                ›
            </button>

            <button
                onClick={() => onPageChange(totalPages)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded-md text-sm ${currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800'
                    : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    } border border-gray-300 dark:border-gray-600`}
                aria-label="Last page"
            >
                »
            </button>
        </div>
    );
};

export default Pagination; 