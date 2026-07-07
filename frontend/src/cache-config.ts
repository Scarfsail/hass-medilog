/**
 * Cache configuration and utilities for data stores.
 * Provides consistent cache policies across the application.
 */
export class CacheConfig {
    /** Minimum time between automatic data refreshes (1 minute) */
    static readonly MIN_REFRESH_INTERVAL_MS = 1 * 60 * 1000;
    
    /** Maximum cache age before data is considered stale (5 minutes) */
    static readonly CACHE_EXPIRATION_MS = 5 * 60 * 1000;
    
    /**
     * Check if cached data is stale and should be refreshed.
     * Returns true if data has never been refreshed or if it's older than MIN_REFRESH_INTERVAL_MS.
     * 
     * @param lastRefresh - The date of the last data refresh, or undefined if never refreshed
     * @returns true if data should be refreshed, false otherwise
     */
    static isStale(lastRefresh: Date | undefined): boolean {
        if (!lastRefresh) return true;
        return Date.now() - lastRefresh.getTime() > this.MIN_REFRESH_INTERVAL_MS;
    }

    /**
     * Check if data should be refreshed based on staleness or force flag.
     * 
     * @param lastRefresh - The date of the last data refresh
     * @param forceRefresh - Whether to force refresh regardless of staleness
     * @returns true if data should be refreshed, false otherwise
     */
    static shouldRefresh(lastRefresh: Date | undefined, forceRefresh: boolean = false): boolean {
        return forceRefresh || this.isStale(lastRefresh);
    }
}
