'use client';

import { useEffect } from 'react';

/**
 * This component adds a marker class to the HTML element
 * once the component hydrates, which helps prevent Flash of Unstyled Content (FOUC)
 */
export default function StylesLoadedMarker() {
    useEffect(() => {
        // Short timeout to ensure styles are fully applied
        const timer = setTimeout(() => {
            document.documentElement.classList.add('styles-loaded');
        }, 100);

        return () => clearTimeout(timer);
    }, []);

    // This component doesn't render anything
    return null;
} 