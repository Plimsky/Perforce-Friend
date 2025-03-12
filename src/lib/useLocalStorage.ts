"use client";

import { useState, useEffect } from "react";

/**
 * A hook that provides persistent storage using localStorage
 * with automatic serialization/deserialization of values
 *
 * @param key The localStorage key to use for storing the value
 * @param initialValue The initial value to use if no value is found in localStorage
 * @returns A stateful value and a function to update it
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
    // Get from local storage then parse stored json or return initialValue
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            // Get from local storage by key
            if (typeof window !== "undefined") {
                const item = window.localStorage.getItem(key);
                console.log(`[useLocalStorage] Reading key ${key}:`, item);

                // Parse stored json or if none return initialValue
                return item ? JSON.parse(item) : initialValue;
            }
            return initialValue;
        } catch (error) {
            console.warn(`[useLocalStorage] Error reading localStorage key "${key}":`, error);
            return initialValue;
        }
    });

    // Return a wrapped version of useState's setter function that persists the new value to localStorage
    const setValue = (value: T | ((val: T) => T)) => {
        try {
            // Allow value to be a function so we have the same API as useState
            const valueToStore = value instanceof Function ? value(storedValue) : value;

            // Save to state
            setStoredValue(valueToStore);

            // Save to local storage
            if (typeof window !== "undefined") {
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
                console.log(`[useLocalStorage] Saving key ${key}:`, valueToStore);
            }
        } catch (error) {
            console.warn(`[useLocalStorage] Error setting localStorage key "${key}":`, error);
        }
    };

    // Listen for changes to this localStorage key from other tabs/windows
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === key && e.newValue) {
                console.log(`[useLocalStorage] Key "${key}" changed in another tab`);
                setStoredValue(JSON.parse(e.newValue));
            }
        };

        // Window event listener
        if (typeof window !== "undefined") {
            window.addEventListener("storage", handleStorageChange);

            // Clean up
            return () => {
                window.removeEventListener("storage", handleStorageChange);
            };
        }
    }, [key]);

    return [storedValue, setValue] as const;
}

// Default export for backward compatibility
export default useLocalStorage;
